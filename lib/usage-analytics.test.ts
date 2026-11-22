import assert from "node:assert/strict";
import { test } from "node:test";
import {
  recordClubCopyEdited,
  recordClubCopyOpened,
  recordShareEvent,
  recordUsage,
} from "./usage-analytics";

test("usage events are bounded, contain only coarse categories, and never block work", () => {
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const priorNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  const priorEnvironment = process.env.NODE_ENV;
  const events: unknown[] = [];
  const sessionValues = new Map<string, string>();
  const browser = {
    location: { hostname: "knitplot.art" },
    vam: "production",
    va: (...args: unknown[]) => events.push(args),
    sessionStorage: {
      setItem: (key: string, value: string) => sessionValues.set(key, value),
      getItem: (key: string) => sessionValues.get(key),
      removeItem: (key: string) => sessionValues.delete(key),
    },
  };
  const context = { account: "guest", chart_type: "regular" } as const;
  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: browser,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { doNotTrack: "1" },
    });
    Reflect.set(process.env, "NODE_ENV", "production");
    recordUsage(context);
    recordShareEvent({ name: "Shared chart visited" });
    recordClubCopyOpened("unused-tab", "shared_link");
    assert.equal(events.length, 0);
    assert.equal(sessionValues.size, 0);
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { doNotTrack: "0" },
    });
    browser.location.hostname = "localhost";
    recordUsage(context);
    assert.equal(events.length, 0);
    browser.location.hostname = "knitplot.art";
    recordUsage(context);
    recordUsage(context);
    recordUsage(context, "knitplot");
    recordUsage(context, "knitplot");
    assert.equal(events.length, 3);
    assert.deepEqual(events[0], [
      "event",
      {
        name: "Chart edited",
        options: undefined,
        data: { account: "guest", chart_type: "regular" },
      },
    ]);
    assert.deepEqual(events[1], [
      "event",
      {
        name: "File downloaded",
        options: undefined,
        data: { account: "guest", chart_type: "regular", format: "knitplot" },
      },
    ]);
    events.length = 0;
    recordShareEvent({ name: "Chart link copied", placement: "after_publish" });
    recordShareEvent({ name: "Shared chart visited" });
    recordClubCopyOpened("local-tab-not-for-analytics", "shared_link");
    recordClubCopyEdited("another-tab");
    recordClubCopyEdited("local-tab-not-for-analytics");
    recordClubCopyEdited("local-tab-not-for-analytics");
    recordShareEvent({
      name: "Share image downloaded",
      view: "sweater",
      credit: false,
    });
    assert.deepEqual(
      events.map((event) => (event as [string, { name: string }])[1].name),
      [
        "Chart link copied",
        "Shared chart visited",
        "Chart Club copy opened",
        "Chart Club copy edited",
        "Share image downloaded",
      ],
    );
    assert.match(JSON.stringify(events), /"entry":"shared_link"/);
    assert.doesNotMatch(JSON.stringify(events), /local-tab|another-tab/);
    assert.equal(sessionValues.size, 0);
    browser.va = () => {
      throw new Error("Analytics unavailable");
    };
    assert.doesNotThrow(() => recordUsage(context, "knitplot"));
  } finally {
    if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (priorNavigator)
      Object.defineProperty(globalThis, "navigator", priorNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (priorEnvironment === undefined)
      Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", priorEnvironment);
  }
});
