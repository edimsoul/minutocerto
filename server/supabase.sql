-- Rode no Supabase: SQL Editor > New query > cole tudo > Run.

create extension if not exists pgcrypto;

create table if not exists acessos (
  id bigint generated always as identity primary key,
  device_id text not null,
  evento text not null,
  usuario text,
  versao text,
  ip text,
  user_agent text,
  criado_em timestamptz not null default now()
);
create index if not exists acessos_criado_em_idx on acessos (criado_em desc);
alter table aparelhos add column if not exists pago_ate timestamptz;

create table if not exists assinaturas (
  id bigserial primary key,
  referencia text unique not null,
  mp_id text unique,
  device_id text not null,
  valor numeric not null,
  status text not null default 'pending',
  aplicado boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table assinaturas enable row level security;

alter table aparelhos add column if not exists ultimo_uso timestamptz;


create table if not exists pagamentos (
  id uuid primary key default gen_random_uuid(),
  referencia text unique not null,
  mp_id text,
  preference_id text,
  device_id text,
  valor numeric(10,2) not null,
  descricao text,
  metodo text,
  status text not null default 'pendente',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists pagamentos_criado_em_idx on pagamentos (criado_em desc);

create table if not exists sincronizacoes (
  device_id text primary key,
  dados jsonb not null default '{}'::jsonb,
  versao text,
  atualizado_em timestamptz not null default now()
);

create table if not exists mp_contas (
  device_id text primary key,
  mp_user_id text,
  access_token text not null,
  refresh_token text,
  public_key text,
  expira_em timestamptz,
  atualizado_em timestamptz not null default now()
);
create index if not exists mp_contas_user_idx on mp_contas (mp_user_id);

-- Liga a proteção por linha sem criar políticas: ninguém lê pelas chaves públicas.
-- Só o servidor (chave service_role) enxerga estas tabelas.
alter table acessos enable row level security;
alter table pagamentos enable row level security;
alter table sincronizacoes enable row level security;
alter table mp_contas enable row level security;