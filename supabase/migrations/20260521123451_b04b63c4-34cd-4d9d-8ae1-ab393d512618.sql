
create table public.viewer_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  name text not null,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.viewer_tokens enable row level security;

create policy "viewer_tokens pcp all"
on public.viewer_tokens
for all
to authenticated
using (public.is_pcp(auth.uid()))
with check (public.is_pcp(auth.uid()));

create index viewer_tokens_token_idx on public.viewer_tokens (token) where active;
