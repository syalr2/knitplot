import { getViewer } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { encryptOpenAIKey } from "@/lib/openai/credentials";
import { hasValidRequestOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

function responseError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) return responseError("Invalid request origin.", 403);
  const viewer = await getViewer();
  if (!viewer) return responseError("Please sign in first.", 401);
  const sql = getDatabase();
  if (!sql) return responseError("Account storage is not configured.", 503);

  let apiKey = "";
  try {
    const body = await request.json() as { apiKey?: unknown };
    apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  } catch {
    return responseError("The key was not valid.", 400);
  }
  if (!apiKey.startsWith("sk-") || apiKey.length < 20 || apiKey.length > 500) {
    return responseError("Enter a valid OpenAI API key beginning with sk-.", 400);
  }

  try {
    const verification = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (verification.status === 401 || verification.status === 403) {
      return responseError("OpenAI did not accept that API key.", 400);
    }
    if (!verification.ok) return responseError("OpenAI could not verify the key right now. Please try again.", 502);

    const encryptedKey = encryptOpenAIKey(apiKey);
    const lastFour = apiKey.slice(-4);
    await sql`
      insert into knitplot_user_ai_credentials (user_id, encrypted_key, key_last_four, updated_at)
      values (${viewer.id}, ${encryptedKey}, ${lastFour}, now())
      on conflict (user_id) do update set
        encrypted_key = excluded.encrypted_key,
        key_last_four = excluded.key_last_four,
        updated_at = now()
    `;
    return Response.json({ connected: true, lastFour }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return responseError("The key could not be verified or encrypted. Please try again.", 502);
  }
}

export async function DELETE(request: Request) {
  if (!hasValidRequestOrigin(request)) return responseError("Invalid request origin.", 403);
  const viewer = await getViewer();
  if (!viewer) return responseError("Please sign in first.", 401);
  const sql = getDatabase();
  if (!sql) return responseError("Account storage is not configured.", 503);
  try {
    await sql`delete from knitplot_user_ai_credentials where user_id = ${viewer.id}`;
  } catch {
    return responseError("KnitPlot could not remove the connection.", 503);
  }
  return Response.json({ connected: false }, { headers: { "Cache-Control": "no-store" } });
}
