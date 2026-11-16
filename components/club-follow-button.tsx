"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { responseJson } from "@/lib/http";

export function ClubFollowButton({
  handle,
  initialFollowing,
}: {
  handle: string;
  initialFollowing: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className={following ? "secondary-button" : "primary-button"}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/chart-club/follow", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ handle, following: !following }),
            });
            if (!response.ok) await responseJson(response);
            setFollowing(!following);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Please try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {following ? "Unfollow" : "Follow"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
