import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";

export type Viewer = { id: string; email: string | null };

export async function getViewer(): Promise<Viewer | null> {
  const { userId } = await auth();
  return userId ? { id: userId, email: null } : null;
}

export async function getViewerWithEmail(): Promise<Viewer | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const user = await currentUser();
  return {
    id: viewer.id,
    email: user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? null,
  };
}
