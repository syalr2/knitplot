import { HttpError } from "./http";

export type SaveStatus = "idle" | "saving" | "saved" | "error";
type Item<T> = { data: T; snapshot: string; version?: string };
type Entry<T> = {
  current: Item<T>;
  saved: string;
  version?: string;
  running?: Promise<void>;
  stopped: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

/** One in-flight write per chart, with coalescing and independent per-chart timers. */
export class CloudSaveQueue<T> {
  private entries = new Map<string, Entry<T>>();
  constructor(
    private write: (id: string, data: T, version?: string) => Promise<string>,
    private notify: (
      id: string,
      status: SaveStatus,
      message: string,
      saved?: { version: string; snapshot: string },
    ) => void,
    private delay = 1200,
  ) {}
  enqueue(id: string, item: Item<T>, saved: string) {
    let entry = this.entries.get(id);
    if (!entry) {
      entry = {
        current: item,
        saved,
        version: item.version,
        stopped: false,
      };
      this.entries.set(id, entry);
    }
    const wasDirty = entry.current.snapshot !== entry.saved;
    entry.current = item;
    if (entry.stopped) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = undefined;
    if (entry.saved === item.snapshot) {
      if (wasDirty && !entry.running)
        this.notify(id, "saved", "Saved to My Charts");
      return;
    }
    this.notify(id, "saving", "Saving to My Charts…");
    entry.timer = setTimeout(() => void this.flush(id), this.delay);
  }
  flush(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry || entry.stopped) return Promise.resolve();
    if (entry.running) return entry.running;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = undefined;
    if (entry.current.snapshot === entry.saved) return Promise.resolve();
    entry.running = this.drain(id, entry).finally(() => {
      entry.running = undefined;
    });
    return entry.running;
  }
  private async drain(id: string, entry: Entry<T>) {
    while (!entry.stopped && entry.current.snapshot !== entry.saved) {
      const item = entry.current;
      try {
        this.notify(id, "saving", "Saving to My Charts…");
        const version = await this.write(id, item.data, entry.version);
        entry.version = version;
        entry.saved = item.snapshot;
        const caughtUp = entry.current.snapshot === entry.saved;
        this.notify(
          id,
          caughtUp ? "saved" : "saving",
          caughtUp ? "Saved to My Charts" : "Saving to My Charts…",
          {
            version,
            snapshot: item.snapshot,
          },
        );
      } catch (error) {
        entry.stopped = true;
        this.notify(
          id,
          "error",
          error instanceof HttpError && error.status === 409
            ? "This chart changed elsewhere. Your local work is safe; save it as a separate chart to keep both versions."
            : error instanceof Error
              ? error.message
              : "Cloud save failed. Your local copy is kept.",
        );
      }
    }
  }
  flushAll() {
    return Promise.all([...this.entries.keys()].map((id) => this.flush(id)));
  }
  retry(id: string) {
    const entry = this.entries.get(id);
    if (entry) entry.stopped = false;
    return this.flush(id);
  }
  hasPending(id?: string) {
    return [...this.entries.entries()].some(
      ([key, entry]) =>
        (!id || key === id) &&
        (entry.running !== undefined || entry.saved !== entry.current.snapshot),
    );
  }
  forgetSaved(id: string) {
    if (!this.hasPending(id)) {
      const entry = this.entries.get(id);
      if (entry?.timer) clearTimeout(entry.timer);
      this.entries.delete(id);
    }
  }
  forgetFailed(id: string) {
    const entry = this.entries.get(id);
    if (entry?.stopped && !entry.running) {
      if (entry.timer) clearTimeout(entry.timer);
      this.entries.delete(id);
    }
  }
}
