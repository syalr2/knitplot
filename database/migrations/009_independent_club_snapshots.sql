-- Up Migration

alter table knitplot_club_posts
  drop constraint knitplot_club_posts_source_id_fkey;
alter table knitplot_club_posts
  alter column source_id drop not null,
  add constraint knitplot_club_posts_source_id_fkey
    foreign key (source_id) references knitplot_charts(id) on delete set null;

-- Down Migration

-- Refuse rollback if a published chart no longer has a private source.
alter table knitplot_club_posts
  drop constraint knitplot_club_posts_source_id_fkey;
alter table knitplot_club_posts
  alter column source_id set not null,
  add constraint knitplot_club_posts_source_id_fkey
    foreign key (source_id) references knitplot_charts(id) on delete cascade;
