-- Up Migration

alter table knitplot_club_creators
  add column instagram_url text check (char_length(instagram_url) <= 250),
  add column tiktok_url text check (char_length(tiktok_url) <= 250);

-- Down Migration

alter table knitplot_club_creators
  drop column tiktok_url, drop column instagram_url;
