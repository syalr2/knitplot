"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { responseJson } from "@/lib/http";
import { clubProfileUsername } from "@/lib/club-profile";

export function ClubProfileForm({
  displayName,
  bio,
  ravelryUrl,
  instagramUrl,
  tiktokUrl,
}: {
  displayName: string;
  bio: string;
  ravelryUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  return (
    <details className="club-profile-disclosure">
      <summary>Edit your public profile</summary>
      <form
        className="club-share-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          setBusy(true);
          setError("");
          setNotice("");
          try {
            const response = await fetch("/api/chart-club/profile", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(Object.fromEntries(fields)),
            });
            if (!response.ok) await responseJson(response);
            setNotice("Public profile saved.");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Please try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Display name (optional)
            <input
              name="displayName"
              maxLength={60}
              defaultValue={displayName}
            />
          </label>
          <label>
            Bio (optional)
            <textarea name="bio" maxLength={400} defaultValue={bio} rows={3} />
          </label>
          <label>
            Ravelry username (optional)
            <input
              name="ravelryUsername"
              autoCapitalize="none"
              maxLength={81}
              defaultValue={clubProfileUsername(ravelryUrl)}
            />
          </label>
          <label>
            Instagram username (optional)
            <input
              name="instagramUsername"
              autoCapitalize="none"
              maxLength={31}
              defaultValue={clubProfileUsername(instagramUrl)}
            />
          </label>
          <label>
            TikTok username (optional)
            <input
              name="tiktokUsername"
              autoCapitalize="none"
              maxLength={25}
              defaultValue={clubProfileUsername(tiktokUrl)}
            />
          </label>
          <button className="primary-button" type="submit">
            Save public profile
          </button>
        </fieldset>
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
