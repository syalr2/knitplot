"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { responseJson } from "@/lib/http";

export function ClubManagePost({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function save(method: "PATCH" | "DELETE", fields?: FormData) {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const response =
        method === "PATCH"
          ? await fetch("/api/chart-club", {
              method,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id,
                title: fields?.get("title"),
                description: fields?.get("description"),
              }),
            })
          : await fetch(`/api/chart-club?id=${encodeURIComponent(id)}`, {
              method,
            });
      if (!response.ok) await responseJson(response);
      if (method === "DELETE") {
        router.replace("/my-charts?tab=published");
        return;
      }
      setNotice("Post details saved.");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="club-share-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save("PATCH", new FormData(event.currentTarget));
      }}
    >
      <fieldset disabled={busy}>
        <label>
          Public title
          <input name="title" defaultValue={title} required maxLength={200} />
        </label>
        <label>
          Description (optional)
          <textarea
            name="description"
            defaultValue={description}
            maxLength={1200}
            rows={4}
          />
        </label>
        <div className="club-share-actions club-manage-actions">
          <button className="primary-button" type="submit">
            Save post details
          </button>
          <Link
            className="chart-club-link club-view-public"
            href={`/chart-club/${id}`}
          >
            View public chart <span aria-hidden="true">→</span>
          </Link>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "Remove this public post? Your private chart and any copies others already made won’t be deleted.",
                )
              )
                void save("DELETE");
            }}
          >
            Remove post
          </button>
        </div>
      </fieldset>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
