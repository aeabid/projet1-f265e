-- القانون، فيديو المهمة، ومدّة إمكانية تعمير اليوم (يحدّدها المشرف)
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy "settings read" on public.app_settings for select to authenticated using (true);
create policy "settings admin insert" on public.app_settings for insert to authenticated with check ((select public.is_admin()));
create policy "settings admin update" on public.app_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
insert into public.app_settings (key, value) values ('rules', '""'), ('edit_days', '2');

-- عدد الأيام المفتوحة للتعمير: 1 = اليوم فقط (حتى نصف الليل)، 2 = اليوم وأمس (48 ساعة)…
create or replace function public.edit_days() returns integer
language sql stable security definer set search_path = '' as $$
  select least(30, greatest(1, coalesce((select (value #>> '{}')::int from public.app_settings where key = 'edit_days'), 2)))
$$;
revoke execute on function public.edit_days() from public, anon;
grant execute on function public.edit_days() to authenticated;

alter policy "logs2 insert" on public.habit_logs with check (
  day <= public.today_tn()
  and exists (select 1 from public.challenges c where c.id = challenge_id and c.active
              and day >= c.start_date and (c.end_date is null or day <= c.end_date)
              and item < coalesce(array_length(c.items, 1), 1))
  and (((select public.owns_member(member_id)) and day > public.today_tn() - public.edit_days()) or (select public.is_admin()))
);
alter policy "logs2 delete" on public.habit_logs using (
  ((select public.owns_member(member_id)) and day > public.today_tn() - public.edit_days()) or (select public.is_admin())
);

alter table public.challenges add column video_url text check (video_url is null or char_length(video_url) <= 300);
