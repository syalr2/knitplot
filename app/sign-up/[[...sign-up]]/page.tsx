import { redirect } from "next/navigation";
import { accountsConfigured } from "@/lib/auth-config";
import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth-shell";
import { clerkAuthAppearance } from "@/lib/clerk-appearance";

export default function SignUpPage() {
  if (!accountsConfigured()) redirect("/");
  return (
    <AuthShell mode="sign-up">
      <SignUp
        appearance={clerkAuthAppearance}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/"
      />
    </AuthShell>
  );
}
