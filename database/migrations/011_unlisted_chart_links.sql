-- Up Migration
create table knitplot_chart_links (
  source_id uuid primary key references knitplot_charts(id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{32}$'),
  document jsonb not null,
  created_at timestamptz not null default now()
);

-- Down Migration
drop table knitplot_chart_links;
