-- 1) التسجيل المتأخّر مسموح لكن دون نقاط: «متأخّر» يُحدَّد لحظة التسجيل (مدّة التعمير وقتها) ولا يتغيّر بعدها
-- 2) قيمة لكل تسجيل: عدد الصفحات (عدّاد القرآن) أو نسبة النجاح (الأسئلة التفاعلية)؛ النقاط = نقاط المهمة × القيمة
-- 3) محتوى مُرسَل (ملف، رسالة صوتية، ملاحظة) في payload
alter table public.habit_logs add column if not exists value numeric check (value is null or (value >= 0 and value <= 1000));
alter table public.habit_logs add column if not exists payload jsonb
  check (payload is null or (jsonb_typeof(payload) = 'object' and pg_column_size(payload) < 20000));
alter table public.habit_logs add column if not exists late boolean not null default false;

create or replace function public.mark_late() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- تسجيل المشرف (تصحيح) لا يكون متأخّرًا أبدًا
  new.late := new.day <= public.today_tn() - public.edit_days()
              and not coalesce((select is_admin from public.profiles where id = auth.uid()), false);
  return new;
end $$;
revoke execute on function public.mark_late() from public, anon, authenticated;
drop trigger if exists habit_logs_late on public.habit_logs;
create trigger habit_logs_late before insert on public.habit_logs for each row execute function public.mark_late();

-- التسجيل: أي يوم فات منذ بداية المهمة (لا مستقبل)
alter policy "logs2 insert" on public.habit_logs with check (
  day <= public.today_tn()
  and (select public.is_approved())
  and exists (select 1 from public.challenges c where c.id = challenge_id and c.active
              and day >= c.start_date and (c.end_date is null or day <= c.end_date)
              and item < coalesce(array_length(c.items, 1), 1)
              and (c.kind = 'daily' or not public.once_done(member_id, challenge_id)))
  and ((select public.owns_member(member_id)) or (select public.is_admin()))
);
alter policy "logs2 delete" on public.habit_logs using ((select public.owns_member(member_id)) or (select public.is_admin()));

-- نوعان جديدان: أسئلة تفاعلية، وإرسال ملف أو رسالة صوتية
alter table public.challenges drop constraint if exists challenges_type_check;
alter table public.challenges add constraint challenges_type_check
  check (type in ('prayer', 'quran', 'adhkar', 'book', 'video', 'custom', 'quiz', 'submit'));
alter table public.challenges drop constraint if exists challenges_meta_check;
alter table public.challenges add constraint challenges_meta_check
  check (meta is null or (jsonb_typeof(meta) = 'object' and pg_column_size(meta) < 200000));

-- الترتيب: التسجيلات المتأخّرة لا تُحتسب، والنقاط × القيمة
create or replace function public.ranking2(p_challenge bigint default null, p_period text default 'all')
returns table (member_id bigint, name text, points integer, bonus integer, days integer, total integer,
               streak integer, perfect integer, is_mine boolean, avatar_url text)
language sql stable security definer set search_path = '' as $$
  with t as (select public.today_tn() as d),
  win as (
    select t.d, case p_period
      when 'week' then t.d - ((extract(isodow from t.d))::int - 1)
      when 'month' then date_trunc('month', t.d)::date
      else date '0001-01-01' end as from_day
    from t
  ),
  cfg as (
    select
      coalesce((select (value #>> '{}')::int from public.app_settings where key = 'perfect_bonus'), 10) as pb,
      coalesce((select (value #>> '{}')::int from public.app_settings where key = 'streak_bonus'), 10) as sb
  ),
  ch as (
    select c.id, c.points, c.kind, c.active, c.start_date, least(coalesce(c.end_date, w.d), w.d) as last_day,
      coalesce(array_length(c.items, 1), 1) as n
    from public.challenges c, win w
    where public.is_approved() and (c.active or (c.id = p_challenge and public.is_admin()))
  ),
  sel as (select * from ch where p_challenge is null or id = p_challenge),
  logs as (
    select l.member_id, l.challenge_id, l.day, ch.points * coalesce(l.value, 1) as points, ch.n, ch.kind
    from public.habit_logs l join ch on ch.id = l.challenge_id
    where l.day between ch.start_date and ch.last_day and not l.late
  ),
  full_days as (
    select member_id, challenge_id, day, kind from logs group by member_id, challenge_id, day, kind, n having count(*) >= n
  ),
  isl as (
    select member_id, challenge_id, day,
      day - (row_number() over (partition by member_id, challenge_id order by day))::int as grp
    from full_days where kind = 'daily'
  ),
  pos as (
    select member_id, challenge_id, day, grp,
      row_number() over (partition by member_id, challenge_id, grp order by day) as k
    from isl
  ),
  cur as (
    select p.member_id, p.challenge_id, max(p.k)::int as s
    from pos p join ch on ch.id = p.challenge_id
    group by p.member_id, p.challenge_id, p.grp, ch.last_day
    having max(p.day) >= ch.last_day - 1
  ),
  perfect as (
    select f.member_id, f.day from full_days f join ch on ch.id = f.challenge_id and ch.active
    where f.kind = 'daily'
    group by f.member_id, f.day
    having count(*) = (select count(*) from ch d where d.active and d.kind = 'daily' and f.day between d.start_date and d.last_day)
  ),
  span as (
    select greatest(min(sel.start_date), (select from_day from win)) as from_day, max(sel.last_day) as last_day from sel
  ),
  scored as (
    select m.id, m.name, m.account_id, m.joined_on, m.avatar_url,
      round(coalesce((select sum(l.points) from logs l, win where l.member_id = m.id and l.day >= win.from_day
                and l.challenge_id in (select id from sel)), 0))::int as base,
      ((select count(*) from pos p, win where p.member_id = m.id and p.k % 7 = 0 and p.day >= win.from_day
                and p.challenge_id in (select id from sel)) * (select sb from cfg)
       + case when p_challenge is null then
           (select count(*) from perfect p, win where p.member_id = m.id and p.day >= win.from_day) * (select pb from cfg)
         else 0 end)::int as bonus,
      (select count(*) from full_days f, win where f.member_id = m.id and f.day >= win.from_day
                and f.challenge_id in (select id from sel))::int as days,
      (select count(*) from perfect p, win where p.member_id = m.id and p.day >= win.from_day)::int as perfect,
      coalesce((select max(c.s) from cur c where c.member_id = m.id and c.challenge_id in (select id from sel)), 0) as streak
    from public.members m join public.profiles pr on pr.id = m.account_id and (pr.status = 'approved' or pr.is_admin)
    where exists (select 1 from sel)
  )
  select s.id, s.name, s.base + s.bonus, s.bonus, s.days,
    greatest(0, (select span.last_day - greatest(span.from_day, least(s.joined_on,
      coalesce((select min(l.day) from logs l where l.member_id = s.id), s.joined_on))) + 1 from span))::int,
    s.streak, s.perfect, s.account_id = auth.uid(), s.avatar_url
  from scored s
  order by 3 desc, 5 desc, 7 desc, 2
$$;

-- الملفات والرسائل الصوتية المُرسَلة: خاصة (صاحبها والمشرف فقط)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 26214400,
  array['image/*', 'audio/*', 'video/*', 'application/pdf', 'text/plain', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;
create policy "submissions own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_approved()));
create policy "submissions own or admin read" on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
create policy "submissions own or admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'submissions' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
