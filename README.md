# KnitPlot

KnitPlot is a free, open-source chart maker for knitters. Draw colourwork stitch by stitch, import an image or an existing chart, or design a circular yoke from your measurements. Preview how it might knit up, then follow the chart row by row in Knit Mode.

The core app is free to use and does not need an account. Optional accounts add private cross-device chart saves and Chart Club, where knitters can share charts and follow creators.

## Use KnitPlot online

Open the chart maker at [knitplot.art](https://knitplot.art), then choose **+ New chart → Blank chart** or **Circular yoke**. Your workspace saves in that browser. To back it up or move it to another device, download an editable `.knitplot` file from **File** or sign in to save it to **My Charts**.

## What it can do

### Chart editor

- Draw, erase, flood-fill, and fill rectangular selections
- Select a rectangle with **Area** or a connected motif with **Element**. Drag or nudge a selection to move it, or mirror and rotate it.
- Copy and paste between open regular charts. Element selections leave background gaps transparent, and pasted stitches keep their stitch count even at a different gauge.
- Choose up to 20 custom colours. Double-click a colour name to rename it, or focus it and press `F2`.
- Work with regular charts up to 200 stitches by 300 rows
- Set stitch gauge, row gauge, and centimetres or inches
- Zoom the editable chart and use optional live-symmetry guides
- Flip, rotate, undo, and redo chart changes
- Work on up to eight charts in browser tabs
- Import PNG, JPEG, or WebP images, then crop, position, resize, and reduce them to a stitch palette
- Import an existing chart from a PDF or image: crop and rotate it, align the grid, teach KnitPlot what its symbols mean using examples, and check the result before importing
- Draw yarn colours and stitch symbols as separate layers, including purl, increases, decreases, cast-on, bind-off, and no-stitch cells
- Preview normal or mirrored repeats as textured knitted fabric
- Create printable charts and written row-by-row colour sequences
- Choose stranded, intarsia, or duplicate stitch instructions
- Use Knit Mode with row and stitch progress, optional design-only cropping, and stitch markers
- Zoom and pan in Knit Mode, follow the row-direction arrow, split wide charts into manageable sections, and optionally keep the screen awake
- Download chart and preview PNGs or save an editable `.knitplot` project file
- Export an exact-size stitch bitmap PNG (one pixel per stitch, yarn colours only) for colourwork image import into other tools. Stitch actions and shaping are not encoded; no-stitch cells require an explicit fill-colour choice.

Press `?` or choose **Keyboard shortcuts** in **Help and examples** for the full list. In a regular chart, use `D`, `F`, `E`, and `S` to switch drawing tools, `I` to pick a yarn colour from the chart, and `Shift` + arrow keys to move a selection by up to five cells.

### Circular yoke designer

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
- Copy a link with the chart’s knitted cover for sharing outside Chart Club

Private edits never change a published snapshot. Authors can edit its title and description or remove the post; removing it cannot recall copies others already downloaded.

## Run KnitPlot on your computer

You need [Node.js](https://nodejs.org/) 24 or 25 (Node 24 LTS recommended).

Download or clone this repository, open a terminal in the KnitPlot project folder, and run:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the local address shown in the terminal, usually [http://localhost:3000](http://localhost:3000).

Without any environment variables, the chart maker works locally. Set up the optional accounts below for cloud saves and Chart Club.

Never commit or share `.env.local`. It is ignored by Git.

## Configure hosted accounts

KnitPlot uses Clerk for optional accounts and Neon Postgres for private chart storage. The editor itself does not depend on either service.

1. Create or connect Clerk and Neon resources. Vercel Marketplace can inject their environment variables automatically.
2. Set `DATABASE_URL` for your Neon database and run `npm run db:migrate`. See [the migration guide](database/README.md) for existing installations and rollout precautions.
3. Set the Clerk and Neon values from `.env.example` in `.env.local` and in Vercel.

`CLERK_SECRET_KEY` and `DATABASE_URL` are server-only secrets. Never prefix them with `NEXT_PUBLIC_` or commit them.

## Saving and privacy

- Your open chart workspace and Knit Mode position are saved automatically in that browser's local storage.
- Signed-in users can choose **Save to My Charts**. After the first cloud save, that chart is kept in sync while it remains open.
- **File → Download editable chart** downloads the active chart as an editable `.knitplot` file. It does not bundle every open browser tab.
- Image and PDF chart imports, including colour reduction and symbol matching, are processed in your browser.
- **Knitted up → Share preview** creates a PNG in your browser, with optional KnitPlot credit. It does not publish or upload the chart or image.
- The hosted site uses Vercel Web Analytics for aggregate site-usage statistics. Charts, uploaded images, and email addresses are not sent as analytics events.
- On the official hosted site, **Chart edited** counts the first drawing change per chart type and guest/signed-in category per page load. **File downloaded** counts initiated chart-maker downloads, with the file format. No chart names, cells, measurements, account IDs, or file contents are included. These events respect Do Not Track and do not run on localhost or other self-hosted domains.
- The same controls apply to sharing events: link copied, visit via a copied link, editable copy opened, first edit of that copy within 30 minutes, and share-image download initiated. The events use coarse labels such as the preview view and whether credit was included. They do not record where a link or image is shared.
- These are activity counts, not a census of distinct knitters. Opening or restoring a chart does not count as editing; browser-local autosaves are not reported. A download event cannot confirm that the user ultimately kept the file. Blockers and offline use can cause undercounting. Custom events require a Vercel plan that supports them.
- Chart Club is explicitly opt-in. Sharing publishes a separate chart snapshot, your chosen cover and post details, and your public creator profile. Your private library stays private. Review the sharing form before publishing, including whether to include yoke measurements.
- **File → Export → Share a link** makes an unlisted snapshot of the open chart without an account or a cloud save. Links include the chart name and a six-character code. They don’t expire automatically. Use **Manage links** from any chart in the same browser to turn a link off, or download a private recovery file and keep it somewhere safe. **My Charts** also offers links tied to saved charts. Neither option posts to Chart Club; anyone with either link can open or download an editable copy without signing in. Don’t use these links for charts or measurements you want to keep private, and never share your recovery file.

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

To measure chart layout on your machine without a CI timing assertion, run
`node --import tsx scripts/benchmark-chart-layout.ts`.

## Contributing

Bug reports, feature ideas, documentation fixes, and code contributions are welcome. From the chart maker, use **Request a feature or give feedback** at the bottom of the page. See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please report sensitive security problems as described in [SECURITY.md](SECURITY.md).

## Supporting KnitPlot

KnitPlot is free and open source. If it is useful to you, you can buy me a coffee [here](https://ko-fi.com/syalr2). There will never be a payment requirement inside the chart maker.

## License and assets

KnitPlot's source code is available under the [MIT License](LICENSE). The knitted-preview texture is described in [public/textures/LICENSE.md](public/textures/LICENSE.md).
