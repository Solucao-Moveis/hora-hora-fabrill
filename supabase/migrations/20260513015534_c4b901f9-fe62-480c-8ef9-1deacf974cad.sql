
-- ENUMS
create type public.app_role as enum ('pcp', 'lider');

-- AREAS
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- MACHINES
create table public.machines (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique(area_id, name)
);

-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

-- ROLES
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique(user_id, role)
);

-- USER <-> AREA (líder)
create table public.user_areas (
  user_id uuid not null references auth.users(id) on delete cascade,
  area_id uuid not null references public.areas(id) on delete cascade,
  primary key (user_id, area_id)
);

-- METAS DIÁRIAS POR MÁQUINA
create table public.production_goals (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  goal_date date not null,
  goal int not null check (goal >= 0),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(machine_id, goal_date)
);

-- OPERADOR DO DIA POR MÁQUINA
create table public.machine_operators (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  log_date date not null,
  operator_name text not null,
  updated_at timestamptz not null default now(),
  unique(machine_id, log_date)
);

-- APONTAMENTOS HORÁRIOS
-- hour_slot: índice 0..9 dos 10 intervalos (07:30-08:30 ... 16:30-17:00)
create table public.production_entries (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  entry_date date not null,
  hour_slot smallint not null check (hour_slot between 0 and 9),
  quantity int not null default 0 check (quantity >= 0),
  observation text,
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(machine_id, entry_date, hour_slot)
);

-- SECURITY DEFINER FUNCTIONS
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_pcp(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_role(_user_id, 'pcp')
$$;

create or replace function public.user_can_access_area(_user_id uuid, _area_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_pcp(_user_id)
      or exists (select 1 from public.user_areas where user_id = _user_id and area_id = _area_id)
$$;

create or replace function public.user_can_access_machine(_user_id uuid, _machine_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.machines m
    where m.id = _machine_id
      and public.user_can_access_area(_user_id, m.area_id)
  )
$$;

-- AUTO PROFILE TRIGGER
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ENABLE RLS
alter table public.areas enable row level security;
alter table public.machines enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_areas enable row level security;
alter table public.production_goals enable row level security;
alter table public.machine_operators enable row level security;
alter table public.production_entries enable row level security;

-- POLICIES: areas (read all authenticated, write PCP)
create policy "areas read auth" on public.areas for select to authenticated using (true);
create policy "areas write pcp" on public.areas for all to authenticated
  using (public.is_pcp(auth.uid())) with check (public.is_pcp(auth.uid()));

-- machines
create policy "machines read auth" on public.machines for select to authenticated using (true);
create policy "machines write pcp" on public.machines for all to authenticated
  using (public.is_pcp(auth.uid())) with check (public.is_pcp(auth.uid()));

-- profiles
create policy "profile self read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_pcp(auth.uid()));
create policy "profile self update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_pcp(auth.uid()));
create policy "profile pcp insert" on public.profiles for insert to authenticated
  with check (public.is_pcp(auth.uid()) or id = auth.uid());

-- user_roles
create policy "roles read self or pcp" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_pcp(auth.uid()));
create policy "roles write pcp" on public.user_roles for all to authenticated
  using (public.is_pcp(auth.uid())) with check (public.is_pcp(auth.uid()));

-- user_areas
create policy "user_areas read self or pcp" on public.user_areas for select to authenticated
  using (user_id = auth.uid() or public.is_pcp(auth.uid()));
create policy "user_areas write pcp" on public.user_areas for all to authenticated
  using (public.is_pcp(auth.uid())) with check (public.is_pcp(auth.uid()));

-- production_goals: read all auth (líder precisa ver), write PCP
create policy "goals read auth" on public.production_goals for select to authenticated using (true);
create policy "goals write pcp" on public.production_goals for all to authenticated
  using (public.is_pcp(auth.uid())) with check (public.is_pcp(auth.uid()));

-- machine_operators: PCP ou líder da área
create policy "operators read scoped" on public.machine_operators for select to authenticated
  using (public.user_can_access_machine(auth.uid(), machine_id));
create policy "operators write scoped" on public.machine_operators for all to authenticated
  using (public.user_can_access_machine(auth.uid(), machine_id))
  with check (public.user_can_access_machine(auth.uid(), machine_id));

-- production_entries: PCP ou líder da área
create policy "entries read scoped" on public.production_entries for select to authenticated
  using (public.user_can_access_machine(auth.uid(), machine_id));
create policy "entries write scoped" on public.production_entries for all to authenticated
  using (public.user_can_access_machine(auth.uid(), machine_id))
  with check (public.user_can_access_machine(auth.uid(), machine_id));

-- SEED AREAS + MACHINES
with a as (
  insert into public.areas (name, slug, sort_order) values
    ('Metalurgia','metalurgia',1),
    ('Solda','solda',2),
    ('Marcenaria','marcenaria',3),
    ('Inspeção','inspecao',4),
    ('Tratamento e Pintura','tratamento-pintura',5),
    ('Montagem','montagem',6)
  returning id, slug
)
insert into public.machines (area_id, name, sort_order)
select a.id, m.name, m.sort_order from a
join (
  values
    ('metalurgia','Máquina a laser K6 151',1),
    ('metalurgia','Máquina a laser K6 152',2),
    ('metalurgia','Máquina a laser Viterbo',3),
    ('metalurgia','OMP',4),
    ('metalurgia','BLM',5),
    ('metalurgia','Robótica',6),
    ('metalurgia','EMT dobra',7),
    ('metalurgia','EMT furo',8),
    ('solda','Box solda manual 1',1),
    ('solda','Box solda manual 2',2),
    ('solda','Box solda manual 3',3),
    ('solda','Box solda manual 4',4),
    ('solda','Box solda manual 5',5),
    ('solda','Box solda manual 6',6),
    ('solda','Box solda manual 7',7),
    ('solda','Solda Robô 1',8),
    ('solda','Solda Robô 2',9),
    ('solda','Solda Robô 3',10),
    ('marcenaria','Seccionadora',1),
    ('marcenaria','Centro de usinagem',2),
    ('marcenaria','Coladeira de borda',3),
    ('inspecao','Box acabamento 1',1),
    ('inspecao','Box acabamento 2',2),
    ('inspecao','Box acabamento 3',3),
    ('inspecao','Box acabamento 4',4),
    ('inspecao','Box acabamento 5',5),
    ('tratamento-pintura','Máquina de pintura',1),
    ('montagem','Estação montagem 1',1),
    ('montagem','Estação montagem 2',2),
    ('montagem','Estação montagem 3',3),
    ('montagem','Estação montagem 4',4),
    ('montagem','Estação montagem 5',5),
    ('montagem','Estação montagem 6',6),
    ('montagem','Estação montagem 7',7),
    ('montagem','Estação montagem 8',8),
    ('montagem','Estação montagem 9',9),
    ('montagem','Estação montagem 10',10),
    ('montagem','Estação montagem 11',11),
    ('montagem','Embaladeira',12)
) as m(slug, name, sort_order) on m.slug = a.slug;
