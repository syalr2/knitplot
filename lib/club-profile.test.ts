import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clubProfileSchema,
  clubProfileInputSchema,
  clubProfileLinks,
} from "./club-profile";

test("profile usernames produce platform-owned URLs and reject pasted links", () => {
  const fields = {
    displayName: "",
    bio: "",
    ravelryUsername: "knitter",
    instagramUsername: "@loops.and.yarn",
    tiktokUsername: "@knitter_1",
  };
  assert.deepEqual(clubProfileLinks(clubProfileInputSchema.parse(fields)), {
    ravelryUrl: "https://www.ravelry.com/people/knitter",
    instagramUrl: "https://www.instagram.com/loops.and.yarn/",
    tiktokUrl: "https://www.tiktok.com/@knitter_1",
  });
  for (const field of [
    "ravelryUsername",
    "instagramUsername",
    "tiktokUsername",
  ])
    assert.equal(
      clubProfileInputSchema.safeParse({
        ...fields,
        [field]: "https://example.org/profile",
      }).success,
      false,
    );
});

test("optional social links accept profile URLs and reject posts and lookalike domains", () => {
  const base = { displayName: "", bio: "", ravelryUrl: "" };
  const profiles = {
    instagramUrl: "https://www.instagram.com/river.knits/",
    tiktokUrl: "https://www.tiktok.com/@river_knits",
  };
  assert.deepEqual(clubProfileSchema.parse({ ...base, ...profiles }), {
    ...base,
    ...profiles,
  });
  assert.ok(
    clubProfileSchema.safeParse({ ...base, instagramUrl: "", tiktokUrl: "" })
      .success,
  );
  for (const invalid of [
    { instagramUrl: "https://instagram.com/p/test" },
    { instagramUrl: "https://instagram.com.example.org/river.knits/" },
    { tiktokUrl: "https://www.tiktok.com/@river_knits/video/123" },
    { tiktokUrl: "https://www.tiktok.com/@river_knits#extra" },
  ])
    assert.equal(
      clubProfileSchema.safeParse({ ...base, ...invalid }).success,
      false,
    );
});

test("creator profile fields can all be blank", () => {
  assert.deepEqual(
    clubProfileSchema.parse({ displayName: " ", bio: "", ravelryUrl: "" }),
    { displayName: "", bio: "", ravelryUrl: "" },
  );
});

test("only HTTPS Ravelry member and designer links are accepted", () => {
  for (const ravelryUrl of [
    "https://www.ravelry.com/people/fishfan",
    "https://ravelry.com/designers/fish-fan",
  ]) {
    assert.equal(
      clubProfileSchema.safeParse({ displayName: "", bio: "", ravelryUrl })
        .success,
      true,
    );
  }
  for (const ravelryUrl of [
    "https://ravelry.com.example.org/people/fishfan",
    "https://ravelry.com@other.example/people/fishfan",
    "https://other.example@ravelry.com/people/fishfan",
    "http://www.ravelry.com/people/fishfan",
    "javascript:alert(1)",
    "https://www.ravelry.com/patterns/library/fish",
  ]) {
    assert.equal(
      clubProfileSchema.safeParse({ displayName: "", bio: "", ravelryUrl })
        .success,
      false,
    );
  }
});
