"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import {
  STORAGE_KEY,
  readWorkspace,
  readStoredWorkspace,
  openCloudTab,
  tabSnapshot,
} from "@/lib/workspace";
import { readCloudChartPayload } from "@/lib/cloud-charts";
import { responseJson } from "@/lib/http";
import { cloudVersionToken } from "@/lib/cloud-revision";

type CloudChartResponse = {
  id: string;
  updatedAt: string;
  version: number;
  document: Record<string, unknown>;
  knitProgress: Record<string, unknown>;
  preview: Record<string, unknown>;
};

export function CloudChartActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"open" | "rename" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(name);

  async function openChart() {
    setBusy("open");
    setError("");
    try {
      const response = await fetch(`/api/charts/${encodeURIComponent(id)}`);
      const result = await responseJson<CloudChartResponse>(response);
      const saved = readStoredWorkspace(window.localStorage);
      const payload = readCloudChartPayload(result);
      const tab = {
        id: `chart-${crypto.randomUUID()}`,
        cloudId: id,
        cloudVersion: cloudVersionToken(result),
        ...payload,
        cloudSnapshot: tabSnapshot(payload),
      };
      const workspace = openCloudTab(saved, tab);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- A full navigation restores the updated workspace rather than reusing a mounted editor.
      window.location.assign("/");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The chart could not be opened.",
      );
      setBusy(null);
    }
  }

  async function deleteChart() {
    if (
      !window.confirm(
        `Delete “${name}” from My Charts? Your browser copy is not affected.`,
      )
    )
      return;
    setBusy("delete");
    setError("");
    try {
      const response = await fetch(`/api/charts/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const result = await responseJson<{ error?: string }>(response);
      if (!response.ok)
        throw new Error(result.error ?? "The chart could not be deleted.");
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const workspace = readWorkspace(JSON.parse(raw)).workspace;
        workspace.tabs = workspace.tabs.map((tab) =>
          tab.cloudId === id
            ? {
                ...tab,
                cloudId: undefined,
                cloudVersion: undefined,
                cloudSnapshot: undefined,
              }
            : tab,
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      }
      setBusy(null);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The chart could not be deleted.",
      );
      setBusy(null);
    }
  }

  async function renameChart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = draftName.trim();
    if (!nextName || nextName === name) return;
    setBusy("rename");
    setError("");
    try {
      const response = await fetch(`/api/charts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const result = await responseJson<{ error?: string }>(response);
      if (!response.ok)
        throw new Error(result.error ?? "The chart could not be renamed.");
      // Preserve any open local working copy; its stale revision will cause a
      // conflict rather than silently overwriting this explicit rename.
      setRenaming(false);
      router.refresh();
      setBusy(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The chart could not be renamed.",
      );
      setBusy(null);
    }
  }

  return (
    <div className="cloud-chart-actions">
      {renaming ? (
        <form className="cloud-rename-form" onSubmit={renameChart}>
          <input
            aria-label={`New name for ${name}`}
            autoFocus
            maxLength={200}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
          />
          <button
            className="primary-button"
            type="submit"
            disabled={busy !== null || !draftName.trim()}
          >
            {busy === "rename" ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              setDraftName(name);
              setRenaming(false);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <button
            className="primary-button"
            onClick={openChart}
            disabled={busy !== null}
          >
            {busy === "open" ? "Opening…" : "Open"}
          </button>
          <button
            onClick={() => {
              setDraftName(name);
              setRenaming(true);
              setError("");
            }}
            disabled={busy !== null}
          >
            Rename
          </button>
          <button onClick={deleteChart} disabled={busy !== null}>
            {busy === "delete" ? "Deleting…" : "Delete"}
          </button>
        </>
      )}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
