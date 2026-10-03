# no-dinos.com

[![tests](https://github.com/mark-mcdermott/no-dinos-public/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/mark-mcdermott/no-dinos-public/actions/workflows/tests.yml)

Goofy and enlightening 10 minute (36 slides) slide presentation about prehistoric
animals that **aren't dinosaurs**. Slides (fullscreen & dataview) available online.

Live at **https://www.no-dinos.com**.

Built with [Astro](https://astro.build) 5 — static output, one React island for
navigation, slide art through `astro:assets`.

Source-available, not open source: see [LICENSE](LICENSE). The slide art is not
in this repository.

## Getting started

```bash
pnpm install
pnpm dev          # http://localhost:4321
```

pnpm only — the version is pinned in `package.json`.

A fresh clone has no slide art, so the first `pnpm dev` or `pnpm build`
generates flat placeholder images and everything still runs. See [Art](#art)
for using the real thing.

## Scripts

| | |
|---|---|
| `pnpm dev` | fetch the art, then the dev server |
| `pnpm build` | fetch the art, `astro check`, production build, then prune unreferenced image originals |
| `pnpm art` | just the art step |
| `pnpm preview` | serve the built site |
| `pnpm lint` | ESLint over the TypeScript and `.astro` sources |
| `pnpm test` | both Playwright suites below |
| `pnpm test:controls` | behaviour: keyboard, buttons, view mode, dock, swipe, cookies |
| `pnpm test:visual` | screenshot every deck state on desktop and phone and diff against production |

Both suites run against the built site and start `astro preview` themselves,
so `pnpm build && pnpm test` is the whole loop. They need
`pnpm exec playwright install chromium` once per machine; see
`tests/visual/README.md` for how the visual comparison works. The visual
comparison is only meaningful with the real art, since production is the
reference.

GitHub Actions (`.github/workflows/tests.yml`) runs build, lint and the
controls suite on every PR and every push to `main` — that is what the badge
reports. When a run has access to the art it also runs the visual comparison
with production on PRs, as a report rather than a gate: a PR that changes the
deck on purpose is supposed to differ.

## Art

The slide images live in a separate private repository. `scripts/fetch-art.mjs`
runs at the start of `pnpm dev` and `pnpm build` and fills `src/assets/images/`
(gitignored). It takes the art from, in order:

1. `ART_REPO_URL`, with `ART_REPO_TOKEN` (a read-only token) and optionally
   `ART_REF` — how production builds get it;
2. a sibling checkout at `../no-dinos-private`;
3. generated placeholders.

Production builds (`VERCEL_ENV=production`) refuse to fall back to
placeholders. `ART_REFRESH=1 pnpm art` pulls the art again.

## Layout

```
data/           slide order (order.json) and per-slide .jsonc content
src/assets/     slide art, in dataview / fullscreen / titles crops (fetched, not committed)
src/pages/      index.astro — the whole deck, every state prerendered
src/components/ 12 .astro components, one React island (DeckControls)
src/content.config.ts   zod-validated content collections
scripts/        fetch-art, and the post-build image prune
tests/controls/ Playwright behaviour tests
tests/visual/   Playwright visual comparison with production
docs/           astro-rewrite-plan.md — record of the Next.js → Astro migration
```

`CLAUDE.md` has the longer version: architecture, data model, and the gotchas
worth knowing before changing anything.

## Deploying

Vercel project `no-dinos`, auto-deploying from `main`, with `ART_REPO_URL` and
`ART_REPO_TOKEN` set for the Production environment. `main` is production, so
work goes through a PR — `.githooks/pre-push` refuses a direct push. Enable it
once per clone with `git config core.hooksPath .githooks`.

## License

All rights reserved; see [LICENSE](LICENSE).
