"use client";

import Link from "next/link";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { AccountAvatar } from "@/components/account-avatar";
import { CloudChartActions } from "@/components/cloud-chart-actions";
import { defaultKnitProgress } from "@/components/knit-mode";
import type { AccountAvatar as Avatar } from "@/lib/account-preferences";
import { cloneDocument, defaultDocument, type ChartDocument } from "@/lib/chart";
import type { ChartSummary } from "@/lib/chart-summary";
import { readProject } from "@/lib/project-file";

type SortMode = "updated-desc" | "updated-asc" | "name";
type ViewMode = "grid" | "list";

type Props = {
  charts: ChartSummary[];
  email: string | null;
  avatar: Avatar;
  initialPinnedIds: string[];
  loadError: boolean;
};

const STORAGE_KEY = "colorwork-chart-v1";
const MAX_TABS = 8;

type StoredWorkspace = {
  format?: string;
  version?: number;
  activeTabId?: string;
  tabs?: Array<Record<string, unknown>>;
};

function ChartThumbnail({ chart }: { chart: ChartSummary }) {
  return (
    <div className="library-thumbnail" aria-label={`Preview of ${chart.name}`} role="img">
      {chart.preview.map((row, rowIndex) => (
        <div key={rowIndex} style={{ gridTemplateColumns: `repeat(${row.length}, 1fr)` }}>
          {row.map((color, columnIndex) => <span key={columnIndex} style={{ backgroundColor: color }} />)}
        </div>
      ))}
    </div>
  );
}

function Palette({ colors }: { colors: string[] }) {
  return <span className="library-palette" aria-label={`${colors.length} colours`}>{colors.map((color) => <i key={color} style={{ backgroundColor: color }} />)}</span>;
}

function formattedDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function MyChartsLibrary({ charts, email, avatar, initialPinnedIds, loadError }: Props) {
  const importRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("updated-desc");
  const [view, setView] = useState<ViewMode>("grid");
  const [pinnedIds, setPinnedIds] = useState(() => new Set(initialPinnedIds));
  const [pinBusy, setPinBusy] = useState(() => new Set<string>());
  const [message, setMessage] = useState("");

  const visibleCharts = useMemo(() => {
    const filtered = charts.filter((chart) => chart.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    return filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      const difference = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      return sort === "updated-asc" ? difference : -difference;
    });
  }, [charts, query, sort]);

  const pinnedCharts = visibleCharts.filter((chart) => pinnedIds.has(chart.id));
  const unpinnedCharts = visibleCharts.filter((chart) => !pinnedIds.has(chart.id));

  async function togglePin(chart: ChartSummary) {
    const shouldPin = !pinnedIds.has(chart.id);
    const previous = new Set(pinnedIds);
    const next = new Set(pinnedIds);
    if (shouldPin) next.add(chart.id);
    else next.delete(chart.id);
    setPinnedIds(next);
    setPinBusy((current) => new Set(current).add(chart.id));
    setMessage("");
    try {
      const response = await fetch("/api/account/preferences/pins", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chartId: chart.id, pinned: shouldPin }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The pin could not be saved.");
    } catch (error) {
      setPinnedIds(previous);
      setMessage(error instanceof Error ? error.message : "The pin could not be saved.");
    } finally {
      setPinBusy((current) => {
        const updated = new Set(current);
        updated.delete(chart.id);
        return updated;
      });
    }
  }

  function openLocalDocument(document: ChartDocument) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) as StoredWorkspace : null;
      const tabs = saved?.format === "knitplot-workspace" && Array.isArray(saved.tabs) ? [...saved.tabs] : [];
      if (tabs.length >= MAX_TABS) throw new Error("Close one chart tab before opening another chart.");
      const id = `chart-${crypto.randomUUID()}`;
      tabs.push({
        id,
        document: cloneDocument(document),
        knitProgress: { ...defaultKnitProgress },
        preview: { repeatX: 1, repeatY: 1, repeatStyle: "normal", renderedRepeatX: 1, renderedRepeatY: 1, renderedRepeatStyle: "normal" },
      });
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ format: "knitplot-workspace", version: 4, activeTabId: id, tabs }));
      window.location.assign("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The chart could not be opened.");
    }
  }

  function createNewChart() {
    openLocalDocument(cloneDocument(defaultDocument));
  }

  async function importChart(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) {
      setMessage("That project file is too large. KnitPlot files must be under 5 MB.");
      return;
    }
    try {
      openLocalDocument(readProject(JSON.parse(await file.text())));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The project could not be opened.");
    }
  }

  function PinButton({ chart }: { chart: ChartSummary }) {
    const pinned = pinnedIds.has(chart.id);
    return <button type="button" className={`library-pin ${pinned ? "active" : ""}`} onClick={() => void togglePin(chart)} disabled={pinBusy.has(chart.id)} aria-label={pinned ? `Unpin ${chart.name}` : `Pin ${chart.name}`} aria-pressed={pinned} title={pinned ? "Pinned — click to unpin" : "Not pinned — click to pin"}>{pinned ? "★" : "☆"}</button>;
  }

  function gridCard(chart: ChartSummary) {
    return (
      <article className="library-card" key={chart.id}>
        <div className="library-card-preview"><ChartThumbnail chart={chart} /><PinButton chart={chart} /></div>
        <div className="library-card-copy">
          <div className="library-card-title"><h2>{chart.name}</h2><span>{chart.width} × {chart.height} st</span></div>
          <Palette colors={chart.palette} />
          <p>Edited {formattedDate(chart.updatedAt)}</p>
          <CloudChartActions id={chart.id} name={chart.name} />
        </div>
      </article>
    );
  }

  return (
    <main className="library-page">
      <nav className="library-nav">
        <Link className="library-brand" href="/"><span aria-hidden="true" />KnitPlot</Link>
        <div className="library-main-nav"><Link href="/">Chart maker</Link><Link className="active" href="/my-charts">My charts</Link></div>
        <Link className="library-account-link" href="/account"><AccountAvatar avatar={avatar} /><span>{email ?? "Account"}</span></Link>
      </nav>

      <section className="library-shell">
        <input ref={importRef} className="visually-hidden" type="file" accept=".knitplot,.colorwork.json,application/json" onChange={(event) => void importChart(event)} />
        <header className="library-heading">
          <div><h1>My charts</h1><p>{charts.length} {charts.length === 1 ? "chart" : "charts"} saved to your account</p></div>
          <button className="primary-button library-new-chart" type="button" onClick={createNewChart}><span aria-hidden="true">＋</span>New chart</button>
        </header>

        <div className="library-toolbar">
          <label className="library-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your charts" /></label>
          <label className="library-sort"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}><option value="updated-desc">Last edited</option><option value="updated-asc">Oldest edited</option><option value="name">Name</option></select></label>
          <div className="library-view-toggle" aria-label="Chart view">
            <button type="button" className={view === "grid" ? "active" : ""} aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}>▦</button>
            <button type="button" className={view === "list" ? "active" : ""} aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}>☰</button>
          </div>
        </div>

        {message ? <p className="library-message error" role="status">{message}</p> : null}
        {loadError ? <p className="library-message error">KnitPlot could not load your saved charts. Please refresh and try again.</p> : null}
        {!loadError && !charts.length ? <div className="library-empty"><span aria-hidden="true">◇</span><h2>No saved charts yet</h2><p>Start with a blank chart, or bring in a KnitPlot file already saved on this computer.</p><div><button className="primary-button" type="button" onClick={createNewChart}>Create a chart</button><button type="button" onClick={() => importRef.current?.click()}>Import a local chart</button></div></div> : null}
        {!loadError && charts.length > 0 && !visibleCharts.length ? <p className="library-message">No charts match “{query}”.</p> : null}

        {!loadError && visibleCharts.length > 0 ? (
          <>
            {view === "grid" ? (
              <>
                {pinnedCharts.length ? <section className="library-chart-section"><div className="library-section-heading pinned"><span>★ Pinned</span><i /></div><div className="library-grid">{pinnedCharts.map(gridCard)}</div></section> : null}
                {unpinnedCharts.length ? <section className="library-chart-section"><div className="library-section-heading"><span>All charts</span><i /></div><div className="library-grid">{unpinnedCharts.map(gridCard)}</div></section> : null}
              </>
            ) : (
              <section className="library-chart-section">
                <div className="library-section-heading"><span>All charts</span><i /></div>
                <div className="library-list">
                <div className="library-list-header"><span>Chart</span><span>Name</span><span>Size</span><span>Colours</span><span>Last edited</span><span /></div>
                {[...pinnedCharts, ...unpinnedCharts].map((chart) => (
                  <article className="library-list-row" key={chart.id}>
                    <div className="library-list-preview"><ChartThumbnail chart={chart} /><PinButton chart={chart} /></div>
                    <h2>{chart.name}</h2>
                    <span className="library-size">{chart.width} × {chart.height} st</span>
                    <Palette colors={chart.palette} />
                    <span className="library-date">{formattedDate(chart.updatedAt)}</span>
                    <CloudChartActions id={chart.id} name={chart.name} />
                  </article>
                ))}
                </div>
              </section>
            )}
            <aside className="library-local-panel"><div><span aria-hidden="true">◎</span><div><h2>Your charts travel with you.</h2><p>Account charts are available across your devices. Local KnitPlot files always remain another option.</p></div></div><button type="button" onClick={() => importRef.current?.click()}>Import a local chart</button></aside>
          </>
        ) : null}
      </section>
    </main>
  );
}
