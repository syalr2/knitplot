-- Up Migration

-- NULL distinguishes existing Clerk-managed pins from migrated database pins.
-- The first My Charts load imports that user's legacy preferences once. Explicit
-- pin changes are already non-NULL and cannot be undone by that import.
alter table knitplot_charts add column pinned boolean;
alter table knitplot_charts alter column pinned set default false;
create index knitplot_charts_user_pinned_idx on knitplot_charts (user_id, pinned) where pinned = true;

-- Down Migration

drop index if exists knitplot_charts_user_pinned_idx;
alter table knitplot_charts drop column pinned;
