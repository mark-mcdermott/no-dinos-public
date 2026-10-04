// Astro content collections for the deck.
//
// Two collections back the 36 slides: `animals` (28 entries) and `titles`
// (8 entries). Both live as .jsonc — with comments — under `data/`, so the
// loader parses with `jsonc-parser` rather than `JSON.parse`. Zod is the
// authoritative shape; a violation surfaces at `astro sync` / build time.
//
// `data/order.json` is the sole source of slide order (see `data/order.json`
// and CLAUDE.md's "Data model" section). Order/file cross-consistency is
// verified below at module load — so a slug in `order.json` with no matching
// file, or a data file missing from `order.json`, fails the build rather than
// vanishing silently from the deck.

import fs from "node:fs"
import path from "node:path"
import { defineCollection } from "astro:content"
import { z } from "astro/zod"
import { parse as parseJsonc, printParseErrorCode } from "jsonc-parser"
import type { Loader } from "astro/loaders"

const DATA_DIR = path.join(process.cwd(), "data")
const ANIMALS_DIR = path.join(DATA_DIR, "animals")
const TITLES_DIR = path.join(DATA_DIR, "titles")
const ORDER_JSON = path.join(DATA_DIR, "order.json")

// ---------- shared row / display schemas ----------

const metaRow = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
  icon: z.string().optional(),
})

const detailRow = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().optional(),
})

const classRow = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  icon: z.string().optional(),
})

const quickFactRow = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  icon: z.string().optional(),
})

const percent = z.number().min(0).max(100)

// The object that titles are made of and that each animal carries as a
// single-entry `fullscreenDisplay` array (the fullscreen-mode title overlay).
// `imageFocus` is the point of the picture, in percent from the top-left, that
// cropping keeps in frame; it defaults to the centre.
const displaySchema = z.object({
  title: z.string().optional(),
  titleSize: z.number().positive().optional(),
  alignY: z.enum(["top", "center", "bottom"]).optional(),
  alignX: z.enum(["left", "center", "right"]).optional(),
  stackWords: z.boolean().optional(),
  imageFocus: z.object({ x: percent, y: percent }).optional(),
})

// ---------- loader plumbing ----------

// Read a .jsonc file with comments + trailing-comma tolerance. Throws with a
// readable message on parse errors so a broken data file fails the build.
function readJsoncFile(file: string): unknown {
  const src = fs.readFileSync(file, "utf-8").replace(/^\uFEFF/u, "")
  const errors: { error: number; offset: number; length: number }[] = []
  const value = parseJsonc(src, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  })
  if (errors.length > 0) {
    const details = errors
      .map((e) => `${printParseErrorCode(e.error)} at offset ${e.offset}`)
      .join(", ")
    throw new Error(`JSONC parse error in ${file}: ${details}`)
  }
  return value
}

function listJsoncSlugs(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonc"))
    .map((f) => f.slice(0, -".jsonc".length))
    .sort()
}

// Astro 5 object loader that reads every .jsonc file in `dir` and stores each
// entry under its filename slug. `parseData` runs the collection's Zod schema
// before store.set, so schema violations surface here.
function makeJsoncLoader(name: string, dir: string): Loader {
  return {
    name,
    load: async ({ store, parseData, watcher }) => {
      store.clear()
      for (const slug of listJsoncSlugs(dir)) {
        const absPath = path.join(dir, `${slug}.jsonc`)
        const raw = readJsoncFile(absPath)
        const data = await parseData({ id: slug, data: raw as Record<string, unknown> })
        // Astro's data store requires filePath relative to the site root.
        const filePath = path.relative(process.cwd(), absPath)
        store.set({ id: slug, data, filePath })
      }
      // Hot-reload during `astro dev`: any change to a .jsonc under `dir`
      // triggers a re-run of this loader. In production builds `watcher` is
      // undefined; the guard keeps the loader usable in both modes.
      watcher?.add(path.join(dir, "*.jsonc"))
    },
  }
}

// ---------- order.json cross-check (runs at astro sync / build) ----------

const orderSchema = z.object({
  order: z.array(z.string().min(1)).min(1),
})

function verifyOrder(): void {
  const rawOrder = JSON.parse(fs.readFileSync(ORDER_JSON, "utf-8"))
  const parsed = orderSchema.safeParse(rawOrder)
  if (!parsed.success) {
    throw new Error(
      `data/order.json failed schema validation: ${parsed.error.message}`,
    )
  }
  const order = parsed.data.order

  const animals = new Set(listJsoncSlugs(ANIMALS_DIR))
  const titles = new Set(listJsoncSlugs(TITLES_DIR))

  // Every slug in order.json must resolve to exactly one animal or one title.
  const problems: string[] = []
  const seen = new Set<string>()
  for (const slug of order) {
    if (seen.has(slug)) problems.push(`duplicate slug in order.json: "${slug}"`)
    seen.add(slug)
    const inAnimals = animals.has(slug)
    const inTitles = titles.has(slug)
    if (!inAnimals && !inTitles) {
      problems.push(`order.json references "${slug}" but no data file exists`)
    } else if (inAnimals && inTitles) {
      problems.push(`"${slug}" exists as both an animal and a title`)
    }
  }

  // Every data file must appear in order.json (otherwise it silently drops out
  // of the deck — the exact bug class the rewrite plan calls out).
  for (const slug of animals) {
    if (!seen.has(slug)) problems.push(`animal "${slug}" is missing from order.json`)
  }
  for (const slug of titles) {
    if (!seen.has(slug)) problems.push(`title "${slug}" is missing from order.json`)
  }

  if (problems.length > 0) {
    throw new Error(
      `data/order.json is out of sync with data/animals + data/titles:\n  - ${problems.join(
        "\n  - ",
      )}`,
    )
  }
}

verifyOrder()

// ---------- collections ----------

const animals = defineCollection({
  loader: makeJsoncLoader("animals-jsonc", ANIMALS_DIR),
  schema: z.object({
    name: z.string().optional(),
    metadata: z.array(metaRow).nonempty(),
    quickFacts: z.array(quickFactRow).nonempty(),
    details: z.array(detailRow).nonempty(),
    classification: z.array(classRow).nonempty(),
    fullscreenDisplay: z.array(displaySchema).length(1),
    geologicPeriod: z.string().min(1),
  }),
})

const titles = defineCollection({
  loader: makeJsoncLoader("titles-jsonc", TITLES_DIR),
  schema: displaySchema.extend({
    // Every title file today has all five fields populated. Keep them required
    // so that removing one (or renaming, e.g. `alignX` → `alignx`) is a build
    // failure rather than a silently blank slide.
    title: z.string().min(1),
    titleSize: z.number().positive(),
    alignY: z.enum(["top", "center", "bottom"]),
    alignX: z.enum(["left", "center", "right"]),
    stackWords: z.boolean(),
  }),
})

export const collections = { animals, titles }
