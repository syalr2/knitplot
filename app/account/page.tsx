import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { AccountAvatar } from "@/components/account-avatar";
import { AccountKeyForm } from "@/components/account-key-form";
import { AccountPreferencesForm } from "@/components/account-preferences-form";
import { getViewerWithEmail } from "@/lib/auth";
import { getOpenAIConnectionStatus } from "@/lib/openai/credentials";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const viewer = await getViewerWithEmail();
  if (!viewer) redirect("/sign-in");
  const connection = await getOpenAIConnectionStatus(viewer.id);

  return (
    <main className="account-hub-page">
      <nav className="account-hub-nav">
        <Link className="account-hub-brand" href="/"><span aria-hidden="true" />KnitPlot</Link>
        <div><Link className="account-chart-maker-link" href="/">Chart maker</Link><Link href="/my-charts">My charts</Link></div>
      </nav>

      <section className="account-hub-shell">
        <header className="account-hub-heading">
          <AccountAvatar avatar={viewer.avatar} />
          <div><h1>Account settings</h1><p>{viewer.email ?? "Your KnitPlot account"}</p></div>
        </header>

        <div className="account-hub-grid">
          <section className="account-hub-card account-profile-card">
            <div><p className="account-card-kicker">Make it yours</p><h2>Your account icon</h2><p>Choose a little stitch marker, or use up to two letters. It will appear on the chart maker and your saved charts.</p></div>
            <AccountPreferencesForm initialAvatar={viewer.avatar} />
          </section>

          <section className="account-hub-card account-security-card">
            <div className="account-card-icon" aria-hidden="true">⌁</div>
            <div><p className="account-card-kicker">Sign-in &amp; security</p><h2>Password and security</h2><p>Change your password, manage email addresses, connected accounts, and active sessions.</p></div>
            <Link className="secondary-link" href="/account/security">Manage sign-in &amp; security</Link>
          </section>

          <section className="account-hub-card account-ai-card">
            <div><p className="account-card-kicker">Optional</p><h2>OpenAI connection</h2><p>Connect your own API key to use Generate with AI and prompt-based chart editing. KnitPlot encrypts it before storage and never sends it back to your browser.</p></div>
            <AccountKeyForm connected={connection.connected} lastFour={connection.connected ? connection.lastFour : undefined} />
            <p className="account-footnote">AI requests are billed by OpenAI to your API account. You can disconnect here or revoke the key from OpenAI at any time.</p>
          </section>

          <section className="account-hub-card account-signout-card">
            <div><p className="account-card-kicker">Finished for now?</p><h2>Your charts will stay safe</h2><p>Your local charts stay on this computer. Charts saved to your account will be waiting when you return.</p></div>
            <SignOutButton redirectUrl="/"><button className="secondary-button" type="button">Sign out</button></SignOutButton>
          </section>
        </div>
      </section>
    </main>
  );
}
