-- كل مشارك بحسابه (مشارك واحد لكل حساب يُنشأ تلقائيًا)، قبول المشرف، وصورة لكل مشارك

alter table public.profiles add column if not exists status text not null default 'pending'
  check (status in ('pending', 'approved', 'rejected'));
-- الحسابات الموجودة مقبولة
update public.profiles set status = 'approved';
alter table public.members add column if not exists avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500);

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select status = 'approved' or is_admin from public.profiles where id = auth.uid()), false)
$$;
revoke execute on function public.is_approved() from public, anon;
grant execute on function public.is_approved() to authenticated;

-- حساب جديد: ملف شخصي (في الانتظار، والمشرف مقبول دائمًا) ومشارك واحد باسمه
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  nm text := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
                           nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
                           nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
                           split_part(new.email, '@', 1), 'مشارك'), 60);
  adm boolean := lower(new.email) = 'abid.alaa@gmail.com';
begin
  insert into public.profiles (id, display_name, is_admin, status)
  values (new.id, nm, adm, case when adm then 'approved' else 'pending' end);
  insert into public.members (account_id, name, avatar_url)
  values (new.id, nm, left(nullif(new.raw_user_meta_data ->> 'avatar_url', ''), 500));
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- مشارك واحد فقط لكل حساب
alter policy "members insert own" on public.members with check (
  account_id = (select auth.uid()) and (select public.my_member_count()) < 1
);
grant update (name, avatar_url) on public.members to authenticated;

-- لا تسجيل ولا مهام قبل القبول
alter policy "logs2 insert" on public.habit_logs with check (
  day <= public.today_tn()
  and (select public.is_approved())
  and exists (select 1 from public.challenges c where c.id = challenge_id and c.active
              and day >= c.start_date and (c.end_date is null or day <= c.end_date)
              and item < coalesce(array_length(c.items, 1), 1)
              and (c.kind = 'daily' or not public.once_done(member_id, challenge_id)))
  and (((select public.owns_member(member_id)) and day > public.today_tn() - public.edit_days()) or (select public.is_admin()))
);
alter policy "challenges read" on public.challenges using ((active and (select public.is_approved())) or (select public.is_admin()));

-- المشرف: قائمة الحسابات (مع الإيميل وطريقة الدخول) وتغيير حالتها
create or replace function public.admin_accounts()
returns table (id uuid, display_name text, email text, provider text, status text, created_at timestamptz,
               member_id bigint, member_name text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, u.email::text, coalesce(u.raw_app_meta_data ->> 'provider', 'email'), p.status, p.created_at,
    m.id, m.name, m.avatar_url
  from public.profiles p join auth.users u on u.id = p.id
  left join lateral (select * from public.members x where x.account_id = p.id order by x.id limit 1) m on true
  where public.is_admin()
  order by (p.status = 'pending') desc, p.created_at desc
$$;
revoke execute on function public.admin_accounts() from public, anon;
grant execute on function public.admin_accounts() to authenticated;

create or replace function public.set_account_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'bad status'; end if;
  update public.profiles set status = p_status where id = p_id and not is_admin;
end $$;
revoke execute on function public.set_account_status(uuid, text) from public, anon;
grant execute on function public.set_account_status(uuid, text) to authenticated;

-- الترتيب: المقبولون فقط، مع الصورة (تغيير نوع النتيجة يتطلّب إعادة الإنشاء)
drop function if exists public.ranking2(bigint, text);
create function public.ranking2(p_challenge bigint default null, p_period text default 'all')
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
    select m.id, m.name, m.account_id, m.joined_on, m.avatar_url,
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
revoke execute on function public.ranking2(bigint, text) from public, anon;
grant execute on function public.ranking2(bigint, text) to authenticated;

-- الصور: قراءة للعموم، كل واحد يرفع في مجلّده (معرّف حسابه)، والمشرف في كل مكان
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "avatars own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
create policy "avatars own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
create policy "avatars own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
