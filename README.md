# KnitPlot

KnitPlot is a local-first, open-source colourwork chart maker for knitters. Draw charts stitch by stitch, turn an image into a limited-colour chart, preview the result as knitted fabric, and follow it row by row in Knit Mode.

The core app is free to use and does not need an account, a server, or an API key. Optional image generation and prompt-based editing use your own OpenAI API key.

## Use KnitPlot online

Open the hosted chart maker at [knitplot.vercel.app](https://knitplot.vercel.app). The non-AI tools work without an account and save the current workspace in that browser.

Cloud accounts, cross-device chart syncing, and a secure way to connect a personal OpenAI API key are in development. Until that connection is available, the hosted version does not enable AI requests. The optional AI features remain available when running a private copy with a server-side key as described below.

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

The `.env.local` file is only needed for the optional AI features. To enable them, add your own key:

```dotenv
OPENAI_API_KEY=your_key_here
```

Never commit or share `.env.local`. It is ignored by Git.

## Important API-key safety note

KnitPlot is designed primarily for local, personal use. The OpenAI key stays on the server side and is never sent to the browser, but the included AI routes do not provide user accounts, authentication, quotas, or rate limiting.

Do **not** deploy KnitPlot publicly with your personal `OPENAI_API_KEY` unless you first protect the AI routes with authentication and spending controls. Otherwise, visitors could make requests that are charged to your account. A public deployment without a key is safe to use as the non-AI chart maker.

## Saving and privacy

- Your open chart workspace and Knit Mode position are saved automatically in that browser's local storage.
- **Save chart** downloads the active chart as an editable `.knitplot` file. It does not bundle every open browser tab.
- Ordinary image importing and colour reduction happen in your browser.
- When you use an AI feature, its prompt and any attached or current-chart image are sent through your local KnitPlot server to OpenAI.
- KnitPlot has no user accounts, analytics, or remote chart database.

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
