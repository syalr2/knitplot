"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

const STORAGE_KEY = "colorwork-chart-v1";
const MAX_TABS = 8;

type CloudChartResponse = {
  id: string;
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
      const result = await response.json() as CloudChartResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The chart could not be opened.");
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) as { format?: string; version?: number; activeTabId?: string; tabs?: Array<Record<string, unknown>> } : null;
      const tabs = saved?.format === "knitplot-workspace" && Array.isArray(saved.tabs) ? [...saved.tabs] : [];
      const existing = tabs.findIndex((tab) => tab.cloudId === id);
      const tab = {
        id: existing >= 0 ? tabs[existing].id : `chart-${crypto.randomUUID()}`,
        cloudId: id,
        document: result.document,
        knitProgress: result.knitProgress,
        preview: result.preview,
      };
      if (existing >= 0) tabs[existing] = tab;
      else {
        if (tabs.length >= MAX_TABS) throw new Error("Close one chart tab before opening another cloud chart.");
        tabs.push(tab);
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ format: "knitplot-workspace", version: 4, activeTabId: tab.id, tabs }));
      window.location.assign("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The chart could not be opened.");
      setBusy(null);
    }
  }

  async function deleteChart() {
    if (!window.confirm(`Delete “${name}” from My Charts? Your browser copy is not affected.`)) return;
    setBusy("delete");
    setError("");
    try {
      const response = await fetch(`/api/charts/${encodeURIComponent(id)}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The chart could not be deleted.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The chart could not be deleted.");
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
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The chart could not be renamed.");
      setRenaming(false);
      router.refresh();
      setBusy(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The chart could not be renamed.");
      setBusy(null);
    }
  }

  return <div className="cloud-chart-actions">{renaming ? <form className="cloud-rename-form" onSubmit={renameChart}><input aria-label={`New name for ${name}`} autoFocus maxLength={200} value={draftName} onChange={(event) => setDraftName(event.target.value)} /><button className="primary-button" type="submit" disabled={busy !== null || !draftName.trim()}>{busy === "rename" ? "Saving…" : "Save"}</button><button type="button" disabled={busy !== null} onClick={() => { setDraftName(name); setRenaming(false); }}>Cancel</button></form> : <><button className="primary-button" onClick={openChart} disabled={busy !== null}>{busy === "open" ? "Opening…" : "Open"}</button><button onClick={() => { setDraftName(name); setRenaming(true); setError(""); }} disabled={busy !== null}>Rename</button><button onClick={deleteChart} disabled={busy !== null}>{busy === "delete" ? "Deleting…" : "Delete"}</button></>}{error ? <p role="alert">{error}</p> : null}</div>;
}
