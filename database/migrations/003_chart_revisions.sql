-- Up Migration

alter table knitplot_charts add column version integer not null default 1 check (version > 0);

-- Database-owned revisions also cover writes from the previous application
-- during rollout/rollback. Pins are metadata and do not invalidate editor saves.
create function knitplot_increment_chart_version() returns trigger
language plpgsql as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger knitplot_chart_version
before update of name, document, knit_progress, preview on knitplot_charts
for each row execute function knitplot_increment_chart_version();

-- Down Migration

drop trigger knitplot_chart_version on knitplot_charts;
drop function knitplot_increment_chart_version();
alter table knitplot_charts drop column version;
