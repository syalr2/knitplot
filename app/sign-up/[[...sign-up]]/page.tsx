import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="account-page">
      <section className="account-card auth-card clerk-auth-card">
        <Link className="back-link" href="/">← Back to KnitPlot</Link>
        <div><p className="eyebrow">Optional cloud account</p><h1>Create your KnitPlot account</h1><p className="account-intro">Your browser charts stay local until you choose to save them to My Charts.</p></div>
        <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/" />
      </section>
    </main>
  );
}

