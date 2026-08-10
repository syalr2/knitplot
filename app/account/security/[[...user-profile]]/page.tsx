import { UserProfile } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");

  return (
    <main className="account-hub-page">
      <nav className="account-hub-nav">
        <Link className="account-hub-brand" href="/"><span aria-hidden="true" />KnitPlot</Link>
        <div><Link href="/account">Account</Link><Link href="/my-charts">My charts</Link></div>
      </nav>
      <section className="account-security-shell">
        <Link className="back-link" href="/account">← Back to account settings</Link>
        <div><p className="eyebrow">Account security</p><h1>Sign-in &amp; security</h1><p className="account-intro">Manage your password, email addresses, connected accounts, and signed-in devices.</p></div>
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
      </section>
    </main>
  );
}
