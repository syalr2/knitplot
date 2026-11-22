"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ChartDocument } from "@/lib/chart";
import {
  chartLinkUrl,
  chartLinkSlug,
  isChartLinkToken,
  isDraftChartLinkToken,
} from "@/lib/chart-links";
import { HttpError, responseJson } from "@/lib/http";
import { recordShareEvent } from "@/lib/usage-analytics";
import { stringifyKnitplot } from "@/lib/yoke-program-wire";

type Keys = { token: string; revokeToken: string };
type Receipt = Keys & { slug: string };
const endpoint = "/api/chart-links/draft";
const keyFor = (tabId: string) => `knitplot-draft-link-v1:${tabId}`;

function readReceipt(tabId: string): Receipt | null {
  try {
    const value = JSON.parse(localStorage.getItem(keyFor(tabId)) ?? "null");
    return value &&
      isDraftChartLinkToken(value.token) &&
      isChartLinkToken(value.revokeToken) &&
      typeof value.slug === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}

export function DraftChartLinkDialog({
  chart,
  tabId,
  onClose,
}: {
  chart: ChartDocument;
  tabId: string;
  onClose: () => void;
}) {
  const title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [receipt, setReceipt] = useState(() => readReceipt(tabId));
  const [permission, setPermission] = useState(false);
  const [measurements, setMeasurements] = useState(false);
  const [savedHere, setSavedHere] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const link = receipt
    ? chartLinkUrl(window.location.origin, receipt.token, receipt.slug)
    : "";

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  function remember(value: Receipt | null) {
    setReceipt(value);
    try {
      if (value) localStorage.setItem(keyFor(tabId), JSON.stringify(value));
      else localStorage.removeItem(keyFor(tabId));
      setSavedHere(true);
    } catch {
      setSavedHere(false);
    }
  }

  async function create() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: stringifyKnitplot({
          document: chart,
          confirmRights: permission,
          shareYokeMeasurements: measurements,
        }),
      });
      const keys = await responseJson<Keys>(response);
      remember({ ...keys, slug: chartLinkSlug(chart.name) });
      setMessage("Link created.");
    } catch (failure) {
      setError(
        failure instanceof HttpError && failure.status === 413
          ? "This chart is too large for a link. Download an editable KnitPlot file instead."
          : failure instanceof Error
            ? failure.message
            : "Couldn’t create the link.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!receipt) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: receipt.token,
          revokeToken: receipt.revokeToken,
        }),
      });
      if (!response.ok && response.status !== 404) await responseJson(response);
      remember(null);
      setConfirming(false);
      setMessage("Link turned off.");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn’t turn off the link.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      recordShareEvent({ name: "Chart link copied", placement: "editor" });
      setMessage("Link copied.");
    } catch {
      setMessage("Select and copy the link from the field.");
    }
  }

  return (
    <dialog
      className="share-preview-dialog draft-chart-link-dialog"
      ref={dialog}
      aria-labelledby={title}
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <div className="share-preview-heading">
        <h2 id={title}>Share a link</h2>
        <button
          type="button"
          aria-label="Close share link"
          disabled={busy}
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
      </div>
      {receipt ? (
        <>
          <p>Anyone with the link can open a copy until you turn it off.</p>
          {!savedHere && (
            <p role="alert">
              This browser couldn’t remember the link. You can turn it off here
              before closing.
            </p>
          )}
          <label className="draft-link-field">
            Unlisted chart link
            <input
              type="url"
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          {confirming && (
            <p>Turn off this link? Copies already saved will still work.</p>
          )}
          <div className="draft-link-actions">
            {confirming ? (
              <>
                <button type="button" disabled={busy} onClick={revoke}>
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
                <button type="button" className="primary-button" onClick={copy}>
                  Copy link
                </button>
                <button type="button" onClick={() => setConfirming(true)}>
                  Turn off link…
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <p>
            Share a copy of the chart as it looks now. It won’t appear in Chart
            Club. To turn off the link later, return to this chart in the same
            browser.
          </p>
          <label className="draft-link-check">
            <input
              type="checkbox"
              checked={permission}
              onChange={(event) => setPermission(event.target.checked)}
              required
            />
            I made this chart or have permission to share it
          </label>
          {chart.yoke && (
            <label className="draft-link-check">
              <input
                type="checkbox"
                checked={measurements}
                onChange={(event) => setMeasurements(event.target.checked)}
                required
              />
              Include this yoke’s planning measurements in the editable copy
            </label>
          )}
          <button
            className="primary-button"
            type="submit"
            disabled={
              busy || !permission || Boolean(chart.yoke && !measurements)
            }
          >
            {busy ? "Creating link…" : "Create link"}
          </button>
        </form>
      )}
      <p className="share-feedback" role="status">
        {message}
      </p>
      {error && <p role="alert">{error}</p>}
    </dialog>
  );
}
