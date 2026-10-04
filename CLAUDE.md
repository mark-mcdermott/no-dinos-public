# no-dinos.com

A 36-slide presentation (and website) about big prehistoric animals that
**aren't dinosaurs**.

Live at **https://www.no-dinos.com** (apex 308-redirects to `www`).

## Status

**Shipped on Astro.** The Next.js → Astro rewrite landed in PR #3 on
2026-09-17; `main` is the Astro build and it is what production serves. There
is no port in flight and no `astro-rewrite` branch to work from —
`docs/astro-rewrite-plan.md` is now the historical record of that migration,
kept because its measurements and its "why it is built this way" notes still
explain the current code. Read it for background, not for instructions. This
repository carries no commit history; hashes cited there belong to the original
repository.

v1.0 is shipped and the art is at a stopping point. The slide art is not in
this repository: it lives in a separate private repo and is fetched at build
time (see "Art" below), so a clone with no access builds with placeholders.

## Stack

Astro 5 (static output, no adapter) · Tailwind 4 · TypeScript · React 19, used
sparingly.

Node 25 · pnpm 10.28.2 (pinned via `packageManager` — keep it that way).

How it actually fits together:

- **One page.** `src/pages/index.astro` prerenders every state the deck can be
  in — 28 animals × 2 view modes + 8 title slides, which render identically in
  either mode, so 64 `<section data-deck-state>` across 36 slide indices. All
  but one are `hidden`. `view-source` shows the whole deck.
- **Twelve `.astro` components** hold the slide chrome (`DeckSlide`,
  `AnimalSlide`, `TitleSlide`, `AnimalSidebar`, `SidebarSection`, `SidebarNav`,
  `SidebarSignature`, `Timeline`, `TimelineLabel`, `DeckDock`, `LoaderImage`,
  `CoverCredit`).
  Static markup, no hydration.
- **One client island.** `src/components/DeckControls.tsx` (`client:load`) owns
  slide index, view mode, keyboard nav (arrows, and Ctrl+D to show/hide the
  dock), swipe, and cookie persistence, and navigates by toggling `hidden`.
  It is the only thing on the page that ships JS to do a job.
- **One unhydrated React leaf.** `src/components/Icon.tsx` maps a name onto a
  `lucide-react` component. No `client:*` directive, so it renders at build
  time and ships nothing; it stays React because going Astro-native would mean
  a new dependency or thirty-odd hand-transcribed SVGs to save zero bytes.
- **Content collections.** `src/content.config.ts` defines `animals` and
  `titles` behind Zod schemas, loaded from the `.jsonc` files by a custom
  loader, and cross-checks `data/order.json` at build time.
- **Images through `astro:assets`.** Build-time WebP derivatives, resolved per
  slug by `src/lib/slide-images.ts`. Nothing is served from a function.

## Verify loop

```bash
pnpm install
pnpm dev      # http://localhost:4321 (fetches the art first)
pnpm build    # fetch art + astro check + astro build + image prune; must pass before any deploy
pnpm lint
pnpm test:controls # behaviour suite, ~10s
pnpm test:visual   # 128-state visual comparison with production, ~1-2 min
```

Vercel project `no-dinos` (team `mark-mcdermott-team`) auto-deploys from
`main`. `build` + `lint` + `test:controls` is the gate, and CI
(`.github/workflows/tests.yml`) enforces it on every PR and push to `main`.

Both Playwright suites run against the built site; `playwright.config.ts`
starts `astro preview` on :4321 itself (or reuses one already running). They
need `pnpm exec playwright install chromium` once per machine.

- `tests/controls/` drives the real page: arrows, first/prev/next/last, the
  mode chip and its long-press reset, Ctrl+D and the info button, swipe,
  scroll reset, and cookie persistence including the pre-hydration first paint.
