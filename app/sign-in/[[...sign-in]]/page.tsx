import Link from "next/link";
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="account-page">
      <section className="account-card auth-card clerk-auth-card">
        <Link className="back-link" href="/">← Back to KnitPlot</Link>
        <div><p className="eyebrow">Your optional account</p><h1>Sign in to save charts anywhere</h1><p className="account-intro">The chart maker remains free to use without an account. Sign in only for private cloud saves and optional AI tools.</p></div>
        <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/" />
      </section>
    </main>
  );
}

