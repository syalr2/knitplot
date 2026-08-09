create extension if not exists pgcrypto;

create table if not exists knitplot_charts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null default 'Untitled chart' check (char_length(name) <= 200),
  document jsonb not null,
  knit_progress jsonb not null default '{}'::jsonb,
  preview jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knitplot_charts_user_updated_idx on knitplot_charts(user_id, updated_at desc);

create table if not exists knitplot_user_ai_credentials (
  user_id text primary key,
  encrypted_key text not null,
  key_last_four text not null check (char_length(key_last_four) = 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists knitplot_ai_request_log (
  id bigint generated always as identity primary key,
  user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists knitplot_ai_request_log_user_created_idx on knitplot_ai_request_log(user_id, created_at desc);

comment on table knitplot_charts is 'Private KnitPlot charts. Every application query must be scoped to the authenticated Clerk user ID.';
comment on table knitplot_user_ai_credentials is 'AES-256-GCM encrypted OpenAI credentials. Accessed only by server routes.';
comment on table knitplot_ai_request_log is 'Request timestamps for KnitPlot AI safety limits. No prompts or images are stored.';

