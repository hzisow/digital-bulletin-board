-- ============================================================
--  MA DECA Chapter Event Board — Supabase setup
--  Paste this whole file into the Supabase SQL Editor and click "Run".
--  (Dashboard → SQL Editor → New query → paste → Run)
--
--  NOTE: the live project also carries admin-override RLS policies (update/delete
--  when the JWT email is the admin account) and a protect_pinned trigger that were
--  added from the dashboard and are not reproduced here.
-- ============================================================

-- 1) The events table -----------------------------------------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  chapter     text not null,
  category    text not null,
  title       text not null,
  date        date,
  end_date    date,               -- optional last day, for multi-day events
  time        text,
  location    text not null,
  lat         double precision,
  lng         double precision,
  description text not null,
  link        text,
  ig_request  boolean not null default false,
  photos      text[] not null default '{}'
);

-- 1b) Multi-day events — adds end_date to a table created before it existed. Safe to re-run.
alter table public.events add column if not exists end_date date;
alter table public.events drop constraint if exists events_end_after_start;
alter table public.events add constraint events_end_after_start
  check (end_date is null or date is null or end_date >= date);

-- 2) Row Level Security ---------------------------------------
alter table public.events enable row level security;

-- Anyone (even signed-out visitors) can READ the board
drop policy if exists "events are public to read" on public.events;
create policy "events are public to read"
  on public.events for select
  using (true);

-- Signed-in users can INSERT, but only as themselves
drop policy if exists "users insert own events" on public.events;
create policy "users insert own events"
  on public.events for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can UPDATE only their own events
drop policy if exists "users update own events" on public.events;
create policy "users update own events"
  on public.events for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can DELETE only their own events
drop policy if exists "users delete own events" on public.events;
create policy "users delete own events"
  on public.events for delete
  to authenticated
  using (auth.uid() = user_id);

-- 3) Realtime (live updates across devices) -------------------
alter publication supabase_realtime add table public.events;

-- 4) Storage bucket for photos --------------------------------
insert into storage.buckets (id, name, public)
values ('event-photos', 'event-photos', true)
on conflict (id) do nothing;

-- Anyone can view photos (public bucket)
drop policy if exists "event photos are public" on storage.objects;
create policy "event photos are public"
  on storage.objects for select
  using (bucket_id = 'event-photos');

-- Signed-in users can upload photos
drop policy if exists "auth can upload event photos" on storage.objects;
create policy "auth can upload event photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'event-photos');

-- Users can delete photos they uploaded
drop policy if exists "owners delete event photos" on storage.objects;
create policy "owners delete event photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'event-photos' and owner = auth.uid());

-- Done. ✅
