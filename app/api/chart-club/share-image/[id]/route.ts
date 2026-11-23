import { unstable_cache } from "next/cache";
import { readChartDocument } from "@/lib/chart-schema";
import { readClubCover } from "@/lib/club-cover";
import { renderClubShareArt } from "@/lib/club-share-art";
import {
  getPublicClubPost,
  getPublicClubShareMetadata,
} from "@/lib/public-club-post";
import { renderClubShareCard } from "@/lib/club-share-card";

// Cover settings and design cannot change on an existing post. Title and
// attribution are composed separately from the live public metadata.
const getArtwork = unstable_cache(
  async (id: string) => {
    const post = await getPublicClubPost(id);
    if (!post) throw new Error("Chart is no longer published.");
    const document = readChartDocument(post.document);
    const cover = readClubCover(document, post.cover, post.legacyView);
    const { png, ...size } = await renderClubShareArt(document, cover);
    return { ...size, png: png.toString("base64") };
  },
  ["club-share-artwork-v1"],
  { revalidate: 86_400 },
);

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/chart-club/share-image/[id]">,
) {
  const { id } = await params;
  const post = await getPublicClubShareMetadata(id);
  if (!post)
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });

  let artwork: Awaited<ReturnType<typeof renderClubShareArt>> | undefined;
  try {
    const result = await getArtwork(id);
    artwork = { ...result, png: Buffer.from(result.png, "base64") };
  } catch {
    // Keep a usable title card if an older snapshot cannot be rendered.
  }
  return renderClubShareCard(post.title, post.handle, artwork);
}
