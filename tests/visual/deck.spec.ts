// tests/visual/deck.spec.ts
import fs from "node:fs"
import path from "node:path"
import { test, expect } from "@playwright/test"
import { PNG } from "pngjs"
import pixelmatch from "pixelmatch"
import { slideStates } from "./states"
import { capture } from "./capture"

/**
 * Compares every slide of a candidate build against a reference build by
 * screenshotting both with the same browser in the same run.
 *
 * Both captures share one rendering environment, so fonts and antialiasing
 * cannot drift between them — unlike committed baseline images, which only
 * hold on the machine that produced them. That makes this suite valid across
 * a framework port, where the DOM changes completely but the pixels must not.
 */

/**
 * Production, which is `main` once Vercel has deployed it — so a branch is
 * compared against what is live. (Until the Astro port shipped this was pinned
 * to the last Next build, which made every change since read as a failure.)
 */
const REFERENCE_URL = process.env.VISUAL_REFERENCE_URL ?? "https://www.no-dinos.com"

/** The local build `playwright.config.ts` serves. */
const CANDIDATE_URL = process.env.VISUAL_CANDIDATE_URL ?? `http://localhost:${process.env.PREVIEW_PORT ?? 4321}`

/**
 * Calibrated on this deck rather than guessed. At a per-pixel threshold of
 * 0.15, measured against the live build:
 *
 *   same page twice ................................ 0.000%
 *   WebP re-encoded at a different quality .......... 0.000%
 *   image sourced from a different srcset width ..... 0.000%
 *   a 1px outline added ............................. 0.166%
 *   hero card nudged 4px ............................ 1.275%
 *   headline shifted 4px ............................ 2.832%
 *
 * So encoder and resampling differences between Next and Astro cost nothing,
 * and the smallest genuine layout change costs 0.166%. A 0.1% budget sits
 * above the noise floor and below anything a person would notice.
 */
const MAX_DIFF_RATIO = Number(process.env.VISUAL_MAX_DIFF ?? 0.001)
const PIXEL_THRESHOLD = Number(process.env.VISUAL_PIXEL_THRESHOLD ?? 0.15)

const ARTIFACTS = path.join(process.cwd(), "test-results", "visual")

const states = process.env.VISUAL_SLIDES === "sample"
  ? slideStates().filter((_, i) => i % 8 === 0)
  : slideStates()

function writeArtifact(name: string, data: Buffer) {
  fs.mkdirSync(ARTIFACTS, { recursive: true })
  fs.writeFileSync(path.join(ARTIFACTS, name), data)
}

test.describe("deck visual parity", () => {
  test.describe.configure({ mode: "parallel" })

  for (const state of states) {
    test(state.id, async ({ browser }) => {
      test.slow()

      const [referencePng, candidatePng] = await Promise.all([
        capture(browser, REFERENCE_URL, state),
        capture(browser, CANDIDATE_URL, state),
      ])

      const reference = PNG.sync.read(referencePng)
      const candidate = PNG.sync.read(candidatePng)

      if (reference.width !== candidate.width || reference.height !== candidate.height) {
        writeArtifact(`${state.id}-reference.png`, referencePng)
        writeArtifact(`${state.id}-candidate.png`, candidatePng)
        expect(
          `${candidate.width}x${candidate.height}`,
          `Page dimensions changed, so the layout moved. Compare the two ` +
            `images in test-results/visual/.`,
        ).toBe(`${reference.width}x${reference.height}`)
        return
      }

      const diff = new PNG({ width: reference.width, height: reference.height })
      const changed = pixelmatch(
        reference.data,
        candidate.data,
        diff.data,
        reference.width,
        reference.height,
        { threshold: PIXEL_THRESHOLD },
      )

      const ratio = changed / (reference.width * reference.height)

      if (ratio > MAX_DIFF_RATIO) {
        writeArtifact(`${state.id}-reference.png`, referencePng)
        writeArtifact(`${state.id}-candidate.png`, candidatePng)
        writeArtifact(`${state.id}-diff.png`, PNG.sync.write(diff))
      }

      expect(
        ratio,
        `${(ratio * 100).toFixed(2)}% of pixels differ (budget ` +
          `${(MAX_DIFF_RATIO * 100).toFixed(2)}%). Artifacts in test-results/visual/.`,
      ).toBeLessThanOrEqual(MAX_DIFF_RATIO)
    })
  }
})
