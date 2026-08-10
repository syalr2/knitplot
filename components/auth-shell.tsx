import Link from "next/link";
import type { ReactNode } from "react";

const MOTIF = [
  "..XX....XX..",
  ".X..X..X..X.",
  "X....XX....X",
  "X....XX....X",
  ".X..X..X..X.",
  "..XX....XX..",
];

type Props = {
  mode: "sign-in" | "sign-up";
  children: ReactNode;
};

export function AuthShell({ mode, children }: Props) {
  const signingUp = mode === "sign-up";

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <aside className="auth-story-panel">
          <Link className="auth-brand" href="/" aria-label="Return to KnitPlot">
            <span className="auth-brand-mark" aria-hidden="true" />
            <span>KnitPlot</span>
          </Link>

          <div className="auth-yarn-art" aria-hidden="true">
            <svg className="auth-yarn-ball" viewBox="0 0 118 118" fill="none">
              <circle cx="59" cy="59" r="45" fill="#e2b98a" />
              <path d="M22 46c22 10 52 12 74-6M18 68c26 8 58 4 80-16M28 88c20 2 48-6 62-28M40 102c18-4 40-18 50-38" stroke="#c99a63" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M96 44c-16 16-40 22-64 16" stroke="#cfa570" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            <svg className="auth-yarn-strand" viewBox="0 0 300 800" fill="none" preserveAspectRatio="none">
              <path pathLength="1" d="M82 204 C 82 330, 210 340, 214 420 C 218 500, 120 520, 150 600 C 172 660, 260 650, 300 664" />
            </svg>
          </div>

          <div className="auth-story-copy">
            <div className="auth-mini-chart" aria-hidden="true">
              {MOTIF.map((row, rowIndex) => (
                <div key={rowIndex}>
                  {[...row].map((cell, columnIndex) => <span className={cell === "X" ? "motif" : "background"} key={columnIndex} />)}
                </div>
              ))}
            </div>
            <p className="auth-story-heading">One strand, all the way through.</p>
            <p className="auth-story-body">Make colourwork charts, keep your favourites, and pick up wherever you left off.</p>
            <p className="auth-story-note">
              today&apos;s colourway —{" "}
              <span className="auth-colourway-name">
                <span>Oatmeal &amp; Sage</span>
                <span>Bone &amp; Oxblood</span>
                <span>Ash &amp; Indigo</span>
                <span>Cream &amp; Clay</span>
                <span>Flax &amp; Moss</span>
              </span>
            </p>
          </div>
        </aside>

        <div className="auth-form-panel">
          <Link className="auth-back-link" href="/">← Back to chart maker</Link>
          <header className="auth-form-heading">
            {signingUp ? <p className="eyebrow">Optional cloud account</p> : null}
            <h1>{signingUp ? "Start your first chart." : "Welcome back."}</h1>
            <p>{signingUp ? "Save private charts to your account and use your optional AI connection from any computer." : "Your saved charts are waiting right where you left them."}</p>
          </header>

          <div className="auth-clerk-wrap">{children}</div>

          <div className="auth-guest-route">
            <p>Just want to make a chart?</p>
            <Link href="/">Cast on without an account</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
