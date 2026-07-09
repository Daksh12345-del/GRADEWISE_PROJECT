-- ============================================================
-- Live/configurable content store for GradeWallah
-- Run this once in Supabase → SQL Editor → New query → Run.
-- ============================================================
-- Powers: AppPage & Sidebar & CgpaPictograph & RightPanel (SEMESTERS),
-- ResourcesPage & AnalyserPage (VIDEO_DATA, PYQ_LINKS, SUBJECT_NOTES),
-- AnalyserPage (SUBJECT_KB), LoginPage dropdowns (COLLEGES_BY_CITY,
-- BRANCHES, DOMAIN_GROUPS).
--
-- One row per "data file". The `value` column holds the exact same JSON
-- shape that used to be hardcoded in the matching src/lib/*.js file.
-- Edit a row's `value` any time in Table Editor — no redeploy needed.

create table if not exists public.site_content (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Keep updated_at current on every edit
create or replace function public.touch_site_content_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_site_content on public.site_content;
create trigger trg_touch_site_content
  before update on public.site_content
  for each row execute function public.touch_site_content_updated_at();

-- Row Level Security: anyone (the app's anon key) can READ. Writes are only
-- done by you, signed into the Supabase dashboard, which uses your own
-- account and bypasses RLS — no public write policy is created here on
-- purpose, so random visitors can't edit your content through the API.
alter table public.site_content enable row level security;

drop policy if exists "Public read access" on public.site_content;
create policy "Public read access"
  on public.site_content
  for select
  using (true);
