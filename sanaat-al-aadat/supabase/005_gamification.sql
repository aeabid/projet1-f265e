-- النسخة 2: أنواع المهام (يومية / مرة واحدة)، ملفات PDF وسؤال تحقّق، مكافآت اليوم المثالي والسلسلة، ترتيب جديد
-- كل التغييرات إضافية: الدالة القديمة ranking تبقى كما هي

alter table public.challenges add column if not exists kind text not null default 'daily' check (kind in ('daily', 'once'));
alter table public.challenges add column if not exists pdf_url text check (pdf_url is null or char_length(pdf_url) <= 500);
-- سؤال تحقّق اختياري: {"q": "...", "choices": ["...", "..."], "answer": 0}
alter table public.challenges add column if not exists quiz jsonb check (quiz is null or jsonb_typeof(quiz) = 'object');
alter table public.challenges drop constraint if exists challenges_icon_check;
alter table public.challenges add constraint challenges_icon_check check (char_length(icon) <= 16);

insert into public.app_settings (key, value) values ('perfect_bonus', '10'), ('streak_bonus', '10')
  on conflict (key) do nothing;

-- مهمة «مرة واحدة» أُنجزت من قبل؟ (security definer لتفادي الرجوع إلى سياسات نفس الجدول)
create or replace function public.once_done(p_member bigint, p_challenge bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.habit_logs where member_id = p_member and challenge_id = p_challenge)
$$;
revoke execute on function public.once_done(bigint, bigint) from public, anon;
grant execute on function public.once_done(bigint, bigint) to authenticated;

alter policy "logs2 insert" on public.habit_logs with check (
  day <= public.today_tn()
  and exists (select 1 from public.challenges c where c.id = challenge_id and c.active
              and day >= c.start_date and (c.end_date is null or day <= c.end_date)
              and item < coalesce(array_length(c.items, 1), 1)
              and (c.kind = 'daily' or not public.once_done(member_id, challenge_id)))
  and (((select public.owns_member(member_id)) and day > public.today_tn() - public.edit_days()) or (select public.is_admin()))
);

-- الترتيب v2: p_challenge = null للترتيب العام
-- النقاط = نقاط كل عنصر منجز + مكافأة كل 7 أيام متتالية في مهمة يومية + مكافأة اليوم المثالي (كل المهام اليومية كاملة، في الترتيب العام فقط)
create or replace function public.ranking2(p_challenge bigint default null, p_period text default 'all')
returns table (member_id bigint, name text, points integer, bonus integer, days integer, total integer,
               streak integer, perfect integer, is_mine boolean)
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
    where auth.uid() is not null and (c.active or (c.id = p_challenge and public.is_admin()))
  ),
  sel as (select * from ch where p_challenge is null or id = p_challenge),
  logs as (
    select l.member_id, l.challenge_id, l.day, ch.points, ch.n, ch.kind
    from public.habit_logs l join ch on ch.id = l.challenge_id
    where l.day between ch.start_date and ch.last_day
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
    select m.id, m.name, m.account_id, m.joined_on,
      coalesce((select sum(l.points) from logs l, win where l.member_id = m.id and l.day >= win.from_day
                and l.challenge_id in (select id from sel)), 0)::int as base,
      ((select count(*) from pos p, win where p.member_id = m.id and p.k % 7 = 0 and p.day >= win.from_day
                and p.challenge_id in (select id from sel)) * (select sb from cfg)
       + case when p_challenge is null then
           (select count(*) from perfect p, win where p.member_id = m.id and p.day >= win.from_day) * (select pb from cfg)
         else 0 end)::int as bonus,
      (select count(*) from full_days f, win where f.member_id = m.id and f.day >= win.from_day
                and f.challenge_id in (select id from sel))::int as days,
      (select count(*) from perfect p, win where p.member_id = m.id and p.day >= win.from_day)::int as perfect,
      coalesce((select max(c.s) from cur c where c.member_id = m.id and c.challenge_id in (select id from sel)), 0) as streak
    from public.members m
    where exists (select 1 from sel)
  )
  select s.id, s.name, s.base + s.bonus, s.bonus, s.days,
    greatest(0, (select span.last_day - greatest(span.from_day, least(s.joined_on,
      coalesce((select min(l.day) from logs l where l.member_id = s.id), s.joined_on))) + 1 from span))::int,
    s.streak, s.perfect, s.account_id = auth.uid()
  from scored s
  order by 3 desc, 5 desc, 7 desc, 2
$$;
revoke execute on function public.ranking2(bigint, text) from public, anon;
grant execute on function public.ranking2(bigint, text) to authenticated;

-- ملفات المهام (PDF): قراءة للعموم، رفع وحذف للمشرف فقط
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-files', 'task-files', true, 26214400, array['application/pdf'])
on conflict (id) do nothing;
create policy "task files admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files' and (select public.is_admin()));
create policy "task files admin update" on storage.objects for update to authenticated
  using (bucket_id = 'task-files' and (select public.is_admin()));
create policy "task files admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'task-files' and (select public.is_admin()));
