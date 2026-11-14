-- ELITES_LOCALES_Y_TRAYECTORIAS_POLITICAS
-- Ejecutar en Supabase > SQL Editor. No colocar service_role keys en el frontend.
create extension if not exists pgcrypto;

create table if not exists public.entity_fiches (
  id uuid primary key default gen_random_uuid(),
  geo_id text not null unique,
  entity_type text not null check (entity_type in ('territorio','poder')),
  name text not null,
  period text default 'Siglo XVII',
  description text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  biography text,
  notes text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date text,
  description text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  citation text not null,
  url text,
  notes text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.entity_people (
  id uuid primary key default gen_random_uuid(),
  geo_id text not null references public.entity_fiches(geo_id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  relationship text,
  evidence text,
  created_at timestamptz not null default now(),
  unique(geo_id, person_id)
);
create table if not exists public.entity_events (
  id uuid primary key default gen_random_uuid(),
  geo_id text not null references public.entity_fiches(geo_id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  relationship text,
  evidence text,
  created_at timestamptz not null default now(),
  unique(geo_id, event_id)
);
create table if not exists public.entity_sources (
  id uuid primary key default gen_random_uuid(),
  geo_id text not null references public.entity_fiches(geo_id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  source_role text,
  created_at timestamptz not null default now(),
  unique(geo_id, source_id)
);
create table if not exists public.entity_relations (
  id uuid primary key default gen_random_uuid(),
  source_geo_id text not null references public.entity_fiches(geo_id) on delete cascade,
  target_geo_id text not null references public.entity_fiches(geo_id) on delete cascade,
  relation_type text not null,
  description text,
  source_reference text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  check (source_geo_id <> target_geo_id)
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'viewer' check (role in ('viewer','admin')),
  created_at timestamptz not null default now()
);

-- Alta automática con rol viewer. El administrador se asigna manualmente desde SQL Editor.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,role) values(new.id,new.email,'viewer') on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;

alter table public.entity_fiches enable row level security;
alter table public.people enable row level security;
alter table public.events enable row level security;
alter table public.sources enable row level security;
alter table public.entity_people enable row level security;
alter table public.entity_events enable row level security;
alter table public.entity_sources enable row level security;
alter table public.entity_relations enable row level security;
alter table public.profiles enable row level security;

-- Lectura pública solamente de contenido publicado.
create policy "published fiches are readable" on public.entity_fiches for select using (published or public.is_admin());
create policy "admins manage fiches" on public.entity_fiches for all using (public.is_admin()) with check (public.is_admin());
create policy "published people are readable" on public.people for select using (published or public.is_admin());
create policy "admins manage people" on public.people for all using (public.is_admin()) with check (public.is_admin());
create policy "published events are readable" on public.events for select using (published or public.is_admin());
create policy "admins manage events" on public.events for all using (public.is_admin()) with check (public.is_admin());
create policy "published sources are readable" on public.sources for select using (published or public.is_admin());
create policy "admins manage sources" on public.sources for all using (public.is_admin()) with check (public.is_admin());
create policy "published entity people are readable" on public.entity_people for select using (exists(select 1 from public.entity_fiches f join public.people p on p.id=entity_people.person_id where f.geo_id=entity_people.geo_id and f.published and p.published) or public.is_admin());
create policy "admins manage entity people" on public.entity_people for all using (public.is_admin()) with check (public.is_admin());
create policy "published entity events are readable" on public.entity_events for select using (exists(select 1 from public.entity_fiches f join public.events e on e.id=entity_events.event_id where f.geo_id=entity_events.geo_id and f.published and e.published) or public.is_admin());
create policy "admins manage entity events" on public.entity_events for all using (public.is_admin()) with check (public.is_admin());
create policy "published entity sources are readable" on public.entity_sources for select using (exists(select 1 from public.entity_fiches f join public.sources s on s.id=entity_sources.source_id where f.geo_id=entity_sources.geo_id and f.published and s.published) or public.is_admin());
create policy "admins manage entity sources" on public.entity_sources for all using (public.is_admin()) with check (public.is_admin());
create policy "published relations are readable" on public.entity_relations for select using (published or public.is_admin());
create policy "admins manage relations" on public.entity_relations for all using (public.is_admin()) with check (public.is_admin());
create policy "users read own profile" on public.profiles for select using (id=auth.uid() or public.is_admin());
create policy "admins manage profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- Índices para consultas del visor.
create index if not exists idx_fiches_geo_id on public.entity_fiches(geo_id);
create index if not exists idx_entity_people_geo on public.entity_people(geo_id);
create index if not exists idx_entity_events_geo on public.entity_events(geo_id);
create index if not exists idx_entity_sources_geo on public.entity_sources(geo_id);
create index if not exists idx_entity_relations_source on public.entity_relations(source_geo_id);
create index if not exists idx_entity_relations_target on public.entity_relations(target_geo_id);

-- Después de crear tu usuario en Authentication > Users, asignale permisos de administrador:
-- update public.profiles set role='admin' where email='TU_CORREO';

-- Cargos e instituciones, y su incorporación a las trayectorias personales.
create table if not exists public.offices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  institution text,
  description text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.person_offices (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  institution_context text,
  start_date text,
  end_date text,
  source_reference text,
  created_at timestamptz not null default now()
);
alter table public.offices enable row level security;
alter table public.person_offices enable row level security;
create policy "published offices are readable" on public.offices for select using (published or public.is_admin());
create policy "admins manage offices" on public.offices for all using (public.is_admin()) with check (public.is_admin());
create policy "published person offices are readable" on public.person_offices for select using (exists(select 1 from public.people p join public.offices o on o.id=person_offices.office_id where p.id=person_offices.person_id and p.published and o.published) or public.is_admin());
create policy "admins manage person offices" on public.person_offices for all using (public.is_admin()) with check (public.is_admin());
create index if not exists idx_person_offices_person on public.person_offices(person_id);
