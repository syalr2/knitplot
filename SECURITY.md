# Security Policy

Please report security vulnerabilities privately through GitHub's security advisory feature rather than opening a public issue.

## Secrets and hosted installations

- Never commit `.env.local`, Clerk secret keys or Neon database URLs.
- Keep Neon connection strings server-only. Every private chart query is scoped to the authenticated Clerk user ID.

If any key is exposed, revoke it immediately, create a replacement, and remove it from commit history or shared files. Reports about ordinary bugs or feature behaviour can use the public issue tracker.
