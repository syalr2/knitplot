# Security policy

## API keys

Never commit an OpenAI API key or paste one into a public issue. KnitPlot reads `OPENAI_API_KEY` from `.env.local`, which is ignored by Git and used only by server-side routes.

If a key is exposed, revoke it immediately in the OpenAI dashboard, create a replacement, and remove it from any commit history or shared files.

## Public deployments

The included AI routes do not have user authentication, per-user quotas, or rate limiting. A public instance configured with an API key could allow other people to spend the owner's API credits. Keep key-enabled instances local unless those controls have been added.

## Reporting a vulnerability

Please do not disclose a security vulnerability in a public issue. Once the GitHub repository is created, use its private security advisory feature to send the maintainer the details, affected versions, reproduction steps, and any suggested fix.

Reports about ordinary bugs or feature behaviour can use the public issue tracker.
