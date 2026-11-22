-- Up Migration
create table knitplot_draft_chart_links (
  token text primary key check (token ~ '^[A-Za-z0-9]{6}$' or token ~ '^[A-Za-z0-9_-]{22}$'),
  slug text check (slug ~ '^[a-z0-9-]{1,48}$'),
  revoke_hash text not null check (revoke_hash ~ '^[0-9a-f]{64}$'),
  document jsonb not null,
  payload_bytes integer not null check (payload_bytes between 1 and 4000000),
  created_at timestamptz not null default now(),
  check (char_length(token) <> 6 or slug is not null)
);

-- Serialize admission so concurrent requests cannot exceed the storage budget.
create function knitplot_create_draft_chart_link(
  link_token text, link_revoke_hash text, snapshot jsonb, snapshot_bytes integer, link_slug text
) returns text language plpgsql as $$
begin
  perform pg_advisory_xact_lock(735751, 1);
  if (select count(*) >= 10000 or coalesce(sum(payload_bytes), 0) + snapshot_bytes > 268435456
      from knitplot_draft_chart_links) then
    return 'full';
  end if;
  insert into knitplot_draft_chart_links (token, revoke_hash, document, payload_bytes, slug)
    values (link_token, link_revoke_hash, snapshot, snapshot_bytes, link_slug)
    on conflict (token) do nothing;
  return case when found then 'created' else 'collision' end;
end;
$$;

-- Down Migration
drop function knitplot_create_draft_chart_link(text, text, jsonb, integer, text);
drop table knitplot_draft_chart_links;
