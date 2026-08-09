"use client";

import { FormEvent, useState } from "react";

type Props = { connected: boolean; lastFour?: string };

export function AccountKeyForm({ connected: initialConnected, lastFour: initialLastFour }: Props) {
  const [connected, setConnected] = useState(initialConnected);
  const [lastFour, setLastFour] = useState(initialLastFour);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function connect(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/openai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const result = await response.json() as { error?: string; lastFour?: string };
      if (!response.ok) throw new Error(result.error ?? "The connection could not be saved.");
      setConnected(true);
      setLastFour(result.lastFour);
      setApiKey("");
      setMessage("OpenAI is connected. AI features are now available in the chart maker.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The connection could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/openai-key", { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The connection could not be removed.");
      setConnected(false);
      setLastFour(undefined);
      setMessage("OpenAI has been disconnected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The connection could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="key-connection">
      {connected ? (
        <>
          <div className="connection-status"><span aria-hidden="true" /><div><strong>Connected</strong><small>API key ending in ••••{lastFour}</small></div></div>
          <button type="button" onClick={disconnect} disabled={busy}>{busy ? "Disconnecting…" : "Disconnect OpenAI"}</button>
        </>
      ) : (
        <form className="account-form" onSubmit={connect}>
          <label>OpenAI API key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" placeholder="sk-…" required minLength={20} maxLength={500} /></label>
          <button className="primary-button" type="submit" disabled={busy || apiKey.length < 20}>{busy ? "Checking key…" : "Connect OpenAI"}</button>
        </form>
      )}
      {message ? <p className="account-notice" role="status">{message}</p> : null}
    </div>
  );
}

