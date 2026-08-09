import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth-shell";
import { clerkAuthAppearance } from "@/lib/clerk-appearance";

export default function SignUpPage() {
  return (
    <AuthShell mode="sign-up">
      <SignUp appearance={clerkAuthAppearance} routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/" />
    </AuthShell>
  );
}
