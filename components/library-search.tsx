import type { FormEventHandler } from "react";
import { LibrarySearchButton } from "./library-search-button";

export function LibrarySearch({
  action,
  label,
  placeholder,
  query,
  onQueryChange,
  onSubmit,
  maxLength = 100,
}: {
  action?: string;
  label: string;
  placeholder: string;
  query: string;
  onQueryChange?: (query: string) => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  maxLength?: number;
}) {
  return (
    <form
      className="library-search club-search"
      action={action}
      onSubmit={onSubmit}
      role="search"
    >
      <input
        name="q"
        type="search"
        aria-label={label}
        placeholder={placeholder}
        maxLength={maxLength}
        {...(onQueryChange
          ? {
              value: query,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                onQueryChange(event.target.value),
            }
          : { defaultValue: query })}
      />
      <LibrarySearchButton />
    </form>
  );
}
