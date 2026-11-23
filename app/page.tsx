import { ChartMaker } from "@/components/chart-maker";
import { accountsConfigured } from "@/lib/auth-config";
import { getViewerWithEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const viewer = await getViewerWithEmail();
  const accountsEnabled =
    accountsConfigured() && Boolean(process.env.DATABASE_URL);
  const feedbackFormId = process.env.KNITPLOT_FEEDBACK_FORM_ID?.trim() ?? "";
  return (
    <ChartMaker
      viewer={viewer}
      accountsEnabled={accountsEnabled}
      feedbackFormId={
        /^[a-zA-Z0-9]+$/.test(feedbackFormId) ? feedbackFormId : undefined
      }
    />
  );
}
