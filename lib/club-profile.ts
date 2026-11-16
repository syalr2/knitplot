import { z } from "zod";

function profileLink(domain: string, path: RegExp) {
  return z
    .string()
    .trim()
    .max(250)
    .refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          [`www.${domain}`, domain].includes(url.host) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          path.test(url.pathname)
        );
      } catch {
        return false;
      }
    });
}

export const clubProfileSchema = z.object({
  displayName: z.string().trim().max(60),
  bio: z.string().trim().max(400),
  ravelryUrl: profileLink(
    "ravelry.com",
    /^\/(people|designers)\/[a-z0-9_-]+\/?$/i,
  ),
  instagramUrl: profileLink(
    "instagram.com",
    /^\/(?!p\/|reels?\/|stories\/|accounts\/|explore\/)[a-z0-9_.]{1,30}\/?$/i,
  ).optional(),
  tiktokUrl: profileLink("tiktok.com", /^\/@[a-z0-9_.]{1,24}\/?$/i).optional(),
});

const username = (rule: RegExp) =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, ""))
    .refine((value) => !value || rule.test(value));

export const clubProfileInputSchema = z.object({
  displayName: z.string().trim().max(60),
  bio: z.string().trim().max(400),
  ravelryUsername: username(/^[a-z0-9_-]{1,80}$/i),
  instagramUsername: username(
    /^(?!(?:p|reels?|stories|accounts|explore)$)(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9_.]{1,30}$/i,
  ),
  tiktokUsername: username(/^(?!\.)(?!.*\.$)[a-z0-9_.]{1,24}$/i),
});

export function clubProfileLinks(
  input: z.output<typeof clubProfileInputSchema>,
) {
  return {
    ravelryUrl: input.ravelryUsername
      ? `https://www.ravelry.com/people/${input.ravelryUsername}`
      : null,
    instagramUrl: input.instagramUsername
      ? `https://www.instagram.com/${input.instagramUsername}/`
      : null,
    tiktokUrl: input.tiktokUsername
      ? `https://www.tiktok.com/@${input.tiktokUsername}`
      : null,
  };
}

export function clubProfileUsername(url: string | null | undefined) {
  if (!url) return "";
  try {
    return (
      new URL(url).pathname
        .split("/")
        .filter(Boolean)
        .at(-1)
        ?.replace(/^@/, "") ?? ""
    );
  } catch {
    return "";
  }
}
