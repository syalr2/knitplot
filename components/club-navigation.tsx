"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClubHeart } from "./club-heart";

export function ClubNavigation({ active }: { active: "explore" | "mine" }) {
  const path = usePathname();
  const following = path === "/chart-club/following";
  const hearted = path === "/chart-club/hearted";
  return (
    <div className="library-main-nav">
      <Link href="/">Chart maker</Link>
      <Link
        href="/chart-club"
        className={
          active === "explore" && !following && !hearted ? "active" : undefined
        }
      >
        Explore
      </Link>
      <Link
        href="/chart-club/hearted"
        aria-current={hearted ? "page" : undefined}
        aria-label="My hearts"
        className={hearted ? "club-hearts-label active" : "club-hearts-label"}
      >
        My <ClubHeart filled />s
      </Link>
      <Link
        href="/chart-club/following"
        className={following ? "active" : undefined}
        aria-current={following ? "page" : undefined}
      >
        Following
      </Link>
      <Link
        href="/my-charts"
        className={active === "mine" ? "active" : undefined}
        aria-current={active === "mine" ? "page" : undefined}
      >
        My Charts
      </Link>
    </div>
  );
}
