-- GTM ExitIQ — question bank + lead capture schema.
--
-- Mirrors the table shapes of the flagship ExitIQ project (qv_categories /
-- qv_questions / question_options), so the full flagship bank plugs in
-- unchanged, plus a minimal `leads` table for the GTM light version.
--
-- Access model (publishable key only, no auth in the GTM tool):
--   * bank tables:  SELECT for anon — content is public by design.
--   * leads:        INSERT only for anon; rows are never readable via the API.

create table public.questionnaire_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null default 1,
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.qv_categories (
  id uuid primary key default gen_random_uuid(),
  version_id uuid references public.questionnaire_versions(id) on delete cascade,
  key text not null,
  name_en text not null,
  name_de text not null,
  description_en text,
  description_de text,
  weight_x numeric not null default 0.10,
  weight_y numeric not null default 0.10,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (version_id, key)
);

create table public.qv_questions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid references public.questionnaire_versions(id) on delete cascade,
  category_id uuid references public.qv_categories(id) on delete cascade,
  question_key text not null,
  text_en text not null,
  text_de text not null,
  info_en text,
  info_de text,
  is_red_flag boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  sectors text[],
  weight_x numeric default 0.05,
  weight_y numeric default 0.05,
  is_follow_up boolean not null default false,
  follow_up_question_key text,
  follow_up_condition text check (follow_up_condition in ('score_0', 'score_lte_1')),
  created_at timestamptz not null default now(),
  unique (version_id, question_key)
);

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.qv_questions(id) on delete cascade,
  option_key text not null check (option_key in ('optimal', 'good', 'low', 'na')),
  text_en text not null,
  text_de text not null,
  score integer not null check (score in (-1, 0, 1, 2)),
  sort_order integer not null default 0
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'summary' check (kind in ('summary', 'introduction_request')),
  name text not null check (length(name) between 1 and 200),
  email text not null check (length(email) between 3 and 320),
  company text check (length(company) <= 200),
  sector text check (length(sector) <= 100),
  country text check (length(country) <= 100),
  revenue text check (length(revenue) <= 100),
  exit_readiness integer check (exit_readiness between 0 and 100),
  value_potential integer check (value_potential between 0 and 100),
  zone text check (length(zone) <= 100),
  partner_key text check (length(partner_key) <= 40),
  language text check (language in ('en', 'de')),
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.questionnaire_versions enable row level security;
alter table public.qv_categories enable row level security;
alter table public.qv_questions enable row level security;
alter table public.question_options enable row level security;
alter table public.leads enable row level security;

create policy "public read" on public.questionnaire_versions
  for select to anon, authenticated using (true);
create policy "public read" on public.qv_categories
  for select to anon, authenticated using (true);
create policy "public read" on public.qv_questions
  for select to anon, authenticated using (true);
create policy "public read" on public.question_options
  for select to anon, authenticated using (true);

-- Leads: write-only from the browser. No select/update/delete policy exists,
-- so submitted leads can never be read back with the publishable key.
create policy "lead insert" on public.leads
  for insert to anon with check (true);

-- Privacy: the published retention promise for lead data is 24 months.
-- Enforce it in the database so the promise holds without an app server.
create extension if not exists pg_cron;
select cron.schedule(
  'leads-retention',
  '20 3 * * *',
  $$delete from public.leads where created_at < now() - interval '24 months'$$
);
