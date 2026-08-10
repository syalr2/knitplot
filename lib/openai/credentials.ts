import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getViewer } from "@/lib/auth";
import { getDatabase } from "@/lib/db";

function encryptionKey() {
  const value = process.env.OPENAI_KEY_ENCRYPTION_SECRET;
  if (!value) throw new Error("OPENAI_KEY_ENCRYPTION_SECRET is missing.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("OPENAI_KEY_ENCRYPTION_SECRET must be 32 bytes encoded as base64.");
  return key;
}

export function encryptOpenAIKey(apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptOpenAIKey(value: string) {
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) throw new Error("Invalid encrypted API key.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function getOpenAIConnectionStatus(userId: string) {
  const sql = getDatabase();
  if (!sql) return { connected: false as const };
  let rows: Array<Record<string, unknown>>;
  try {
    rows = await sql`select key_last_four, updated_at from knitplot_user_ai_credentials where user_id = ${userId} limit 1` as Array<Record<string, unknown>>;
  } catch {
    return { connected: false as const };
  }
  const data = rows[0];
  return data
    ? { connected: true as const, lastFour: String(data.key_last_four), updatedAt: String(data.updated_at) }
    : { connected: false as const };
}

export type OpenAIKeyResult =
  | { key: string; userId: string | null }
  | { error: string; status: number };

export async function resolveOpenAIKey(): Promise<OpenAIKeyResult> {
  const viewer = await getViewer();
  if (viewer) {
    const sql = getDatabase();
    if (!sql) return { error: "AI account storage is not configured yet.", status: 503 };
    let data: Record<string, unknown> | undefined;
    try {
      const rows = await sql`select encrypted_key from knitplot_user_ai_credentials where user_id = ${viewer.id} limit 1` as Array<Record<string, unknown>>;
      data = rows[0];
    } catch {
      return { error: "KnitPlot could not read your AI connection.", status: 503 };
    }
    if (!data) return { error: "Connect your OpenAI API key in Account before using AI.", status: 403 };
    try {
      return { key: decryptOpenAIKey(String(data.encrypted_key)), userId: viewer.id };
    } catch {
      return { error: "Your saved OpenAI connection could not be unlocked. Please reconnect it.", status: 503 };
    }
  }

  const allowSharedKey = process.env.NODE_ENV !== "production" || process.env.ENABLE_SHARED_OPENAI_KEY === "true";
  if (allowSharedKey && process.env.OPENAI_API_KEY) {
    return { key: process.env.OPENAI_API_KEY, userId: null };
  }
  return { error: "Sign in and connect your OpenAI API key to use AI features.", status: 401 };
}

export async function claimAiRequest(userId: string | null) {
  if (!userId) return { allowed: true as const };
  const sql = getDatabase();
  if (!sql) return { allowed: false as const, message: "AI usage controls are not configured." };
  try {
    const results = await sql.transaction((transaction) => [
      transaction`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`,
      transaction`
        insert into knitplot_ai_request_log (user_id)
        select ${userId}
        where (
          select count(*) from knitplot_ai_request_log
          where user_id = ${userId} and created_at >= now() - interval '1 hour'
        ) < 30
        returning id
      `,
      transaction`delete from knitplot_ai_request_log where created_at < now() - interval '7 days'`,
    ]);
    const insertedRows = results[1] as Array<Record<string, unknown>>;
    if (insertedRows.length === 0) {
      return { allowed: false as const, message: "You have reached KnitPlot’s 30 AI requests per hour safety limit. Try again later." };
    }
    return { allowed: true as const };
  } catch {
    return { allowed: false as const, message: "KnitPlot could not check the AI request limit." };
  }
}
