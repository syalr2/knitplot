/** Missing account configuration means anonymous editing, never unauthenticated API access. */
export function accountsConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  );
}
