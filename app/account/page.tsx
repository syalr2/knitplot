import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { AccountAvatar } from "@/components/account-avatar";
import { AccountPreferencesForm } from "@/components/account-preferences-form";
import { AccountUsernameForm } from "@/components/account-username-form";
import { ClubProfileForm } from "@/components/club-profile-form";
import { getViewerWithEmail } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import "../chart-club/chart-club.css";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const viewer = await getViewerWithEmail();
  if (!viewer) redirect("/sign-in");
  const sql = getDatabase();
  const creators = sql
    ? await sql`select handle, display_name, bio, ravelry_url, instagram_url, tiktok_url from knitplot_club_creators where user_id = ${viewer.id}`.catch(
        () => null,
      )
    : null;

  return (
    <main className="account-hub-page">
      <nav className="account-hub-nav">
        <a className="account-hub-brand" href="/">
          <span aria-hidden="true" />
          KnitPlot
        </a>
        <div>
          <a className="account-chart-maker-link" href="/">
            Chart maker
          </a>
          <Link href="/my-charts">My charts</Link>
          {viewer.id === process.env.CHART_CLUB_MODERATOR_ID && (
            <Link href="/chart-club/moderation">Chart Club reports</Link>
          )}
        </div>
      </nav>

      <section className="account-hub-shell">
        <header className="account-hub-heading">
          <AccountAvatar avatar={viewer.avatar} />
          <div>
            <h1>Account settings</h1>
            <p>{viewer.email ?? "Your KnitPlot account"}</p>
          </div>
        </header>

        <div className="account-hub-grid">
          <div className="account-hub-column">
            <section className="account-hub-card">
              <div>
                <p className="account-card-kicker">Chart Club · Optional</p>
                <h2>{creators?.[0] ? "Your username" : "Add a username"}</h2>
                <p>
                  Choose a unique username for your Chart Club posts. It won’t
                  appear publicly until you share a chart.
                </p>
              </div>
              {creators ? (
                <AccountUsernameForm
                  initialHandle={creators[0]?.handle ?? ""}
                />
              ) : (
                <p>Username settings aren’t available right now.</p>
              )}
              {creators?.[0] && (
                <ClubProfileForm
                  displayName={creators[0].display_name}
                  bio={creators[0].bio}
                  ravelryUrl={creators[0].ravelry_url ?? ""}
                  instagramUrl={creators[0].instagram_url ?? ""}
                  tiktokUrl={creators[0].tiktok_url ?? ""}
                />
              )}
            </section>
            <section className="account-hub-card account-profile-card">
              <div>
                <p className="account-card-kicker">Make it yours</p>
                <h2>Your account icon</h2>
                <p>
                  Choose a little stitch marker, or use up to two letters. It
                  will appear on the chart maker and your saved charts.
                </p>
              </div>
              <AccountPreferencesForm initialAvatar={viewer.avatar} />
            </section>
          </div>

          <div className="account-hub-column">
            <section className="account-hub-card account-security-card">
              <div className="account-card-icon" aria-hidden="true">
                ⌁
              </div>
              <div>
                <p className="account-card-kicker">Sign-in &amp; security</p>
                <h2>Password and security</h2>
                <p>
                  Change your password, manage email addresses, connected
                  accounts, and active sessions.
                </p>
              </div>
              <Link className="secondary-link" href="/account/security">
                Manage sign-in &amp; security
              </Link>
            </section>

            <section className="account-hub-card account-signout-card">
              <div>
                <p className="account-card-kicker">Finished for now?</p>
                <h2>Your charts will stay safe</h2>
                <p>
                  Your local charts stay on this computer. Charts saved to your
                  account will be waiting when you return.
                </p>
              </div>
              <SignOutButton redirectUrl="/">
                <button className="secondary-button" type="button">
                  Sign out
                </button>
              </SignOutButton>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
