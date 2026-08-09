import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth-shell";
import { clerkAuthAppearance } from "@/lib/clerk-appearance";

export default function SignInPage() {
  return (
    <AuthShell mode="sign-in">
      <SignIn appearance={clerkAuthAppearance} routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/" />
    </AuthShell>
  );
}
