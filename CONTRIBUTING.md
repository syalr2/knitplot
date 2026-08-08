# Contributing to KnitPlot

Thank you for helping make KnitPlot better for knitters.

## Before you start

- Search existing issues before opening a new one.
- Keep changes focused on one problem or feature.
- Never include an OpenAI API key, `.env.local`, private chart, or private reference image in an issue or commit.
- For larger changes, open an issue first so the design can be discussed before substantial work begins.

## Local setup

KnitPlot requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

An API key is not required for the editor, image importer, previews, instructions, exports, or Knit Mode. If you are working on an AI feature, add your own key to `.env.local` and keep it private.

## Before opening a pull request

Run the complete project check:

```bash
npm run check
```

Then manually check the part of the interface you changed at both a wide and a narrow browser size. Pull requests should explain what changed, why it changed, and how it was tested. Screenshots are helpful for visible interface changes.

## Product principles

- The chart maker must remain useful without an API key.
- One stitch always maps to exactly one colour.
- Knitting dimensions and stitch aspect ratios must remain accurate.
- Quiet, local-first behaviour is preferred over accounts, tracking, or unnecessary cloud services.
- AI output must remain editable rather than replacing manual control.

By contributing, you agree that your contribution may be distributed under the project's MIT License.
