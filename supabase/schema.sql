-- ============================================================
-- Schema Supabase per "Percorso" — app di gestione dieta
-- Esegui questo file in Supabase Studio > SQL Editor
-- (progetto Supabase TUO, non quello del connettore collegato a Claude)
-- ============================================================

-- Estensione per generare UUID
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Tabella profili (1 riga per utente autenticato)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_upsert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- ------------------------------------------------------------
-- Diete caricate (un PDF interpretato = una dieta)
-- ------------------------------------------------------------
create table if not exists public.diets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Piano alimentare',
  source_filename text,
  raw_text text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.diets enable row level security;

create policy "diets_all_own" on public.diets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Giorni della dieta (0 = lunedì ... 6 = domenica)
-- ------------------------------------------------------------
create table if not exists public.diet_days (
  id uuid primary key default gen_random_uuid(),
  diet_id uuid not null references public.diets(id) on delete cascade,
  day_index int not null check (day_index between 0 and 6),
  day_label text not null,
  notes text
);

alter table public.diet_days enable row level security;

create policy "diet_days_all_own" on public.diet_days
  for all using (
    exists (select 1 from public.diets d where d.id = diet_id and d.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.diets d where d.id = diet_id and d.user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- Pasti di ogni giorno
-- ------------------------------------------------------------
create table if not exists public.diet_meals (
  id uuid primary key default gen_random_uuid(),
  diet_day_id uuid not null references public.diet_days(id) on delete cascade,
  meal_type text not null,        -- es. Colazione, Spuntino, Pranzo, Merenda, Cena
  meal_time text,                 -- es. "08:00" (opzionale)
  items text not null default '', -- testo libero, una voce per riga
  sort_order int not null default 0
);

alter table public.diet_meals enable row level security;

create policy "diet_meals_all_own" on public.diet_meals
  for all using (
    exists (
      select 1 from public.diet_days dd
      join public.diets d on d.id = dd.diet_id
      where dd.id = diet_day_id and d.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.diet_days dd
      join public.diets d on d.id = dd.diet_id
      where dd.id = diet_day_id and d.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- Log di completamento pasti (per il tracciamento avanzamento)
-- ------------------------------------------------------------
create table if not exists public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  diet_meal_id uuid not null references public.diet_meals(id) on delete cascade,
  log_date date not null,
  completed boolean not null default false,
  completed_at timestamptz,
  unique (diet_meal_id, log_date)
);

alter table public.meal_logs enable row level security;

create policy "meal_logs_all_own" on public.meal_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Log del peso (facoltativo, per grafico avanzamento)
-- ------------------------------------------------------------
create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  weight_kg numeric(5,2) not null,
  note text,
  unique (user_id, log_date)
);

alter table public.weight_logs enable row level security;

create policy "weight_logs_all_own" on public.weight_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Indici utili
-- ------------------------------------------------------------
create index if not exists idx_diets_user on public.diets(user_id);
create index if not exists idx_diet_days_diet on public.diet_days(diet_id);
create index if not exists idx_diet_meals_day on public.diet_meals(diet_day_id);
create index if not exists idx_meal_logs_user_date on public.meal_logs(user_id, log_date);
create index if not exists idx_weight_logs_user_date on public.weight_logs(user_id, log_date);
