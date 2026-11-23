-- Up Migration
create unique index knitplot_draft_chart_links_revoke_hash_uidx
  on knitplot_draft_chart_links (revoke_hash);

create function knitplot_admit_guest_link(
  link_token text, link_revoke_hash text, snapshot jsonb, snapshot_bytes integer, link_slug text
) returns table (outcome text, token text, slug text, capacity_warning boolean)
language plpgsql as $$
declare
  existing knitplot_draft_chart_links%rowtype;
  live_count bigint;
  live_bytes bigint;
begin
  -- Share the lock with the previous API during rollout.
  perform pg_advisory_xact_lock(735751, 1);
  select * into existing from knitplot_draft_chart_links where revoke_hash = link_revoke_hash;
  if found then
    return query select 'existing'::text, existing.token, existing.slug, false;
    return;
  end if;
  select count(*), coalesce(sum(payload_bytes), 0) into live_count, live_bytes
    from knitplot_draft_chart_links;
  if live_count >= 10000 or live_bytes + snapshot_bytes > 268435456 then
    return query select 'full'::text, null::text, null::text, false;
    return;
  end if;
  insert into knitplot_draft_chart_links (token, revoke_hash, document, payload_bytes, slug)
    values (link_token, link_revoke_hash, snapshot, snapshot_bytes, link_slug)
    on conflict on constraint knitplot_draft_chart_links_pkey do nothing;
  if found then
    return query select 'created'::text, link_token, link_slug,
      (live_count = 7999 or (live_bytes < 214748365 and live_bytes + snapshot_bytes >= 214748365));
  else
    return query select 'collision'::text, null::text, null::text, false;
  end if;
end;
$$;

create table knitplot_guest_link_limits (
  bucket text primary key,
  expires_at timestamptz not null,
  hits integer not null
);
create index knitplot_guest_link_limits_expiry on knitplot_guest_link_limits (expires_at);

create function knitplot_take_guest_link_request(bucket_key text, max_hits integer, window_seconds integer)
returns boolean language plpgsql as $$
declare
  window_end timestamptz := date_bin(make_interval(secs => window_seconds), now(), '2000-01-01'::timestamptz)
    + make_interval(secs => window_seconds);
  allowed boolean;
begin
  insert into knitplot_guest_link_limits as limits (bucket, expires_at, hits)
    values (bucket_key, window_end, 1)
    on conflict (bucket) do update set expires_at = excluded.expires_at,
      hits = case when limits.expires_at <= now() then 1 else limits.hits + 1 end
    where limits.expires_at <= now() or limits.hits < max_hits;
  allowed := found;
  -- Take the current bucket lock first. Cleanup must never wait on a bucket
  -- another request is using, even if both requests cross a window boundary.
  delete from knitplot_guest_link_limits where bucket in (
    select bucket from knitplot_guest_link_limits where expires_at <= now()
    order by expires_at limit 8 for update skip locked
  );
  return allowed;
end;
$$;

-- Down Migration
drop function knitplot_take_guest_link_request(text, integer, integer);
drop table knitplot_guest_link_limits;
drop function knitplot_admit_guest_link(text, text, jsonb, integer, text);
drop index knitplot_draft_chart_links_revoke_hash_uidx;
