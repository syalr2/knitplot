import { ChartMaker } from "@/components/chart-maker";
import { accountsConfigured } from "@/lib/auth-config";
import { getViewerWithEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const viewer = await getViewerWithEmail();
  const accountsEnabled =
    accountsConfigured() && Boolean(process.env.DATABASE_URL);
  return <ChartMaker viewer={viewer} accountsEnabled={accountsEnabled} />;
}
