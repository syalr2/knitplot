# KnitPlot

KnitPlot is a local-first, open-source colourwork chart maker for knitters. Draw charts stitch by stitch, turn an image into a limited-colour chart, preview the result as knitted fabric, and follow it row by row in Knit Mode.

The core app is free to use and does not need an account or API key. Optional accounts add private cross-device chart saves and Chart Club, where knitters can share charts and follow creators. Optional AI tools use each user's own OpenAI API key.

## Use KnitPlot online

Open the hosted chart maker at [knitplot.art](https://knitplot.art). Every non-AI tool works without an account and saves the current workspace in that browser. An optional account adds a private My Charts library, cross-device saves, and a secure connection for a personal OpenAI API key.

## What it can do

### No API key needed

- Draw, erase, flood-fill, and fill rectangular selections
- Move, copy, cut, paste, mirror, and rotate selections
- Choose up to eight custom colours
- Work with regular charts up to 200 stitches by 300 rows
- Set stitch gauge, row gauge, and centimetres or inches
- Zoom the editable chart and use optional live-symmetry guides
- Flip, rotate, undo, and redo chart changes
- Work on up to eight charts in browser tabs
- Import PNG, JPEG, or WebP images, then crop, position, resize, and reduce them to a stitch palette
- Import charts from PDFs or images: crop and rotate the page, snap a grid to the chart, provide symbol examples, map colours and stitches, and review the result before editing
- Draw yarn colours and stitch symbols as separate layers, including purl, increases, decreases, cast-on, bind-off, and no-stitch cells
- Preview normal or mirrored repeats as textured knitted fabric
- Create printable charts and written row-by-row colour sequences
- Choose stranded, intarsia, or duplicate stitch instructions
- Use Knit Mode with row and stitch progress, optional design-only cropping, and stitch markers
- Zoom and pan in Knit Mode, follow the row-direction arrow, split wide charts into manageable sections, and optionally keep the screen awake
- Download chart and preview PNGs or save an editable `.knitplot` project file
- Export an exact-size stitch bitmap PNG (one pixel per stitch, yarn colours only) for colourwork image import into other tools. Stitch actions and shaping are not encoded; no-stitch cells require an explicit fill-colour choice.

### Circular yoke studio

- Plan a top-down circular yoke from body measurements plus ease, or finished garment measurements, using your gauge
- Adjust the repeat count, increase schedule, and optional back-neck short rows
- Design in standard chart, one-repeat, half-yoke, and whole-yoke views
- Edit one repeat, a selected group, or all repeats; copy colours between repeats
- Move M1L and M1R increases and review shaping revisions before applying them
- Preview the knitted yoke in different views or as an approximate front sweater mockup
- Follow repeated or non-repeating yokes in Knit Mode and print written rounds; work short rows from the written setup

The suggested plan and sweater mockup are design aids, not a guarantee of garment fit. Check your swatch and measurements before knitting.

### Chart Club (optional account)

Anyone can browse public charts. With your existing KnitPlot account, choose a unique username, optionally add a bio and Ravelry, Instagram, or TikTok usernames, then:

- Share a snapshot of a saved chart with a knitted gallery cover
- Follow creators, heart charts, and browse Following and My hearts
- Open or download editable copies of public charts
- Manage your posts in **My Charts → Published charts**
- Report a public chart privately to the moderator

Private edits never change a published snapshot. Authors can edit its title and description or remove the post; removing it cannot recall copies others already downloaded.

### OpenAI API key needed

- Generate a new chart from a text prompt
- Include a reference image while generating
- Revise the generated draft with another prompt before importing it
- Edit the currently open chart with a prompt

AI requests consume credits on the OpenAI account connected to your key. The app always labels those actions before it sends a request.

## Run KnitPlot on your computer

You need [Node.js](https://nodejs.org/) 24 or 25 (Node 24 LTS recommended).

Download or clone this repository, open a terminal in the KnitPlot project folder, and run:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the local address shown in the terminal, usually [http://localhost:3000](http://localhost:3000).

Without any environment variables, the full non-AI chart maker works locally. AI buttons are hidden by default and appear only after signing in and connecting an OpenAI API key under Account settings → Manage sign-in & security → OpenAI connection. To enable that flow locally, configure the optional accounts below.

Never commit or share `.env.local`. It is ignored by Git.

## Configure hosted accounts

KnitPlot uses Clerk for optional accounts and Neon Postgres for private chart storage. The editor itself does not depend on either service.

1. Create or connect Clerk and Neon resources. Vercel Marketplace can inject their environment variables automatically.
2. Set `DATABASE_URL` for your Neon database and run `npm run db:migrate`. See [the migration guide](database/README.md) for existing installations and rollout precautions.
3. Set the Clerk and Neon values from `.env.example` in `.env.local` and in Vercel. Generate `OPENAI_KEY_ENCRYPTION_SECRET` with `openssl rand -base64 32` and never change or expose it while saved API keys exist.

`CLERK_SECRET_KEY`, `DATABASE_URL`, and `OPENAI_KEY_ENCRYPTION_SECRET` are server-only secrets. Never prefix them with `NEXT_PUBLIC_` or commit them.

Public deployments require a signed-in user and their own connected OpenAI key. A server-wide `OPENAI_API_KEY` is accepted only in development, never in production.

## Saving and privacy

- Your open chart workspace and Knit Mode position are saved automatically in that browser's local storage.
- Signed-in users can choose **Save to My Charts**. After the first cloud save, that chart is kept in sync while it remains open.
- **File → Download editable chart** downloads the active chart as an editable `.knitplot` file. It does not bundle every open browser tab.
- Ordinary image importing and colour reduction happen in your browser.
- When you use an AI feature, its prompt and any attached or current-chart image are sent through KnitPlot's server to OpenAI using your connected key.
- Connected OpenAI keys are encrypted with AES-256-GCM before Neon storage and are never returned to the browser. Only the final four characters are shown for identification.
- KnitPlot stores no AI prompts or generated images in the account database. It stores request timestamps only for the 30-per-hour safety limit.
- The hosted site uses Vercel Web Analytics for aggregate site-usage statistics. Charts, prompts, uploaded images, email addresses, and API keys are not sent as analytics events. No AI feature-usage counters are added.
- On the official hosted site, **Chart edited** counts the first drawing change per chart type and guest/signed-in category per page load. **File downloaded** counts initiated chart-maker downloads, with the file format. No chart names, cells, measurements, account IDs, or file contents are included. These events respect Do Not Track and do not run on localhost or other self-hosted domains.
- These are activity counts, not a census of distinct knitters. Opening or restoring a chart does not count as editing; browser-local autosaves are not reported. A download event cannot confirm that the user ultimately kept the file. Blockers and offline use can cause undercounting. Custom events require a Vercel plan that supports them.
- Chart Club is explicitly opt-in. Sharing publishes a separate chart snapshot, your chosen cover and post details, and your public creator profile. Your private library stays private. Review the sharing form before publishing, including whether to include yoke measurements.

Browser storage is convenient, but it is not a backup. Download important charts as `.knitplot` files.

## Project checks

```bash
npm run typecheck
npm run lint
npm test
npm run format:check
npm run build
```

Run all checks with:

```bash
npm run check
```

## Contributing

Bug reports, feature ideas, documentation fixes, and code contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please report sensitive security problems as described in [SECURITY.md](SECURITY.md).

## Supporting KnitPlot

KnitPlot is free and open source. If it is useful to you, you can buy me a coffee [here](https://ko-fi.com/syalr2). There will never be a payment requirement inside the chart maker.

## License and assets

KnitPlot's source code is available under the [MIT License](LICENSE). The knitted-preview texture is described in [public/textures/LICENSE.md](public/textures/LICENSE.md).
