import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import "@/app/yoke-designer/yoke.css";
import { getViewer } from "@/lib/auth";
import { ClubPostActions } from "@/components/club-post-actions";
import { OpenClubCopy } from "@/components/open-club-copy";
import { readChartDocument } from "@/lib/chart-schema";
import { ClubChartViewer } from "@/components/club-chart-viewer";
import { ClubCopyLink } from "@/components/club-copy-link";
import { getClubPostActivity, getPublicClubPost } from "@/lib/public-club-post";
import {
  CLUB_SHARE_IMAGE_SIZE,
  KNITPLOT_ORIGIN,
  clubPostPath,
  clubShareImagePath,
} from "@/lib/club-share-link";

export const dynamic = "force-dynamic";

type PostPage = PageProps<"/chart-club/[id]">;

export async function generateMetadata({
  params,
}: PostPage): Promise<Metadata> {
  const { id } = await params;
  const post = await getPublicClubPost(id);
  if (!post) notFound();
  const title = `${post.title} · Chart Club`;
  const description =
    `By @${post.handle}. ${post.description || "Explore the chart and open an editable copy in KnitPlot."}`.slice(
      0,
      165,
    );
  const url = new URL(clubPostPath(id), KNITPLOT_ORIGIN);
  const image = {
    url: new URL(clubShareImagePath(id), KNITPLOT_ORIGIN),
    alt: `Knitted preview of ${post.title} by @${post.handle}`,
    ...CLUB_SHARE_IMAGE_SIZE,
  };
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      siteName: "KnitPlot",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function PublicChartPage({
  params,
  searchParams,
}: PostPage) {
  const [{ id }, { via }] = await Promise.all([params, searchParams]);
  const [post, viewer] = await Promise.all([
    getPublicClubPost(id),
    getViewer(),
  ]);
  if (!post) notFound();
  const activity = viewer ? await getClubPostActivity(id, viewer.id) : null;
  const chart = readChartDocument(post.document);
  const sharedVisit = via === "share";
  return (
    <>
      <header className="library-heading">
        <div>
          <h1>{post.title}</h1>
          <p>
            By{" "}
            <Link href={`/chart-club/creators/${post.handle}`}>
              @{post.handle}
            </Link>
          </p>
        </div>
      </header>
      {post.description && (
        <p className="club-description">{post.description}</p>
      )}
      <div className="club-creator-links">
        <OpenClubCopy
          id={id}
          entry={sharedVisit ? "shared_link" : "chart_club"}
        />
        <ClubCopyLink id={id} placement="post" sharedVisit={sharedVisit} />
        <a className="chart-club-link" href={`/api/chart-club/copy?id=${id}`}>
          Download editable copy
        </a>
      </div>
      <ClubChartViewer
        document={chart}
        coverView={post.legacyView}
        heart={
          <ClubPostActions
            id={id}
            initialHearted={Boolean(activity?.hearted)}
            signedIn={Boolean(viewer)}
          />
        }
      />
      {!activity?.own && (
        <ClubPostActions
          id={id}
          initialHearted={false}
          signedIn={Boolean(viewer)}
          report
        />
      )}
    </>
  );
}
