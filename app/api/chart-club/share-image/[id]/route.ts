import { readChartDocument } from "@/lib/chart-schema";
import { readClubCover } from "@/lib/club-cover";
import { renderClubShareArt } from "@/lib/club-share-art";
import { getPublicClubPost } from "@/lib/public-club-post";
import { renderClubShareCard } from "@/lib/club-share-card";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/chart-club/share-image/[id]">,
) {
  const { id } = await params;
  const post = await getPublicClubPost(id);
  if (!post)
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });

  let artwork: Awaited<ReturnType<typeof renderClubShareArt>> | undefined;
  try {
    const document = readChartDocument(post.document);
    const cover = readClubCover(document, post.cover, post.legacyView);
    artwork = await renderClubShareArt(document, cover);
  } catch {
    // Keep a usable title card if an older snapshot cannot be rendered.
  }
  return renderClubShareCard(post.title, post.handle, artwork);
}
