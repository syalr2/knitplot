import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { AccountAvatar } from "@/components/account-avatar";
import {
  defaultAccountAvatar,
  parseAccountAvatar,
} from "@/lib/account-preferences";
import { ClubCardGrid, type ClubCard } from "@/components/club-card-grid";
import { ClubFollowButton } from "@/components/club-follow-button";
import { accountsConfigured } from "@/lib/auth-config";
import { getViewer } from "@/lib/auth";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

async function creatorAvatar(userId: string, handle: string) {
  if (accountsConfigured() && userId.startsWith("user_")) {
    try {
      const clerk = await clerkClient();
      const user = await clerk.users.getUser(userId);
      return parseAccountAvatar(user.publicMetadata, handle);
    } catch {
      // The profile should still be readable if Clerk is unavailable.
    }
  }
  return defaultAccountAvatar(handle);
}

export default async function CreatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { handle } = await params;
  const { page: rawPage } = await searchParams;
  const page =
    typeof rawPage === "string" && /^\d{1,6}$/.test(rawPage)
      ? Math.max(1, Number(rawPage))
      : 1;
  const pageSize = 24;
  const sql = getDatabase();
  if (!sql || !/^[a-z0-9_]{3,24}$/.test(handle)) notFound();
  const viewer = await getViewer();
  const [profile] = await sql`
    select handle, user_id, display_name, bio, ravelry_url, instagram_url, tiktok_url, user_id = ${viewer?.id ?? null} as own,
      exists (select 1 from knitplot_club_follows f
        where f.creator_id = knitplot_club_creators.user_id and f.follower_id = ${viewer?.id ?? null}) as following
    from knitplot_club_creators where user_id = (
      select creator_id from knitplot_club_handles where handle = ${handle}
    )
    and (user_id = ${viewer?.id ?? null} or exists (
      select 1 from knitplot_club_public_posts where creator_id = knitplot_club_creators.user_id
    ))
  `;
  if (!profile) notFound();
  if (profile.handle !== handle)
    redirect(
      `/chart-club/creators/${profile.handle}${page > 1 ? `?page=${page}` : ""}`,
    );
  const [postRows, avatar] = await Promise.all([
    sql`
    select p.id, p.title, p.summary->'preview' as preview, c.handle,
      p.summary->'cover' as cover, p.summary->>'coverView' as cover_view, p.summary->>'coverRatio' as cover_ratio,
      exists (select 1 from knitplot_club_hearts where post_id = p.id and user_id = ${viewer?.id ?? null}) as hearted
    from knitplot_club_public_posts p join knitplot_club_creators c on c.user_id = p.creator_id
    where c.handle = ${handle} order by p.published_at desc, p.id desc
    limit ${pageSize + 1} offset ${(page - 1) * pageSize}
  `,
    creatorAvatar(profile.user_id, profile.handle),
  ]);
  const posts = postRows as ClubCard[];
  return (
    <>
      <header className="club-creator-header">
        <AccountAvatar avatar={avatar} className="club-creator-mark" />
        <div className="club-creator-info">
          <h1>{profile.display_name || `@${handle}`}</h1>
          {profile.display_name && (
            <p className="club-creator-handle">@{handle}</p>
          )}
          {profile.bio && (
            <p className="club-description club-creator-bio">{profile.bio}</p>
          )}
          <div className="club-creator-links">
            {(
              [
                ["Ravelry", profile.ravelry_url],
                ["Instagram", profile.instagram_url],
                ["TikTok", profile.tiktok_url],
              ] as const
            ).map(([label, url]) =>
              url ? (
                <a
                  key={label}
                  href={url}
                  rel="ugc noreferrer"
                  className="chart-club-link"
                >
                  {label}
                </a>
              ) : null,
            )}
          </div>
        </div>
        <div className="club-creator-actions">
          {profile.own ? (
            <Link className="text-button" href="/account">
              Edit profile in Account Settings
            </Link>
          ) : viewer ? (
            <ClubFollowButton
              handle={handle}
              initialFollowing={profile.following}
            />
          ) : !viewer && accountsConfigured() ? (
            <Link className="chart-club-link primary-button" href="/sign-in">
              Sign in to follow
            </Link>
          ) : null}
        </div>
      </header>
      <h2 className="club-creator-charts-title">Shared charts</h2>
      {!posts.length ? (
        <p>
          {page === 1 ? "No shared charts yet." : "No charts on this page."}
        </p>
      ) : (
        <ClubCardGrid
          posts={posts.slice(0, pageSize)}
          signedIn={Boolean(viewer)}
        />
      )}
      {(page > 1 || posts.length > pageSize) && (
        <nav className="club-creator-links" aria-label="Shared chart pages">
          {page > 1 && (
            <Link href={`?page=${page - 1}`} className="chart-club-link">
              Previous page
            </Link>
          )}
          {posts.length > pageSize && (
            <Link href={`?page=${page + 1}`} className="chart-club-link">
              Next page
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
