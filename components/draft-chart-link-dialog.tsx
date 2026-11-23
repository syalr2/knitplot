"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ChartDocument } from "@/lib/chart";
import { chartLinkUrl } from "@/lib/chart-links";
import { downloadBlob, fileName } from "@/lib/browser-download";
import {
  listGuestLinkReceipts,
  newGuestLinkKey,
  readGuestLinkReceipt,
  removeGuestLinkReceipt,
  saveGuestLinkReceipt,
  type GuestLinkReceipt,
} from "@/lib/guest-link-receipts";
import { HttpError, responseJson } from "@/lib/http";
import { recordShareEvent } from "@/lib/usage-analytics";
import { stringifyKnitplot } from "@/lib/yoke-program-wire";

const endpoint = "/api/chart-links/draft";

function localReceipts() {
  try {
    return listGuestLinkReceipts(localStorage);
  } catch {
    return [];
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
  const restoreInput = useRef<HTMLInputElement>(null);
  const [receipts, setReceipts] = useState(localReceipts);
  const [selected, setSelected] = useState<string | null>(null);
  const currentReceipt = receipts.find((link) => link.tabId === tabId);
  const receipt = selected
    ? receipts.find((link) => link.revokeToken === selected)
    : currentReceipt;
  const [permission, setPermission] = useState(false);
  const [measurements, setMeasurements] = useState(false);
  const [savedHere, setSavedHere] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const link = receipt?.token
    ? chartLinkUrl(window.location.origin, receipt.token, receipt.slug)
    : "";

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  function remember(value: GuestLinkReceipt) {
    setReceipts((items) => [
      value,
      ...items.filter((item) => item.revokeToken !== value.revokeToken),
    ]);
    setSelected(value.revokeToken);
    try {
      saveGuestLinkReceipt(localStorage, value);
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
      const pending: GuestLinkReceipt = currentReceipt ?? {
        title: chart.name,
        tabId,
        revokeToken: newGuestLinkKey(),
      };
      // Never publish a permanent link without a recovery key saved first.
      try {
        saveGuestLinkReceipt(localStorage, pending);
      } catch {
        throw new Error(
          "Your browser couldn’t save a recovery key. Download an editable KnitPlot file instead.",
        );
      }
      remember(pending);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: stringifyKnitplot({
          document: chart,
          confirmRights: permission,
          shareYokeMeasurements: measurements,
          revokeToken: pending.revokeToken,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      remember(await readActiveReceipt(response, pending));
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

  async function readActiveReceipt(
    response: Response,
    original: GuestLinkReceipt,
  ) {
    const { token, slug } = await responseJson<{
      token: unknown;
      slug?: unknown;
    }>(response);
    const active = readGuestLinkReceipt({ ...original, token, slug });
    if (!active?.token)
      throw new Error(
        "KnitPlot could not read the new link. Try recovering it.",
      );
    return active;
  }

  async function recover(original: GuestLinkReceipt) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revokeToken: original.revokeToken }),
        signal: AbortSignal.timeout(15_000),
      });
      remember(await readActiveReceipt(response, original));
      setMessage("Link recovered.");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn’t recover the link.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function restore(file: File) {
    try {
      if (file.size > 8192) throw new Error();
      const value = JSON.parse(await file.text());
      const original = readGuestLinkReceipt(value);
      if (value?.format !== "knitplot-link-recovery" || !original)
        throw new Error();
      await recover({ ...original, tabId: undefined });
    } catch {
      setError("Choose a KnitPlot link recovery file.");
    }
  }

  function downloadRecovery(original: GuestLinkReceipt) {
    const { title, revokeToken, token, slug } = original;
    downloadBlob(
      new Blob(
        [
          JSON.stringify({
            format: "knitplot-link-recovery",
            title,
            revokeToken,
            token,
            slug,
          }),
        ],
        { type: "application/json" },
      ),
      fileName(original.title || "chart", "knitplot-link.json"),
    );
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
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok && response.status !== 404) await responseJson(response);
      try {
        removeGuestLinkReceipt(localStorage, receipt.revokeToken);
      } catch {
        // The remote link is already off even if the local receipt remains.
      }
      setReceipts((items) =>
        items.filter((item) => item.revokeToken !== receipt.revokeToken),
      );
      setSelected(null);
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
      {receipt?.token ? (
        <>
          <p>
            Sharing a snapshot of{" "}
            <strong>{receipt.title || "Untitled chart"}</strong>. Anyone with
            the link can open a copy until you turn it off.
          </p>
          {!savedHere && (
            <p role="alert">
              This browser couldn’t update the saved link details. Download the
              recovery file before closing.
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
                <button type="button" onClick={() => downloadRecovery(receipt)}>
                  Download recovery file
                </button>
                <button type="button" onClick={() => setConfirming(true)}>
                  Turn off link…
                </button>
              </>
            )}
          </div>
        </>
      ) : !selected || receipt?.tabId === tabId ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <p>
            Share a copy of the chart as it looks now. It won’t appear in Chart
            Club. Manage your links from any chart in this browser.
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
      ) : null}
      {receipt && !receipt.token && (
        <p className="draft-link-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => void recover(receipt)}
          >
            Check pending link
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => downloadRecovery(receipt)}
          >
            Download recovery file
          </button>
        </p>
      )}
      <details>
        <summary>Manage links</summary>
        <p>Recovery files can turn off a link. Keep them private.</p>
        <div className="draft-link-actions">
          {receipts.length > 0 && (
            <label>
              Links from this browser
              <select
                disabled={busy}
                value={
                  selected
                    ? String(
                        receipts.findIndex(
                          (item) => item.revokeToken === selected,
                        ),
                      )
                    : ""
                }
                onChange={(event) => {
                  setSelected(
                    event.target.value === ""
                      ? null
                      : (receipts[Number(event.target.value)]?.revokeToken ??
                          null),
                  );
                  setConfirming(false);
                  setError("");
                  setMessage("");
                }}
              >
                <option value="">Current chart</option>
                {receipts.map((item, index) => (
                  <option key={item.revokeToken} value={index}>
                    {item.title || "Untitled chart"}
                    {item.token ? "" : " (pending)"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <input
            type="file"
            ref={restoreInput}
            accept=".json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void restore(file);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => restoreInput.current?.click()}
          >
            Open recovery file
          </button>
        </div>
      </details>
      <p className="share-feedback" role="status">
        {message}
      </p>
      {error && <p role="alert">{error}</p>}
    </dialog>
  );
}
