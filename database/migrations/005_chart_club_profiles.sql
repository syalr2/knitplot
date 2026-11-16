-- Up Migration

alter table knitplot_club_creators
  add column display_name text not null default '' check (char_length(display_name) <= 60),
  add column bio text not null default '' check (char_length(bio) <= 400),
  add column ravelry_url text check (char_length(ravelry_url) <= 250);

-- Down Migration

alter table knitplot_club_creators
  drop column ravelry_url, drop column bio, drop column display_name;
