-- Up Migration

create table knitplot_club_handles (
  handle text primary key check (handle ~ '^[a-z0-9_]{3,24}$'),
  creator_id text not null references knitplot_club_creators(user_id) on delete cascade
);
insert into knitplot_club_handles (handle, creator_id)
  select handle, user_id from knitplot_club_creators;

create function knitplot_reserve_club_handle() returns trigger language plpgsql as $$
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

create trigger knitplot_reserve_club_handle
  after insert or update of handle on knitplot_club_creators
  for each row execute function knitplot_reserve_club_handle();

alter table knitplot_club_posts add column removed_at timestamptz;

-- Previous view-only posts stay private until the author explicitly shares an editable copy.
create view knitplot_club_public_posts as
  select * from knitplot_club_posts where removed_at is null and editable_document is not null;

create table knitplot_club_hearts (
  user_id text not null,
  post_id uuid not null references knitplot_club_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index knitplot_club_hearts_post_idx on knitplot_club_hearts (post_id);

-- Reports retain their reason even if the author unshares the post.
create table knitplot_club_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id text not null,
  post_id uuid not null,
  post_title text not null,
  reason text not null check (reason in ('spam', 'permission', 'other')),
  created_at timestamptz not null default now(),
  unique (reporter_id, post_id)
);

-- Down Migration

drop table knitplot_club_reports;
drop table knitplot_club_hearts;
drop view knitplot_club_public_posts;
alter table knitplot_club_posts drop column removed_at;
drop trigger knitplot_reserve_club_handle on knitplot_club_creators;
drop function knitplot_reserve_club_handle();
drop table knitplot_club_handles;
