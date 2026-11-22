"use client";

import { useState, useSyncExternalStore } from "react";
import { chartLinkUrl } from "@/lib/chart-links";
import { responseJson } from "@/lib/http";

const subscribe = () => () => {};
const browserOrigin = () => window.location.origin;
const serverOrigin = () => "";

export function ChartLinkManager({
  sourceId,
  version,
  hasYoke,
  initialToken,
  linkTitle,
}: {
  sourceId: string;
  version: number;
  hasYoke: boolean;
  initialToken: string | null;
  linkTitle: string;
}) {
  const [token, setToken] = useState(initialToken);
  const origin = useSyncExternalStore(subscribe, browserOrigin, serverOrigin);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const link = token && origin ? chartLinkUrl(origin, token, linkTitle) : "";

  async function changeLink(method: "POST" | "DELETE") {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/chart-links", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          method === "POST"
            ? { sourceId, version, shareYokeMeasurements: consent }
            : { sourceId, token },
        ),
      });
      if (method === "POST") {
        const result = await responseJson<{ token: string }>(response);
        setToken(result.token);
        setStatus("Link created.");
      } else {
        if (!response.ok) await responseJson(response);
        setToken(null);
        setConfirming(false);
        setConsent(false);
        setStatus("Link turned off.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setStatus("Link copied.");
    } catch {
      setStatus("Select and copy the link from the field.");
    }
  }

  return (
    <section className="club-share-form">
      <p>
        Anyone with the link can open and save their own copy. It won’t appear
        in Chart Club.
      </p>
      {!token ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void changeLink("POST");
          }}
        >
          <p>
            The link shares a snapshot of your saved chart. Later edits stay in
            your original.
          </p>
          {hasYoke && (
            <label className="chart-link-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                required
              />
              Include this yoke’s planning measurements in the editable copy
            </label>
          )}
          <button
            className="primary-button"
            disabled={busy || (hasYoke && !consent)}
          >
            Create link
          </button>
        </form>
      ) : (
        <>
          <label>
            Unlisted chart link
            <input
              type="url"
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          {confirming && (
            <p>Turn off this link? Any copies already saved will still work.</p>
          )}
          <div className="club-share-actions">
            {confirming ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void changeLink("DELETE")}
                >
                  Turn off link
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!link}
                  onClick={copy}
                >
                  Copy link
                </button>
                <button type="button" onClick={() => setConfirming(true)}>
                  Turn off link…
                </button>
              </>
            )}
          </div>
        </>
      )}
      <p className="share-feedback" role="status">
        {status}
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
