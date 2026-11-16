-- Up Migration

create index knitplot_club_handles_creator_idx on knitplot_club_handles (creator_id);
create index knitplot_club_reports_queue_idx on knitplot_club_reports (created_at desc, id desc);

create or replace function knitplot_reserve_club_handle() returns trigger language plpgsql as $$
begin
  -- Updates to the same creator row serialize reservations for that account.
  if not exists (
    select 1 from knitplot_club_handles where creator_id = new.user_id and handle = new.handle
  ) and (
    select count(*) from knitplot_club_handles where creator_id = new.user_id
  ) >= 5 then
    raise exception using errcode = 'KP001', message = 'Chart Club username limit reached';
  end if;
  insert into knitplot_club_handles as handles (handle, creator_id)
    values (new.handle, new.user_id)
    on conflict (handle) do update set creator_id = excluded.creator_id
    where handles.creator_id = excluded.creator_id;
  if not found then
    raise unique_violation using message = 'Chart Club username already reserved';
  end if;
  return new;
end;
$$;

-- Down Migration

create or replace function knitplot_reserve_club_handle() returns trigger language plpgsql as $$
begin
  insert into knitplot_club_handles as handles (handle, creator_id)
    values (new.handle, new.user_id)
    on conflict (handle) do update set creator_id = excluded.creator_id
    where handles.creator_id = excluded.creator_id;
  if not found then
    raise unique_violation using message = 'Chart Club username already reserved';
  end if;
  return new;
end;
$$;

drop index knitplot_club_reports_queue_idx;
drop index knitplot_club_handles_creator_idx;
