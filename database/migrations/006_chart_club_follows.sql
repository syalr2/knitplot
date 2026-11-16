-- Up Migration

create table knitplot_club_follows (
  follower_id text not null,
  creator_id text not null references knitplot_club_creators(user_id) on delete cascade,
  primary key (follower_id, creator_id),
  check (follower_id <> creator_id)
);

create index knitplot_club_follows_creator_idx on knitplot_club_follows (creator_id);
create index knitplot_club_posts_creator_latest_idx
  on knitplot_club_posts (creator_id, published_at desc, id desc);

-- Down Migration

drop index knitplot_club_posts_creator_latest_idx;
drop table knitplot_club_follows;
