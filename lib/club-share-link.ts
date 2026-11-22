export const KNITPLOT_ORIGIN = "https://knitplot.art";
export const CLUB_SHARE_IMAGE_SIZE = { width: 1200, height: 630 };

export function clubPostPath(id: string) {
  return `/chart-club/${encodeURIComponent(id)}`;
}

export function clubShareImagePath(id: string) {
  return `/api/chart-club/share-image/${encodeURIComponent(id)}`;
}

export function clubShareLink(id: string, origin: string) {
  const url = new URL(clubPostPath(id), origin);
  url.searchParams.set("via", "share");
  return url.href;
}