- `tests/visual/` screenshots every deck state — 64 on desktop, 64 on a phone
  viewport — from the local build and from production in the same browser run,
  and fails on drift. A branch that changes the deck on purpose fails it by
  design, so in CI it reports (summary + `visual-diffs` artifact) rather than
  blocks. Point `VISUAL_REFERENCE_URL` at a locally served build of any commit
  to compare against something other than production. See
  `tests/visual/README.md`; the thresholds there are calibrated, not guessed.

## Art

The slide images are not in this repo. They live in a separate private repo, and
`scripts/fetch-art.mjs` fills `src/assets/images/` (gitignored) at the start of
`pnpm dev` and `pnpm build`. It takes the art from, in order:

1. `ART_REPO_URL` — with `ART_REPO_TOKEN` (a read-only token) and optionally
   `ART_REF` — which is how Vercel production and CI runs with access get it;
2. a sibling checkout at `../no-dinos-private`, which is what a local clone uses;
3. otherwise generated flat placeholders, one per slide, so a bare clone still
   builds and the controls suite still runs.

- **Production fails closed.** With `VERCEL_ENV=production` and no
  `ART_REPO_URL` the script stops the build instead of deploying a deck of
  placeholders — an expired token would otherwise do exactly that, silently.
  `ART_REQUIRE=1` asks for the same thing anywhere else.
- **Real art is never swapped for placeholders**, so a local copy survives
  `pnpm dev`. `ART_REFRESH=1 pnpm art` pulls it again.
- **The visual suite compares against production's art**, so it only means
  something when the build has the real art; CI skips it otherwise.
- New or changed art is pushed to the art repo, whose workflow pings a Vercel
  deploy hook. Nothing changes in this repo.

## Data model

- `data/order.json` — the slide order, and the **only** thing that decides
  what renders. `src/content.config.ts` cross-checks it against the data files
  at build time, so an animal with data and no entry here is now a build
  failure rather than a silent omission.
- `data/animals/<slug>.jsonc` — 28 animals. JSONC *with comments*; parsed with
  `jsonc-parser`, not `JSON.parse`.
- `data/titles/<slug>.jsonc` — 8 section title slides. The slug is the file
  and image name only; the displayed copy is the `title` field, so the two
  can drift (e.g. `title-05-hybrid-vibes` reads "Nature's Mashups").
- **Per-slide display settings** live in the data, not in code: each title
  file, and each animal's `fullscreenDisplay[0]`, takes `titleSize`,
  `alignX` (left/center/right), `alignY` (top/center/bottom), `stackWords`,
  and `imageFocus: { "x": 0–100, "y": 0–100 }` — the point of the picture
  that cropping keeps in frame (defaults to the centre). Schema is
  `displaySchema` in `src/content.config.ts`.
- `src/assets/images/{dataview,fullscreen,titles}/<slug>.png` — **not
  committed**; `scripts/fetch-art.mjs` fills it (see "Art"). `dataview` and
  `fullscreen` hold different crops of the same animal and must stay in sync
  as a pair. They sit under `src/` so `astro:assets` can build WebP derivatives
  from them; `src/lib/slide-images.ts` resolves them per slug and fails the
  build on a missing or half-deleted pair. The art repo also holds a complete
  `quagga` pair with no `data/animals/quagga.jsonc` and no `order.json` entry,
  so it renders nowhere.

Animals carry an `Image Accuracy` metadata percentage; **pelagornis**'s `0%` is
an unfilled placeholder rather than a score.

## Gotchas — all of these have bitten before

Live, and still able to bite:

- **pnpm is pinned to 10.28.2 to match the rest of the projects** (it was briefly
  12.3.4). Don't bump `packageManager` casually: pnpm 12 writes a second YAML
  document into `pnpm-lock.yaml` (it pins pnpm itself), and 10.x refuses it with
  `ERR_PNPM_BROKEN_LOCKFILE`. Going back up means regenerating the lockfile.
- **The art is fetched, not committed.** Production fails closed on purpose (see
  "Art"); don't add a fallback that lets it build with placeholders.
