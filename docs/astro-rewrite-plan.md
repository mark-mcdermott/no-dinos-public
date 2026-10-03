# no-dinos.com → Astro

> Historical record. This repository carries no commit history; hashes cited below
> belong to the original repository.

> **Resume with cleared context:** "Read docs/astro-rewrite-plan.md and execute it
> phase by phase." Each phase ends green (typecheck + build) and deployable.

## Why

One stack across my projects — **Astro + React islands, on Vercel**. This app
is the easy case: no auth, no DB, no API,
one page.

What Next was actually providing here: `next/image`, and nothing else. One
route, 11 client components, `force-dynamic` on data that is static files.

## Target

Static Astro site. Every slide prerendered as real HTML with build-time image
derivatives; one small island owns navigation state. No serverless function in
the request path, so the cold-transcode cost (~1.1s per uncached image today)
disappears entirely.

**Decisions (settled):**

1. **Rewrite before v1.** The art punch list lands on the new stack, so images
   are not wired up twice.
2. **All 36 slides prerendered.** One `client:load` island toggles visibility.
   Navigation does no network work.
3. **`astro:assets` build-time images.** Sources move to `src/assets/`; sharp
   emits WebP derivatives as hashed static files.
4. **Pure static output** — no adapter. Nothing needs SSR.
5. **In-place on `astro-rewrite`.** Old code stays recoverable in git history.
6. **Lands via a PR.** Nothing goes near `main` directly — `.githooks/pre-push`
   refuses it, and `main` auto-deploys to production.

## Phases

### Phase 1 — Astro skeleton
Replace Next scaffolding with Astro 5 + React 19 + `@astrojs/react` +
Tailwind 4. Delete `src/app/`, `next.config.ts`, `middleware.ts`,
`next-env.d.ts`, `components.json`.
**Done when:** `astro build` succeeds on a placeholder page; `astro check` clean.

### Phase 2 — Content collections
`src/content.config.ts` with `animals` and `titles` collections behind Zod
schemas, loaded from the existing `.jsonc` files via a small custom loader
using `jsonc-parser` (already a dependency). `order.json` drives slide order.
**Done when:** all 28 animals + 8 titles load and validate; a schema violation
fails the build. Ordering bugs like pelagornis missing from `order.json`
become build errors, not silent omissions.

### Phase 3 — Images ✅
`git mv data/images` → `src/assets/images`. Resolve per-slide via
`import.meta.glob` and render through `<Image>`/`getImage()`.
**Done when:** build emits WebP derivatives; no image is served from a function;
output size and build time recorded here.

Landed as `src/lib/slide-images.ts`: three lazy `import.meta.glob` calls (one
per crop folder) behind `dataviewImage()` / `fullscreenImage()` /
`titleImage()` / `animalImages()`, plus a build-time check that every slug in
`order.json` has its art and that dataview/fullscreen never get half-deleted.
No page imports it yet — phase 4 wires the deck — so it is dormant in the same
way `src/lib/slides.ts` was after phase 2.

**Measurements.** Taken with a cleared `dist/`, `.astro/` and
`node_modules/.astro/` image cache, against a temporary page that rendered
every image reachable from `order.json` (64 sources: 28 animals × 2 crops +
8 titles) at three widths each.

| | build | `dist/` |
| --- | --- | --- |
| Phase 2 head (placeholder page, no images) | 13.2s | 228 KB, 3 files |
| Phase 3 as committed (resolver present, unused) | 11.4s | 228 KB, 3 files |
| All 64 images rendered, cold image cache | 23.1s | 180 MB → **20 MB** pruned |
| All 64 images rendered, warm image cache | 13.0s | 180 MB → **20 MB** pruned |

Derivatives are genuine WebP: 181 files, **18.8 MB total**, down from 172 MB
of source PNG — `dataview/pelagornis.png` goes 2,101,871 B PNG 1536×1024 →
25,594 B WebP 640×427, and no `src`/`srcset`/`href` in any emitted HTML points
at a `.png`. Nothing is served from a function; the Next-era
`/images/[...slug]` route went away in phase 1 and does not come back.

Sharp is not the bottleneck the risk section feared — the sources are only
1536–1820 px wide, so 172 MB is PNG compression waste rather than resolution,
and 181 transforms cost ~9.5s. **Pre-converting sources to WebP was therefore
not done**: the trigger for it was build pain, and there is none.

