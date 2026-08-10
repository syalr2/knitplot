import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { defaultAccountAvatar, parseAccountAvatar, parsePinnedChartIds, type AccountAvatar } from "@/lib/account-preferences";

export type Viewer = { id: string; email: string | null; avatar: AccountAvatar; pinnedChartIds: string[] };

export async function getViewer(): Promise<Viewer | null> {
  const { userId } = await auth();
  return userId ? { id: userId, email: null, avatar: defaultAccountAvatar(null), pinnedChartIds: [] } : null;
}

export async function getViewerWithEmail(): Promise<Viewer | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? null;
  return {
    id: viewer.id,
    email,
    avatar: parseAccountAvatar(user?.publicMetadata, email),
    pinnedChartIds: parsePinnedChartIds(user?.publicMetadata),
  };
}
