"use client";

import { useEffect, useRef, useState } from "react";
import { clubShareLink } from "@/lib/club-share-link";
import { recordShareEvent } from "@/lib/usage-analytics";

export function ClubCopyLink({
  id,
  placement,
  sharedVisit = false,
}: {
  id: string;
  placement: "post" | "after_publish";
  sharedVisit?: boolean;
}) {
  const [status, setStatus] = useState("");
  const [manualLink, setManualLink] = useState("");
  const trackedVisit = useRef<string | null>(null);

  useEffect(() => {
    if (!sharedVisit || trackedVisit.current === id) return;
    trackedVisit.current = id;
    recordShareEvent({ name: "Shared chart visited" });
  }, [id, sharedVisit]);

  async function copyLink() {
    const link = clubShareLink(id, window.location.origin);
    try {
      await navigator.clipboard.writeText(link);
      setManualLink("");
      setStatus("Link copied.");
      recordShareEvent({ name: "Chart link copied", placement });
    } catch {
      setManualLink(link);
      setStatus("Select and copy the link below.");
    }
  }

  return (
    <div className="club-copy-link">
      <button type="button" className="chart-club-link" onClick={copyLink}>
        Copy link
      </button>
      <small className="share-feedback" role="status">
        {status}
      </small>
      {manualLink && (
        <input
          readOnly
          aria-label="Link to public chart"
          value={manualLink}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </div>
  );
}
