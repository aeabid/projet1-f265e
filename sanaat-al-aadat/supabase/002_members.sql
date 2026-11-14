-- عدة مشاركين (أبناء) في الحساب الواحد: الأيام والترتيب لكل مشارك
-- النسخة القديمة (يوم لكل حساب) تبقى محفوظة باسم آخر دون حذف
alter table public.habit_logs rename to habit_logs_v1;
alter index public.habit_logs_challenge_idx rename to habit_logs_v1_challenge_idx;
alter function public.leaderboard(bigint, text) rename to leaderboard_v1;
revoke execute on function public.leaderboard_v1(bigint, text) from public, anon, authenticated;

create table public.members (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  joined_on date not null default public.today_tn(),
  created_at timestamptz not null default now()
);
create index members_account_idx on public.members (account_id);

create table public.habit_logs (
  member_id bigint not null references public.members (id) on delete cascade,
  challenge_id bigint not null references public.challenges (id) on delete cascade,
  day date not null,
  recorded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (member_id, challenge_id, day)
);
create index habit_logs_challenge_idx on public.habit_logs (challenge_id, day);

create or replace function public.owns_member(p_member bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members where id = p_member and account_id = auth.uid())
$$;
create or replace function public.my_member_count() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.members where account_id = auth.uid()
$$;
revoke execute on function public.my_member_count() from public, anon;
grant execute on function public.my_member_count() to authenticated;
revoke execute on function public.owns_member(bigint) from public, anon;
grant execute on function public.owns_member(bigint) to authenticated;

alter table public.members enable row level security;
alter table public.habit_logs enable row level security;

-- المشاركون: كل حساب يدير أبناءه (15 على الأقصى)، والمشرف يرى الكل
create policy "members read own or admin" on public.members for select to authenticated
  using (account_id = (select auth.uid()) or (select public.is_admin()));
create policy "members insert own" on public.members for insert to authenticated with check (
  account_id = (select auth.uid())
  and (select public.my_member_count()) < 15
);
create policy "members update own" on public.members for update to authenticated
  using (account_id = (select auth.uid()) or (select public.is_admin()))
  with check (account_id = (select auth.uid()) or (select public.is_admin()));
create policy "members delete own" on public.members for delete to authenticated
  using (account_id = (select auth.uid()) or (select public.is_admin()));
revoke update on public.members from authenticated;
grant update (name) on public.members to authenticated;

-- الأيام: الحساب يسجّل لأبنائه (لا مستقبل، آخر 7 أيام)، والمشرف لأي مشارك وأي يوم فات
create policy "logs2 read own or admin" on public.habit_logs for select to authenticated
  using ((select public.owns_member(member_id)) or (select public.is_admin()));
create policy "logs2 insert" on public.habit_logs for insert to authenticated with check (
  day <= public.today_tn()
  and exists (select 1 from public.challenges c where c.id = challenge_id and c.active
              and day >= c.start_date and (c.end_date is null or day <= c.end_date))
  and (((select public.owns_member(member_id)) and day > public.today_tn() - 7) or (select public.is_admin()))
);
create policy "logs2 delete" on public.habit_logs for delete to authenticated using (
  ((select public.owns_member(member_id)) and day > public.today_tn() - 7) or (select public.is_admin())
);

-- الترتيب للجميع: اسم المشارك وعدد الأيام والسلسلة فقط
create or replace function public.leaderboard(p_challenge bigint, p_period text default 'all')
returns table (member_id bigint, name text, days integer, total integer, streak integer, is_mine boolean)
language sql stable security definer set search_path = '' as $$
  with c as (
    select ch.*, least(coalesce(ch.end_date, public.today_tn()), public.today_tn()) as last_day
    from public.challenges ch
    where ch.id = p_challenge and (ch.active or public.is_admin()) and auth.uid() is not null
  ),
  win as (
    select c.*, greatest(c.start_date, case p_period
      when 'week' then public.today_tn() - ((extract(isodow from public.today_tn())::int) - 1)
      when 'month' then date_trunc('month', public.today_tn())::date
      else c.start_date end) as from_day
    from c
  ),
  logs as (
    select l.member_id, l.day from public.habit_logs l, win
    where l.challenge_id = win.id and l.day between win.start_date and win.last_day
  ),
  islands as (
    select member_id, day, day - (row_number() over (partition by member_id order by day))::int as grp from logs
  ),
  streaks as (
    select member_id, count(*)::int as streak from islands i, win
    group by member_id, grp, win.last_day
    having max(day) >= win.last_day - 1
  )
  select m.id, m.name,
    (select count(*)::int from logs l, win where l.member_id = m.id and l.day >= win.from_day),
    greatest(0, (select win.last_day - greatest(win.from_day, least(m.joined_on,
      coalesce((select min(l.day) from logs l where l.member_id = m.id), m.joined_on))) + 1 from win))::int,
    coalesce((select s.streak from streaks s where s.member_id = m.id), 0),
    m.account_id = auth.uid()
  from public.members m, win
  order by 3 desc, 5 desc, 2
$$;
revoke execute on function public.leaderboard(bigint, text) from public, anon;
grant execute on function public.leaderboard(bigint, text) to authenticated;

-- المشرفون: الإيميلان
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, is_admin)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
                  nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
                  split_part(new.email, '@', 1), 'مشارك'), 60),
    lower(new.email) in ('abid.alaa@gmail.com', 'abid.alaa29@gmail.com')
  );
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
update public.profiles p set is_admin = true from auth.users u
  where u.id = p.id and lower(u.email) in ('abid.alaa@gmail.com', 'abid.alaa29@gmail.com');
