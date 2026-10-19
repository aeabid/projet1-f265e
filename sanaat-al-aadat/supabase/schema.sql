-- صناعة العادات: الحسابات، التحديات، والأيام المنجزة
-- اليوم بتوقيت تونس
create or replace function public.today_tn() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Africa/Tunis')::date $$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  is_admin boolean not null default false,
  joined_on date not null default public.today_tn(),
  created_at timestamptz not null default now()
);

create table public.challenges (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 80),
  icon text check (char_length(icon) <= 8),
  description text check (char_length(description) <= 300),
  start_date date not null default public.today_tn(),
  end_date date,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table public.habit_logs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  challenge_id bigint not null references public.challenges (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, challenge_id, day)
);
create index habit_logs_challenge_idx on public.habit_logs (challenge_id, day);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- حساب جديد (Google أو إيميل): ملف شخصي باسمه؛ صاحب المشروع مشرف
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
    lower(new.email) = 'abid.alaa@gmail.com'
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.challenges enable row level security;
alter table public.habit_logs enable row level security;

-- الأسماء يراها كل المسجّلين (للترتيب)، وكل واحد يبدّل اسمه فقط
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- التحديات: الجميع يقرأ المفتوحة، المشرف يدير
create policy "challenges read" on public.challenges for select to authenticated using (active or (select public.is_admin()));
create policy "challenges admin insert" on public.challenges for insert to authenticated with check ((select public.is_admin()));
create policy "challenges admin update" on public.challenges for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "challenges admin delete" on public.challenges for delete to authenticated using ((select public.is_admin()));

-- الأيام: كل واحد يرى أيامه، والمشرف يرى الكل
create policy "logs read own or admin" on public.habit_logs for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
-- التسجيل: لنفسك، تحدٍّ مفتوح، داخل فترته، لا مستقبل، وآخر 7 أيام (المشرف: أي يوم فات ولأي شخص)
create policy "logs insert" on public.habit_logs for insert to authenticated with check (
  day <= public.today_tn()
  and exists (select 1 from public.challenges c where c.id = challenge_id and c.active
              and day >= c.start_date and (c.end_date is null or day <= c.end_date))
  and ((user_id = (select auth.uid()) and day > public.today_tn() - 7) or (select public.is_admin()))
);
create policy "logs delete" on public.habit_logs for delete to authenticated using (
  (user_id = (select auth.uid()) and day > public.today_tn() - 7) or (select public.is_admin())
);

-- الترتيب للجميع: الاسم وعدد الأيام والسلسلة فقط، دون تفاصيل الأيام
create or replace function public.leaderboard(p_challenge bigint, p_period text default 'all')
returns table (user_id uuid, display_name text, days integer, total integer, streak integer, is_me boolean)
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
    select l.user_id, l.day from public.habit_logs l, win
    where l.challenge_id = win.id and l.day between win.start_date and win.last_day
  ),
  islands as (
    select user_id, day, day - (row_number() over (partition by user_id order by day))::int as grp from logs
  ),
  streaks as (
    select user_id, count(*)::int as streak from islands i, win
    group by user_id, grp, win.last_day
    having max(day) >= win.last_day - 1
  )
  select p.id, p.display_name,
    (select count(*)::int from logs l, win where l.user_id = p.id and l.day >= win.from_day),
    greatest(0, (select win.last_day - greatest(win.from_day, least(p.joined_on,
      coalesce((select min(l.day) from logs l where l.user_id = p.id), p.joined_on))) + 1 from win))::int,
    coalesce((select s.streak from streaks s where s.user_id = p.id), 0),
    p.id = auth.uid()
  from public.profiles p, win
  order by 3 desc, 5 desc, 2
$$;
revoke execute on function public.leaderboard(bigint, text) from public, anon;
grant execute on function public.leaderboard(bigint, text) to authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- العادات الأولى (من الصورة)
insert into public.challenges (title, icon, sort) values
  ('صلاة الصبح في المسجد', '🕌', 1),
  ('القسم اليومي/فيديو', '🎥', 2),
  ('أذكار الصباح/المساء', '📿', 3),
  ('ورد القرآن', '📖', 4),
  ('رياضة', '🏃', 5),
  ('الصبر', '🌱', 6);

revoke execute on function public.handle_new_user() from public, anon, authenticated;
