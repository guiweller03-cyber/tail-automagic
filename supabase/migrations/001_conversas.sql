create extension if not exists "uuid-ossp";

create table if not exists conversas (
  id uuid primary key default uuid_generate_v4(),
  telefone text unique not null,
  nome_cliente text,
  historico jsonb default '[]',
  aguardando_humano boolean default false,
  estagio text default 'novo' check (estagio in ('novo','qualificando','vendendo','pos_venda','inativo')),
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);
