# Security Policy

Please report security vulnerabilities privately through GitHub's security advisory feature rather than opening a public issue.

## Secrets and hosted installations

- Never commit `.env.local`, Clerk secret keys, Neon database URLs, OpenAI keys, or `OPENAI_KEY_ENCRYPTION_SECRET`.
- Public deployments should leave `ENABLE_SHARED_OPENAI_KEY=false` so anonymous visitors cannot spend the operator's OpenAI credits.
- Keep Neon connection strings server-only. Every chart query is scoped to the authenticated Clerk user ID, and the encrypted-credential tables are only accessed from server routes.
- Changing `OPENAI_KEY_ENCRYPTION_SECRET` makes existing encrypted user keys unreadable. Disconnect those keys before rotating it, or provide a controlled re-encryption migration.

If any key is exposed, revoke it immediately, create a replacement, and remove it from commit history or shared files. Reports about ordinary bugs or feature behaviour can use the public issue tracker.