**Astro keeps the original PNGs, so the build prunes them.** Of that 180 MB,
only 18.8 MB is derivatives; the other 160 MB is 60 original PNGs sitting in
`dist/_astro/` with nothing linking to them. Astro emits each source alongside
its derivatives and deletes the original once it is satisfied the image
pipeline was its only consumer (the `unlink` in
`astro/dist/assets/build/generate.js`). That cleanup does not happen here.

Measured on astro 5.18.2, rendering all 64 deck images:

| Page imports | Originals left in `dist/` |
| --- | --- |
| images only, no `astro:content` | **0** |
| images + `astro:content`, `import.meta.glob` | 62 |
| images + `astro:content`, static `import` per file | 60 |
| images + `astro:content`, with and without `node:fs` | 60–62 either way |

So the trigger is **`astro:content` in the rendering page's module graph** —
not the glob, not `node:fs`, and not the shape of the import. Phase 4's deck
needs `astro:content` for animal data, so it will hit this. Two things this
rules out: swapping the glob for a static import map does not help (measured),
and pre-converting sources to WebP would only shrink the duplication, not
remove it.

`scripts/prune-unused-images.mjs` runs after `astro build` and deletes assets
in `dist/_astro/` whose filename appears nowhere in the emitted HTML/CSS/JS.
It takes the 180 MB output to ~20 MB. It is a workaround, not a diagnosis:
worth re-testing on a newer astro, and worth reporting upstream with the table
above. Note this costs nothing today — nothing renders images until phase 4 —
so the prune is a no-op on the current build.

