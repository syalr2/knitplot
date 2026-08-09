import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { AccountKeyForm } from "@/components/account-key-form";
import { getViewerWithEmail } from "@/lib/auth";
import { getOpenAIConnectionStatus } from "@/lib/openai/credentials";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const viewer = await getViewerWithEmail();
  if (!viewer) redirect("/sign-in");
  const connection = await getOpenAIConnectionStatus(viewer.id);

  return (
    <main className="account-page">
      <section className="account-card account-wide">
        <div className="account-nav"><Link className="back-link" href="/">← Back to chart maker</Link><Link href="/my-charts">My Charts</Link></div>
        <div><p className="eyebrow">Account</p><h1>{viewer.email ?? "Your KnitPlot account"}</h1><p className="account-intro">Your account is only for private cloud saves and the optional AI connection.</p></div>
        <section className="account-section">
          <div><h2>OpenAI connection</h2><p>Connect your own API key to use Generate with AI and prompt-based chart editing. KnitPlot encrypts the key before storing it and never sends it back to your browser.</p></div>
          <AccountKeyForm connected={connection.connected} lastFour={connection.connected ? connection.lastFour : undefined} />
          <p className="account-footnote">AI requests are billed by OpenAI to your API account. You can disconnect here or revoke the key from OpenAI at any time.</p>
        </section>
        <SignOutButton redirectUrl="/"><button type="button">Sign out</button></SignOutButton>
      </section>
    </main>
  );
}
