-- النقاط لكل مهمة، ومهام بعناصر (الصلوات الخمس)، وترتيب عام بالنقاط وترتيب لكل مهمة
alter table public.challenges add column points integer not null default 1 check (points between 0 and 1000);
alter table public.challenges add column items text[] check (items is null or array_length(items, 1) between 1 and 10);

alter table public.habit_logs add column item smallint not null default 0 check (item between 0 and 9);
-- المفتاح يصبح (المشارك، المهمة، اليوم، العنصر)
do $$
declare k text;
begin
  select conname into k from pg_constraint where conrelid = 'public.habit_logs'::regclass and contype = 'p';
  execute format('alter table public.habit_logs drop constraint %I', k);
end $$;
alter table public.habit_logs add constraint habit_logs_item_pkey primary key (member_id, challenge_id, day, item);

-- العنصر يجب أن يكون من عناصر المهمة (0 للمهمة البسيطة)
alter policy "logs2 insert" on public.habit_logs with check (
  day <= public.today_tn()
  and exists (select 1 from public.challenges c where c.id = challenge_id and c.active
              and day >= c.start_date and (c.end_date is null or day <= c.end_date)
              and item < coalesce(array_length(c.items, 1), 1))
  and (((select public.owns_member(member_id)) and day > public.today_tn() - 7) or (select public.is_admin()))
);

-- الترتيب: p_challenge = null للترتيب العام. النقاط = نقاط المهمة لكل عنصر منجز؛
-- اليوم الكامل = كل العناصر منجزة؛ السلسلة = أيام كاملة متتالية حتى اليوم أو أمس
create or replace function public.ranking(p_challenge bigint default null, p_period text default 'all')
returns table (member_id bigint, name text, points integer, days integer, total integer, streak integer, is_mine boolean)
language sql stable security definer set search_path = '' as $$
  with t as (select public.today_tn() as d),
  win as (
    select t.d, case p_period
      when 'week' then t.d - ((extract(isodow from t.d))::int - 1)
      when 'month' then date_trunc('month', t.d)::date
      else date '0001-01-01' end as from_day
    from t
  ),
  ch as (
    select c.id, c.points, c.start_date, least(coalesce(c.end_date, w.d), w.d) as last_day,
      coalesce(array_length(c.items, 1), 1) as n_items
    from public.challenges c, win w
    where (c.active or public.is_admin()) and (p_challenge is null or c.id = p_challenge) and auth.uid() is not null
  ),
  logs as (
    select l.member_id, l.challenge_id, l.day, ch.points, ch.n_items
    from public.habit_logs l join ch on ch.id = l.challenge_id
    where l.day between ch.start_date and ch.last_day
  ),
  full_days as (
    select member_id, challenge_id, day from logs group by member_id, challenge_id, day, n_items having count(*) >= n_items
  ),
  islands as (
    select member_id, challenge_id, day,
      day - (row_number() over (partition by member_id, challenge_id order by day))::int as grp
    from full_days
  ),
  streaks as (
    select i.member_id, count(*)::int as s from islands i join ch on ch.id = i.challenge_id
    group by i.member_id, i.challenge_id, i.grp, ch.last_day
    having max(i.day) >= ch.last_day - 1
  ),
  span as (
    select greatest(min(ch.start_date), (select from_day from win)) as from_day, max(ch.last_day) as last_day from ch
  )
  select m.id, m.name,
    coalesce((select sum(l.points)::int from logs l, win where l.member_id = m.id and l.day >= win.from_day), 0),
    (select count(*)::int from full_days f, win where f.member_id = m.id and f.day >= win.from_day),
    greatest(0, (select span.last_day - greatest(span.from_day, least(m.joined_on,
      coalesce((select min(l.day) from logs l where l.member_id = m.id), m.joined_on))) + 1 from span))::int,
    coalesce((select max(s.s) from streaks s where s.member_id = m.id), 0),
    m.account_id = auth.uid()
  from public.members m
  where exists (select 1 from ch)
  order by 3 desc, 4 desc, 6 desc, 2
$$;
revoke execute on function public.ranking(bigint, text) from public, anon;
grant execute on function public.ranking(bigint, text) to authenticated;
revoke execute on function public.leaderboard(bigint, text) from authenticated;

-- المشرف: abid.alaa@gmail.com فقط
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
revoke execute on function public.handle_new_user() from public, anon, authenticated;
update public.profiles p set is_admin = (lower(u.email) = 'abid.alaa@gmail.com') from auth.users u where u.id = p.id;

-- مهمة الصلوات الخمس
insert into public.challenges (title, icon, sort, points, items)
values ('الصلوات الخمس', '🕋', 0, 1, array['الصبح', 'الظهر', 'العصر', 'المغرب', 'العشاء']);