One caveat on the numbers: a single `import.meta.glob` run left only 2
originals (quagga's pair) rather than 62, and that result did not reproduce
across four later attempts. It is unexplained. The prune makes it moot either
way, since it works on whatever is actually unreferenced.

Independent of all that: an image imported but never rendered always keeps its
original (verified directly — 2 imported, 1 rendered, 1 PNG left). That is
ordinary behaviour, and it is why `quagga` would otherwise ship ~5.8 MB.

### Phase 4 — Deck ✅
`index.astro` renders all slides as `<section hidden>`. `DeckControls` island
(`client:load`) owns index, view mode, keyboard nav and cookie persistence,
and toggles visibility. Both view modes are in the DOM; the active mode's
first slides load eagerly, everything else lazily.
**Done when:** arrows, mode toggle, reset and cookie persistence all behave as
they do on Next today, view-source shows the whole deck, and
`pnpm test:visual` passes.

The island must keep reading and writing the `current_slide` and `view_mode`
cookies — the visual suite drives the deck through them. Note that a bare
`hidden` attribute loses to a Tailwind `flex`/`grid` class on the same
element; if slides all render at once, that is why.

**Landed.** 64 `<section data-deck-state>` in the built HTML — 8 titles
(`data-mode="both"`, they render the same either way) plus 28 × 2 animals —
across 36 slide indices, 63 of them `hidden`. 980 KB of HTML, `dist/` still
19 MB, and the prune still clears 62 originals / 160 MB per build.

`Deck.tsx` split in two: `DeckSlide.tsx` composes one state, `DeckControls.tsx`
holds what used to be its `useState`. `src/lib/images.ts`'s prefetch scheme has
no job left — every state is already in the document — and `src/lib/data.ts` is
superseded by the content collections; both are dead but stay for phase 7.

Four things worth knowing before touching this again:

- **The `hidden` trap is avoided structurally.** Each `<section>` carries no
  display class at all; the `grid`/`flex` wrapper is a div *inside* it. The
  `[data-deck-state][hidden]` rule in `globals.css` is only a second line.
- **A blocking inline script, not the island, paints the first frame.** It
  applies the cookies during parse. `client:load` hydrates too late to decide
  what is on screen, so without it the deck paints slide 1 and swaps — visible
  as a flash, and enough for the visual suite to shoot the wrong slide.
- **`LoaderImage` no longer fades.** The fade was React state, and a slide that
  stays invisible until React runs defeats the whole prerender. The spinner
  survives as a backdrop the image paints over. It must never carry a
  `z-index`: that outranks the `z-[2]` headline and hides the title behind the
  picture (cost one full-suite failure to find).
- **`decoding="sync"`, deliberately.** With `async`, `img.decode()` still took
  up to ~90ms after the image reported `complete`, so the deck painted headline
  and dock over an empty backdrop for a frame or two. `sync` takes that to
  <2ms.

Candidate widths are `[640, 1200, <source width>]`. 1200 is the rung of
next/image's ladder the old build served into the 1120px data-view slot, so the
browser downscales from the same source width it did before; a mismatch here
reads as diffuse speckle over high-frequency artwork, not as a layout change.

**Visual suite: all 64 states pass.** One caveat about *running* it: the
reference build fades its images in on a React `onLoad`, while `capture.ts`
waits only for `complete && naturalWidth > 0`. Against a local reference the
image often loads faster than React hydrates, so a few states screenshot the
reference mid-fade and fail at 60–90% — always reference-side, always a
different handful. `--retries=2` clears it without touching a threshold. This
is much rarer against the pinned Vercel deployment, where the image is the
slower half. If that gap ever needs closing for good, the fix belongs in
`capture.ts` (wait for opacity, not just decode), not in the deck.

### Phase 5 — Chrome and styling ✅
Port `AnimalSidebar`, `Timeline`, `SidebarNav`, `SidebarSignature`,
`TitleSlide`, `AnimalSlide`. Static markup becomes `.astro`; only genuinely
interactive pieces stay React. Convert the three shadcn components in use
(`badge`, `card`, `separator`) to Astro markup — `button` and `scroll-area`
are unused and get dropped.
**Done when:** `pnpm test:visual` passes all 64 states, and a human has
spot-checked mobile, which the suite does not cover.

**Landed.** Twelve `.astro` components, one React island, one React leaf.
The list above predates phase 4, so `DeckSlide`, `DeckDock` and `LoaderImage`
went too — same criterion, static markup with no interactivity. Two internal
sub-components became their own files, since an `.astro` file holds exactly one
component: `AnimalSidebar`'s `Section` → `SidebarSection.astro`, `Timeline`'s
`LabelChip` → `TimelineLabel.astro`. `LoaderImage`'s `SlideImageSource` moved
to `src/lib/types.ts` rather than being exported from a template.

**This is not a performance change, and the numbers say so.** None of these
components ever hydrated — phase 4 already had them running once at build time
through Astro's no-directive rendering — so there was no bundle to shrink:

| | phase 4 | phase 5 |
| --- | --- | --- |
| client JS | 190,067 B (3 files) | 190,067 B, **identical hashes** |
| `dist/index.html` | 981,529 B | 955,663 B (−2.6%) |
| CSS | 30,973 B | 28,672 B (−7.4%) |
| `dist/` total | 20.07 MB, 185 files | 20.05 MB, 185 files |

The HTML shrank because React's SSR is chattier, not because anything is
missing. Every difference between the two documents was enumerated: 210 badge
divs, 84 card divs and 28 separators lost shadcn theme classes that Tailwind
emits **no rule** for (`bg-card`, `text-card-foreground`, `bg-secondary`,
`bg-border`, `ring-ring` — the tokens were never defined in `globals.css`), the
separator lost Radix's `data-orientation`, and React's `<!-- -->` text
separators and `="true"` boolean-attribute spellings went away. The CSS shrank
because deleting `ui/button.tsx` and `ui/scroll-area.tsx` took their class
names out of Tailwind's content scan. No text, no structure, no layout class
changed anywhere.

One thing genuinely disappeared: React 19 emitted a
`<link rel="preload" as="image">` next to the first slide's `<img>` — Float
doing that on its own for a high-priority image, never something this deck asked
for. The `<img>` still carries `loading="eager"` and `fetchpriority="high"`, and
it is in the initial HTML where the preload scanner sees it immediately, so it
was left out rather than hand-written back in.

**`Icon.tsx` stays React.** It is the one leaf that isn't markup — it maps a
name onto a `lucide-react` component. Going Astro-native would mean a new
dependency (`astro-icon` or `lucide-static`) or transcribing thirty-odd SVGs by
hand, to save nothing: without a `client:*` directive it renders at build time
and ships no JS either way. `DeckControls.tsx` stays React because it is the
island.

**Visual suite: all 64 states pass** — but read the next paragraph before
trusting a run of it.

**The pinned reference no longer matches, for a reason that is nothing to do
with this phase.** `d9ff201` (yarn → pnpm) re-resolved `"tailwindcss": "^4"`
from 4.1.13 to 4.3.3, and 4.3 changed the default `--font-sans` stack:

```
4.1.13  ui-sans-serif, system-ui, sans-serif, …
4.3.3   -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …
```

Every glyph on the deck is set in that stack, so all 64 states differ from the
Next build — the cover headline alone is 1293px wide against 1115px. Verified
to predate phase 5: the **unmodified `d9ff201` build fails the same 64 states
with the same 22.62% on the cover slide.**

**Resolved in `db422f4`:** pinned `tailwindcss` and `@tailwindcss/vite` to the
exact `4.1.13` production was built against, rather than accepting the new
stack — this port isn't a design change, so the original font stack wins.
`pnpm test:visual` passes 64/64 against the live pinned reference again (one
state needed a rerun — the same known mid-load race on the reference side
described in phase 4, not a real difference).

So phase 5 was proven two ways:

1. **Against the phase-4 build** (`d9ff201` in a worktree, same Tailwind, same
   everything but the templates) — **64/64, zero retries**. This is the real
   proof that the conversion changes no pixels.
2. **Against `ed7cda6` rebuilt locally** with its Tailwind bumped to 4.3.3 to
   neutralise the drift above — **64/64** (60 clean, 4 flaky-then-green on
   `--retries=2`, all reference-side, exactly the mid-fade artifact described
   under phase 4).

The pinned Vercel URL was not usable: this sandbox's egress policy 403s it, as
in an earlier phase.

**Mobile is unchanged and still wrong.** At 390×844 the phase-4 and phase-5
builds report identical `scrollWidth`×`scrollHeight` on every state checked, so
nothing here regressed it. What is there to see: the data view never collapses
its `grid-cols-[20rem_1fr]`, so on a phone the sidebar takes the width and the
hero image, timeline and quick facts are crushed into ~90px on the right —
timeline labels overlap each other and quick-fact values wrap one word per line.
The page scrolls horizontally in four of the five states sampled (448–518px of
content in a 390px viewport). Fullscreen states fare better, though a long title
still runs off the right edge and the nav dock sits on top of its last line.
That is a layout job, not a port job.

### Phase 6 — Open the PR, then deploy
Open a PR from `astro-rewrite` into `main` — ready for review, never a draft.
Summarise what changed per phase, paste the Phase 3 build measurements, and
state whether `pnpm test:visual` passes all 64 states. **Stop there.** Merging
and deploying are the owner's call; `main` auto-deploys to production, so a
merge is a release.

After merge: point the existing Vercel project at Astro (framework
auto-detects on redeploy). Same repo, same domain, same project.
**Done when:** preview deploy green, images byte-verified, `www.no-dinos.com`
serving the Astro build.

### Phase 7 — Cleanup and agent-readiness
Drop Next/React-DOM-specific deps, `src/lib/dev-hot.ts`, `src/data/hot.ts`
(and its `skip-worktree` bit), the `/images` route handler and its
`outputFileTracingIncludes`. Add a committed `CLAUDE.md`.
**Done when:** no Next references remain and `CLAUDE.md` is committed.

## Verify loop

`astro check` + a production build at every phase, plus the visual parity
suite once the deck renders (Phase 4 onward):

```bash
npx playwright install chromium   # once per machine
pnpm build && pnpm preview        # serve the Astro build
VISUAL_CANDIDATE_URL=http://localhost:4321 pnpm test:visual
```

It screenshots all 64 slide states from this build and from the last Next
production deployment and fails on any visual drift, so the port can be
proven rather than eyeballed. Read `tests/visual/README.md` before changing
any threshold — they are calibrated, not guessed. `packageManager` is pinned
in `package.json`; keep it that way.

## Risks

- **Build time and output size.** 66 source PNGs (172 MB) through sharp at
  several widths. Measured in Phase 3 — see the table there. Build time is a
  non-issue (~9.5s for 181 transforms, cached after the first run) and the
  derivatives total 18.8 MB, so the pre-convert-to-WebP mitigation was not
  needed. Output size has a different problem than the one anticipated: astro
  keeps every original PNG in `dist/` once the rendering page also imports
  `astro:content`. `scripts/prune-unused-images.mjs` clears them after each
  build. See the measurement table under Phase 3 before starting Phase 4.
- **Visual drift.** Now covered by `pnpm test:visual` (64 states, ~1 min).
  Run it from Phase 4 onward and keep it green rather than leaving appearance
  to a manual pass at the end. A failure writes reference, candidate and diff
  PNGs to `test-results/visual/`; look at them before touching a threshold.
- **Cookie/state parity.** `src/lib/cookies.ts` is small and ports directly,
  but slide-index persistence is easy to get subtly wrong.
- **Not a design change.** Behavior and appearance stay as-is. Art changes are
  a separate list, kept outside this repository.
