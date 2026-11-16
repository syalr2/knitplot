import { getDatabase } from "@/lib/db";
import { errorResponse, isUuid } from "@/lib/http";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const sql = getDatabase();
  if (!sql || !isUuid(id))
    return errorResponse("No editable copy was found.", 404);
  try {
    const [post] = await sql`
      select p.editable_document, p.title, c.handle
      from knitplot_club_public_posts p join knitplot_club_creators c on c.user_id = p.creator_id
      where p.id = ${id}::uuid and p.editable_document is not null
    `;
    if (!post) return errorResponse("No editable copy was found.", 404);
    return Response.json(
      {
        format: "colorwork-chart",
        version: 2,
        document: {
          ...post.editable_document,
          name: post.title,
          chartClubSource: { id, handle: post.handle },
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": 'attachment; filename="chart-club.knitplot"',
        },
      },
    );
  } catch {
    return errorResponse(
      "KnitPlot couldn’t load the copy. Please try again.",
      503,
    );
  }
}
