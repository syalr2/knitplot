"use client";

import { useState } from "react";
import { ClubHeart } from "./club-heart";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { responseJson } from "@/lib/http";

export function ClubPostActions({
  id,
  initialHearted,
  signedIn,
  report = false,
  moderate = false,
  showHeart = !report && !moderate,
}: {
  id: string;
  initialHearted: boolean;
  signedIn: boolean;
  report?: boolean;
  showHeart?: boolean;
  moderate?: boolean;
}) {
  const router = useRouter();
  const [hearted, setHearted] = useState(initialHearted);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(body: object, success: () => void) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/chart-club/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      if (!res.ok) await responseJson(res);
      success();
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="club-post-actions">
      {showHeart &&
        (signedIn ? (
          <button
            type="button"
            aria-label="Heart chart"
            aria-pressed={hearted}
            disabled={busy}
            onClick={() =>
              void submit({ action: "heart", hearted: !hearted }, () =>
                setHearted(!hearted),
              )
            }
          >
            <ClubHeart filled={hearted} />
          </button>
        ) : (
          <Link href="/sign-in" aria-label="Sign in to heart this chart">
            <ClubHeart />
          </Link>
        ))}
      {report &&
        (signedIn ? (
          <details>
            <summary>Report chart</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit(
                  {
                    action: "report",
                    reason: new FormData(event.currentTarget).get("reason"),
                  },
                  () => setMessage("Report sent privately."),
                );
              }}
            >
              <label>
                Reason{" "}
                <select name="reason" required defaultValue="">
                  <option value="" disabled>
                    Choose a reason
                  </option>
                  <option value="spam">Spam</option>
                  <option value="permission">Shared without permission</option>
                  <option value="other">Other issue</option>
                </select>
              </label>
              <button type="submit" disabled={busy}>
                Send report
              </button>
            </form>
          </details>
        ) : (
          <Link href="/sign-in">Sign in to report</Link>
        ))}
      {moderate && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "Take down this public post? Its private original will not be changed.",
              )
            )
              void submit({ action: "remove" }, () =>
                setMessage("Post taken down."),
              );
          }}
        >
          Take down post
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