- **Never put slide art in `public/`.** It belongs in `src/assets/images/` so
  `astro:assets` can see it. A copy under `public/` would ship raw multi-MB
  PNGs alongside the derivatives and, worse, is how the deck once served
  months-old art while the files on disk were current (the Next build served
  `public/` ahead of the `/images/[...slug]` route).
  `public/` itself is fine and does now exist — it holds the favicon files,
  which are unprocessed by design and belong at a fixed root path regardless
  of build hashing. The rule is about the image pipeline, not the directory.
- **Don't bypass the image pipeline** — no `unoptimized`-style escape hatch,
  and no raw `<img src>` pointed at a source PNG. The sources are 2–3 MB each
  (172 MB in total) and the WebP derivatives are 18.8 MB; going around
  `astro:assets` costs 10–30× on transfer, and it has happened before.
- **`astro build` leaves the original PNGs in `dist/`** — ~160 MB of them,
  because the page that renders images also imports `astro:content`. That is
  why `pnpm build` ends with `scripts/prune-unused-images.mjs`, which deletes
  assets nothing in the emitted HTML/CSS/JS references and takes the output
  from ~180 MB to ~20 MB. It is a workaround for an upstream quirk, not a
  diagnosis; see the measurement table under Phase 3 of the rewrite plan
  before changing it, and re-test it on a newer astro.
- **A `hidden` attribute loses to a Tailwind display class.** The deck hides
  slides with `<section hidden>`, so that element must never carry `flex` or
  `grid` — every slide would render at once. It is avoided structurally today:
  each `<section>` has no display class at all and the `grid`/`flex` wrapper is
  a div *inside* it.
- **The blocking inline script in `index.astro` paints the first frame**, not
  the island. It applies the `current_slide` / `view_mode` cookies during
  parse. `client:load` hydrates too late to decide what is on screen, so
  without it the deck paints slide 1 and swaps — visible as a flash, and enough
  to make the visual suite screenshot the wrong slide. The `data-deck-*`
  attributes it reads are a contract shared with `DeckControls.tsx`; change
  them in both places.
- **`LoaderImage`'s spinner must never carry a `z-index`.** That outranks the
  `z-[2]` headline and hides the title behind the picture. Cost one full-suite
  failure to find.
- **`tailwindcss` is pinned to `4.1.13`, deliberately.** 4.3 changed the
  default `--font-sans` stack, which moves every glyph on the deck and fails
  all 64 visual states. It is pinned back; don't loosen it to `^4`
  without re-running the suite and accepting the redesign.

Historical — the bugs are gone with the framework, but the reasoning is why
things are shaped the way they are:

- The Next build served images from an `/images/[...slug]` route handler, which
  needed `outputFileTracingIncludes` in `next.config.ts` or every image 404'd
  in production. Nothing is served from a function any more, so there is no
  equivalent to forget.
- `src/data/hot.ts` was a generated dev-reload stamp that had to stay tracked
  (and `skip-worktree`'d) or the build broke. Astro's content loader watches
  `data/` itself; the file and its generator were deleted in phase 7.

## Conventions

- Conventional commits: `type(scope): description`, lowercase, no period.
- **Work goes through a PR.** Branch off `main`, push, open a PR, let checks
  pass, then merge. Nothing lands on `main` directly. `main` is protected and
  auto-deploys to production, so a bad merge is a live outage.
- Open PRs **ready for review, never as drafts**. Squash-merge and delete the
  branch after.
- `automerge` is off — opening the PR is where an agent stops. Merging is the
  owner's call.
- **No AI or Claude attribution anywhere** — commits, PRs, comments, code.
  That includes the git author and committer identity, not just the message.
- **pnpm only.** Not npm, not yarn. New native dependencies that pnpm blocks
  from running postinstall scripts go in `pnpm-workspace.yaml`'s `allowBuilds`.

Config lives in `.claude/settings.json` (permissions, commit style, automerge,
stack).

`.githooks/pre-push` refuses a direct push to `main`. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

GitHub-side branch protection needs Pro for a private repo, so this hook is
the only enforcement — it is a guardrail, not a wall. In a real emergency,
`ALLOW_MAIN_PUSH=1 git push origin main`.
