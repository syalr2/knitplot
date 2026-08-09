import { ChartMaker } from "@/components/chart-maker";
import { getViewerWithEmail } from "@/lib/auth";
import { getOpenAIConnectionStatus } from "@/lib/openai/credentials";

export const dynamic = "force-dynamic";

export default async function Home() {
  const viewer = await getViewerWithEmail();
  const aiConnection = viewer ? await getOpenAIConnectionStatus(viewer.id) : { connected: false as const };
  const accountsEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.DATABASE_URL);
  return <ChartMaker viewer={viewer} accountsEnabled={accountsEnabled} aiConnected={aiConnection.connected} />;
}
