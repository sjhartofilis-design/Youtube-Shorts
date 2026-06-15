-- Run this once in your Supabase project's SQL Editor (Database > SQL Editor > New query).
-- This sets up everything needed for the single-user password-gated dashboard:
-- a flag tracking whether the password has been set, plus tables for settings,
-- the queue, the schedule, and used-clip dedup, all scoped to the one account
-- via Row Level Security.

-- 1. Tracks whether the one-time password has been set yet.
create table if not exists app_meta (
  id boolean primary key default true,
  password_set boolean not null default false,
  constraint app_meta_single_row check (id = true)
);

insert into app_meta (id, password_set)
values (true, false)
on conflict (id) do nothing;

alter table app_meta enable row level security;

drop policy if exists "anyone can read app_meta" on app_meta;
create policy "anyone can read app_meta"
  on app_meta for select
  using (true);

drop policy if exists "authenticated users can update app_meta" on app_meta;
create policy "authenticated users can update app_meta"
  on app_meta for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 2. Settings: a single JSON blob per user (API keys, voices, channel names, OAuth tokens, etc).
create table if not exists settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table settings enable row level security;

drop policy if exists "users manage their own settings" on settings;
create policy "users manage their own settings"
  on settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Queue items: one row per queued script/video.
create table if not exists queue_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  position integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table queue_items enable row level security;

drop policy if exists "users manage their own queue items" on queue_items;
create policy "users manage their own queue items"
  on queue_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Schedule slots.
create table if not exists schedule_slots (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table schedule_slots enable row level security;

drop policy if exists "users manage their own schedule slots" on schedule_slots;
create policy "users manage their own schedule slots"
  on schedule_slots for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. Used Pexels clip IDs, for dedup across the whole queue.
create table if not exists used_clip_ids (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table used_clip_ids enable row level security;

drop policy if exists "users manage their own used clip ids" on used_clip_ids;
create policy "users manage their own used clip ids"
  on used_clip_ids for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 6. Storage bucket for generated/uploaded media (voiceovers, video clips, final
-- videos, background audio). Public so the resulting URLs can be used directly
-- in <audio>/<video> tags and fetched by the YouTube upload step without
-- needing to refresh signed URLs. Files are stored under a per-user folder
-- (<user_id>/...), and only the owning user can write/delete their files.
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

drop policy if exists "anyone can read asset files" on storage.objects;
create policy "anyone can read asset files"
  on storage.objects for select
  using (bucket_id = 'assets');

drop policy if exists "users manage their own asset files" on storage.objects;
create policy "users manage their own asset files"
  on storage.objects for all
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text);
