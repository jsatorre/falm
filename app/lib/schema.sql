-- Esquema para el proyecto Supabase NUEVO y personal de esta app (no el de
-- Trendsplant). Se ejecuta a mano en el SQL editor de Supabase, igual que en
-- reposiciones-app — este proyecto tampoco usa un sistema de migraciones
-- formal. Pendiente de ejecutar hasta Fase 2 (cuando exista el proyecto).

create table if not exists seasons (
    id uuid primary key default gen_random_uuid(),
    label text not null,
    is_current boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists teams (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    biwenger_user_id text,
    crest_url text,
    pin_hash text not null,
    created_at timestamptz not null default now()
);

create table if not exists rounds (
    id uuid primary key default gen_random_uuid(),
    season_id uuid not null references seasons(id),
    biwenger_round_id text,
    jornada integer not null,
    status text not null default 'pending' check (status in ('pending', 'live', 'finished')),
    closed_at timestamptz,
    created_at timestamptz not null default now(),
    unique (season_id, jornada)
);

create table if not exists fixtures (
    id uuid primary key default gen_random_uuid(),
    round_id uuid not null references rounds(id) on delete cascade,
    team_a_id uuid not null references teams(id),
    team_b_id uuid not null references teams(id)
);

create table if not exists round_results (
    round_id uuid not null references rounds(id) on delete cascade,
    team_id uuid not null references teams(id),
    biwenger_points numeric not null,
    synced_at timestamptz not null default now(),
    primary key (round_id, team_id)
);

create table if not exists team_wishlist (
    round_id uuid not null references rounds(id) on delete cascade,
    team_id uuid not null references teams(id),
    player_1 text,
    player_2 text,
    submitted_at timestamptz not null default now(),
    primary key (round_id, team_id)
);

create table if not exists fichaje_assignments (
    id uuid primary key default gen_random_uuid(),
    round_id uuid not null references rounds(id) on delete cascade,
    team_id uuid not null references teams(id),
    player text not null,
    assigned_at timestamptz not null default now()
);

create table if not exists trophies (
    id uuid primary key default gen_random_uuid(),
    season_label text not null,
    champion_team_id uuid not null references teams(id),
    note text
);

create table if not exists records (
    id uuid primary key default gen_random_uuid(),
    label text not null,
    team_id uuid references teams(id),
    value text not null,
    season_label text
);

create index if not exists fixtures_round_idx on fixtures(round_id);
create index if not exists round_results_team_idx on round_results(team_id);
