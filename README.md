# KnitPlot

KnitPlot is a local-first, open-source colourwork chart maker for knitters. Draw charts stitch by stitch, turn an image into a limited-colour chart, preview the result as knitted fabric, and follow it row by row in Knit Mode.

The core app is free to use and does not need an account or API key. Optional accounts add private cross-device chart saves. Image generation and prompt-based editing use each user's own OpenAI API key.

## Use KnitPlot online

Open the hosted chart maker at [knitplot.art](https://knitplot.art). Every non-AI tool works without an account and saves the current workspace in that browser. An optional account adds a private My Charts library, cross-device saves, and a secure connection for a personal OpenAI API key.

## What it can do

### No API key needed

- Draw, erase, flood-fill, and fill rectangular selections
- Choose up to eight custom colours
- Work with charts up to 100 stitches by 100 rows
- Set stitch gauge, row gauge, and centimetres or inches
- Zoom the editable chart and use optional live-symmetry guides
- Flip, rotate, undo, and redo chart changes
- Work on up to eight charts in browser tabs
- Import PNG, JPEG, or WebP images, then crop, position, resize, and reduce them to a stitch palette
- Preview normal or mirrored repeats as textured knitted fabric
- Create printable charts and written row-by-row colour sequences
- Choose stranded, intarsia, or duplicate stitch instructions
- Use Knit Mode with row and stitch progress, optional design-only cropping, and stitch markers
- Download chart and preview PNGs or save an editable `.knitplot` project file

### OpenAI API key needed

- Generate a new chart from a text prompt
- Include a reference image while generating
- Revise the generated draft with another prompt before importing it
- Edit the currently open chart with a prompt

AI requests consume credits on the OpenAI account connected to your key. The app always labels those actions before it sends a request.

## Run KnitPlot on your computer

You need [Node.js](https://nodejs.org/) 20 or newer.

Download or clone this repository, open a terminal in the KnitPlot project folder, and run:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the local address shown in the terminal, usually [http://localhost:3000](http://localhost:3000).

Without any environment variables, the full non-AI chart maker works locally. For a private local installation, AI can use a server-side key:

```dotenv
OPENAI_API_KEY=your_key_here
```

Never commit or share `.env.local`. It is ignored by Git.

## Configure hosted accounts

KnitPlot uses Clerk for optional accounts and Neon Postgres for private chart storage. The editor itself does not depend on either service.

1. Create or connect Clerk and Neon resources. Vercel Marketplace can inject their environment variables automatically.
2. Run [`database/migrations/001_accounts_and_cloud_charts.sql`](database/migrations/001_accounts_and_cloud_charts.sql) against the Neon database.
3. Set the Clerk and Neon values from `.env.example` in `.env.local` and in Vercel. Generate `OPENAI_KEY_ENCRYPTION_SECRET` with `openssl rand -base64 32` and never change or expose it while saved API keys exist.

`CLERK_SECRET_KEY`, `DATABASE_URL`, and `OPENAI_KEY_ENCRYPTION_SECRET` are server-only secrets. Never prefix them with `NEXT_PUBLIC_` or commit them.

On a public deployment, leave `ENABLE_SHARED_OPENAI_KEY=false`. This requires each signed-in user to connect their own OpenAI key instead of spending the site owner's credits.

## Saving and privacy

- Your open chart workspace and Knit Mode position are saved automatically in that browser's local storage.
- Signed-in users can choose **Save to My Charts**. After the first cloud save, that chart is kept in sync while it remains open.
- **Save chart** downloads the active chart as an editable `.knitplot` file. It does not bundle every open browser tab.
- Ordinary image importing and colour reduction happen in your browser.
- When you use an AI feature, its prompt and any attached or current-chart image are sent through KnitPlot's server to OpenAI using your connected key.
- Connected OpenAI keys are encrypted with AES-256-GCM before Neon storage and are never returned to the browser. Only the final four characters are shown for identification.
- KnitPlot stores no AI prompts or generated images in the account database. It stores request timestamps only for the 30-per-hour safety limit.
- KnitPlot has no analytics.

Browser storage is convenient, but it is not a backup. Download important charts as `.knitplot` files.

## Project checks

```bash
npm run typecheck
npm run build
```

Run both with:

```bash
npm run check
```

## Contributing

Bug reports, feature ideas, documentation fixes, and code contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please report sensitive security problems as described in [SECURITY.md](SECURITY.md).

## Supporting KnitPlot

KnitPlot is free and open source. If it is useful to you, an optional support link may be added here in the future. There will never be a payment requirement inside the chart maker.

## License and assets

KnitPlot's source code is available under the [MIT License](LICENSE). The knitted-preview texture is described in [public/textures/LICENSE.md](public/textures/LICENSE.md).
