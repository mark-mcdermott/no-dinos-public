# Visual comparison tests

Catches unintended changes to how the deck looks. Every slide is screenshotted
from the local build and from production, and compared pixel by pixel.

## Running

```bash
pnpm exec playwright install chromium   # once per machine
pnpm build
pnpm test:visual                        # all 128 states, ~1-2 minutes
pnpm test:visual:sample                 # every 8th state, ~20 seconds
```

`playwright.config.ts` serves the build on :4321 itself (`PREVIEW_PORT` changes the port). Override either side
with `VISUAL_CANDIDATE_URL` / `VISUAL_REFERENCE_URL` — for instance a locally
served build of `main` as the reference when working offline.

## Why it compares two live builds

Committed baseline images only match on the machine that produced them —
fonts and antialiasing differ across platforms, so a macOS baseline fails on
Linux CI for reasons that have nothing to do with the code. Here both
screenshots are taken by the same browser in the same run, so the rendering
environment cancels out and only the server differs. That is what makes the
suite valid across a framework port, where the DOM changes completely but the
pixels must not.

The reference is production (`https://www.no-dinos.com`), which is `main`
once Vercel has deployed it. During the Next → Astro port it was pinned to the
last Next build instead; after the port shipped that made every later change
read as a failure.

A branch that changes the deck on purpose is *meant* to fail this. In CI it
therefore runs on PRs as a report — a note in the run summary and the PNGs in
a `visual-diffs` artifact — rather than a required check.

## What it covers

128 states: 28 animals in both view modes, plus 8 title slides, which render
the same layout in either mode — once at 1440×900 and once at 428×926 (a phone,
with touch), since below `lg` the layout is a different one rather than a
scaled-down desktop. Slide and mode are set through the same
cookies the deck uses (`current_slide`, `view_mode`), so any build honouring
that contract is testable without a deep-link route.

## Thresholds

Calibrated against the live build rather than guessed, at a per-pixel
threshold of 0.15:

| Scenario | Pixels differing |
|---|---|
| Same page captured twice | 0.000% |
| WebP re-encoded at another quality | 0.000% |
| Image from a different srcset width | 0.000% |
| A 1px outline added | 0.166% |
| Hero card nudged 4px | 1.275% |
| Headline shifted 4px | 2.832% |

Encoder and resampling differences cost nothing, so the budget does not need
to absorb them. It is set at **0.1%** — above the noise floor, below anything
a person would notice. Override per run with `VISUAL_MAX_DIFF`.

## When a test fails

Reference, candidate and diff PNGs are written to `test-results/visual/`.
Look at them before touching the threshold: a real regression is a
concentrated bright patch, while a threshold problem is diffuse speckle.
