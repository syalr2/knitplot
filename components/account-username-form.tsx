"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isRecord, responseJson } from "@/lib/http";

export function AccountUsernameForm({
  initialHandle,
}: {
  initialHandle: string;
}) {
  const [handle, setHandle] = useState(initialHandle);
  const router = useRouter();
  const [editing, setEditing] = useState(!initialHandle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previousHandles, setPreviousHandles] = useState<string[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  if (handle && !editing)
    return (
      <p role="status">
        <strong>@{handle}</strong> is your Chart Club username.{" "}
        <button
          type="button"
          className="text-button"
          onClick={() => setEditing(true)}
        >
          Change username
        </button>
      </p>
    );

  return (
    <form
      className="account-username-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const fields = new FormData(event.currentTarget);
        setBusy(true);
        setError("");
        try {
          const response = await fetch("/api/chart-club/username", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ handle: fields.get("handle") }),
          });
          if (response.status === 409) {
            const result: unknown = await response
              .clone()
              .json()
              .catch(() => null);
            if (
              isRecord(result) &&
              result.code === "username_limit" &&
              Array.isArray(result.previousHandles)
            ) {
              setPreviousHandles(
                result.previousHandles.filter(
                  (value): value is string => typeof value === "string",
                ),
              );
              return;
            }
          }
          setHandle((await responseJson<{ handle: string }>(response)).handle);
          setEditing(false);
          router.refresh();
        } catch (error) {
          setError(
            error instanceof Error ? error.message : "Please try again.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Username{" "}
        <input
          ref={input}
          name="handle"
          defaultValue={handle}
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={3}
          maxLength={24}
          pattern="[A-Za-z0-9_]{3,24}"
        />
      </label>
      <button className="primary-button" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save username"}
      </button>
      {error && (
        <p className="account-username-error" role="alert">
          {error}
        </p>
      )}
      {previousHandles && (
        <dialog
          className="import-dialog close-tab-dialog account-username-dialog"
          aria-labelledby={headingId}
          aria-describedby={descriptionId}
          ref={(node) => {
            if (node && !node.open) node.showModal();
          }}
          onClose={() => setPreviousHandles(null)}
        >
          <div className="import-dialog-heading">
            <h2 id={headingId}>Username limit reached</h2>
            <button
              className="close-dialog"
              type="button"
              aria-label="Close username warning"
              onClick={(event) =>
                event.currentTarget.closest("dialog")?.close()
              }
            >
              ×
            </button>
          </div>
          <p id={descriptionId}>
            You can reserve up to five usernames. Pick a previous one, then
            select Save username.
          </p>
          <ul aria-label="Previous usernames">
            {previousHandles.map((previous) => (
              <li key={previous}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={(event) => {
                    event.currentTarget.closest("dialog")?.close();
                    if (input.current) {
                      input.current.value = previous;
                      input.current.focus();
                    }
                  }}
                >
                  @{previous}
                </button>
              </li>
            ))}
          </ul>
        </dialog>
      )}
    </form>
  );
}
