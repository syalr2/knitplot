import { getViewer } from "@/lib/auth";
import { clubProfileInputSchema, clubProfileLinks } from "@/lib/club-profile";
import { getDatabase } from "@/lib/db";
import { errorResponse, HttpError, readJsonObject } from "@/lib/http";
import { hasValidRequestOrigin } from "@/lib/security/origin";

export async function PATCH(request: Request) {
  if (!hasValidRequestOrigin(request))
    return errorResponse("Invalid request origin.", 403);
  const viewer = await getViewer();
  if (!viewer) return errorResponse("Sign in to edit your profile.", 401);
  const sql = getDatabase();
  if (!sql) return errorResponse("Chart Club is not configured.", 503);
  try {
    const profile = clubProfileInputSchema.safeParse(
      await readJsonObject(request, {
        bytes: 4096,
        message: "Profile details are too large.",
      }),
    );
    if (!profile.success)
      return errorResponse(
        "Check the field lengths and enter usernames, not links.",
        400,
      );
    const { displayName, bio } = profile.data;
    const { ravelryUrl, instagramUrl, tiktokUrl } = clubProfileLinks(
      profile.data,
    );
    const [saved] = await sql`
      update knitplot_club_creators set display_name = ${displayName}, bio = ${bio}, ravelry_url = ${ravelryUrl || null},
        instagram_url = ${instagramUrl}, tiktok_url = ${tiktokUrl}
      where user_id = ${viewer.id} returning handle
    `;
    return saved
      ? new Response(null, { status: 204 })
      : errorResponse("Choose a username before editing your profile.", 404);
  } catch (error) {
    if (error instanceof HttpError)
      return errorResponse(error.message, error.status);
    return errorResponse(
      "KnitPlot couldn’t save your profile. Try again.",
      503,
    );
  }
}
