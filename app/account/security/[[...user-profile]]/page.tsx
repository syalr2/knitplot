import { UserProfile } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { AccountKeyForm } from "@/components/account-key-form";
import { getOpenAIConnectionStatus } from "@/lib/openai/credentials";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  const connection = await getOpenAIConnectionStatus(viewer.id);

  return (
    <main className="account-hub-page">
      <nav className="account-hub-nav">
        <Link className="account-hub-brand" href="/">
          <span aria-hidden="true" />
          KnitPlot
        </Link>
        <div>
          <Link href="/account">Account</Link>
          <Link href="/my-charts">My charts</Link>
        </div>
      </nav>
      <section className="account-security-shell">
        <Link className="back-link" href="/account">
          ← Back to account settings
        </Link>
        <div>
          <p className="eyebrow">Account security</p>
          <h1>Sign-in &amp; security</h1>
          <p className="account-intro">
            Manage your password, email addresses, connected accounts, and
            signed-in devices.
          </p>
        </div>
        <div className="account-security-profile">
          <UserProfile
            routing="path"
            path="/account/security"
            appearance={{
              variables: {
                colorPrimary: "#4d5a4b",
                colorForeground: "#33302a",
                colorMutedForeground: "#837d6f",
                colorBackground: "#faf8f2",
                colorInput: "#ffffff",
                colorBorder: "#ddd6c6",
                borderRadius: "0.625rem",
                fontFamily: "var(--font-ui)",
              },
            }}
          />
        </div>
        <details className="account-hub-card account-ai-disclosure">
          <summary>OpenAI connection</summary>
          <p>
            Connect your own API key to use Generate with AI and prompt-based
            chart editing. KnitPlot encrypts it before storage and never sends
            it back to your browser.
          </p>
          <AccountKeyForm
            connected={connection.connected}
            lastFour={connection.connected ? connection.lastFour : undefined}
          />
          <p className="account-footnote">
            OpenAI bills requests to your API account. You can disconnect here
            or revoke the key from OpenAI at any time.
          </p>
        </details>
      </section>
    </main>
  );
}
