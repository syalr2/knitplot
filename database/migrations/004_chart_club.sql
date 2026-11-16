-- Up Migration

create table knitplot_club_creators (
  user_id text primary key,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$')
);

create table knitplot_club_posts (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references knitplot_club_creators(user_id),
  source_id uuid not null references knitplot_charts(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null check (char_length(description) <= 1200),
  summary jsonb not null,
  editable_document jsonb,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, source_id)
);

create index knitplot_club_posts_latest_idx
  on knitplot_club_posts (published_at desc, id desc);

-- Down Migration

drop table knitplot_club_posts;
drop table knitplot_club_creators;
