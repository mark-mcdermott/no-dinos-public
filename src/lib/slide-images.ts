// Build-time resolution of slide artwork.
//
// Phase 3 of docs/astro-rewrite-plan.md. The source PNGs moved from
// `data/images/` to `src/assets/images/` so they sit inside Vite's module
// graph: importing one yields an `ImageMetadata` record that `astro:assets`
// turns into a hashed, build-time WebP derivative. Nothing here is served by
// a function or an API route — the Next-era `/images/[...slug]` handler is
// gone and does not come back.
//
// The globs are lazy, so a page pulls in only the art it renders and the
// consistency check below can work off the keys alone. Vite requires the glob
// pattern to be a literal, hence three separate calls rather than one
// parameterised helper.
//
// Heads-up for phase 4: astro emits each source PNG alongside the WebP
// derivatives it generates, then deletes the original once it is satisfied the
// image pipeline was its only consumer. That cleanup does not happen when the
// rendering page also imports `astro:content` — which the deck will, for
// animal data — leaving all 60 originals (160 MB) in dist/_astro/ with no HTML
// pointing at them. Measured on astro 5.18.2; it is not caused by this glob
// (static imports of the same files behave identically), and it is not `fs`
// either. scripts/prune-unused-images.mjs removes them after the build.
// docs/astro-rewrite-plan.md has the full measurement table.
//
// Layout (see CLAUDE.md "Data model"):
//   dataview/<slug>.png    — animals, sidebar/data view crop
//   fullscreen/<slug>.png  — animals, full-bleed crop of the same art
//   titles/<slug>.png      — the 8 section title slides
// dataview and fullscreen are different crops of the same animal and must
// stay in sync as a pair.

import fs from "node:fs"
import path from "node:path"
import type { ImageMetadata } from "astro"

type ImageModule = { default: ImageMetadata }
type ImageLoader = () => Promise<ImageModule>

const dataviewGlob = import.meta.glob<ImageModule>("../assets/images/dataview/*.png")
const fullscreenGlob = import.meta.glob<ImageModule>("../assets/images/fullscreen/*.png")
const titlesGlob = import.meta.glob<ImageModule>("../assets/images/titles/*.png")

/** `../assets/images/dataview/arctodus.png` → `arctodus`. */
function slugOf(file: string): string {
  return path.basename(file, ".png")
}

function bySlug(glob: Record<string, ImageLoader>): Map<string, ImageLoader> {
  return new Map(
    Object.entries(glob).map(([file, load]) => [slugOf(file), load]),
  )
}

const dataviewImages = bySlug(dataviewGlob)
const fullscreenImages = bySlug(fullscreenGlob)
const titleImages = bySlug(titlesGlob)

// ---------- build-time consistency checks ----------

const ORDER_JSON = path.join(process.cwd(), "data", "order.json")

function readOrder(): string[] {
  const raw = JSON.parse(fs.readFileSync(ORDER_JSON, "utf-8")) as { order: string[] }
  return raw.order
}

// Two invariants, both build failures rather than a blank slide at runtime:
//
//  1. Every slug in order.json resolves to art — a title image, or an animal's
//     dataview + fullscreen pair. This is the images-side counterpart of the
//     order.json cross-check in src/content.config.ts.
//  2. dataview and fullscreen stay paired. Half-deleting a pair is the failure
//     CLAUDE.md warns about, and it would otherwise only show up as a missing
//     image in one view mode.
//
// The converse is deliberately allowed: artwork that no slide references is
// not an error. `quagga` has a complete dataview/fullscreen pair but no
// data/animals/quagga.jsonc and no order.json entry, so it renders nowhere —
// whether it is unfinished art or a dropped 29th animal is a content call, not
// one to make by failing the build. Never being rendered, it is also never
// transformed, so its originals reach dist/ unreferenced and the prune step
// clears them along with the rest.
function verifySlideImages(): void {
  const problems: string[] = []

  for (const slug of readOrder()) {
    if (titleImages.has(slug)) continue
    const hasDataview = dataviewImages.has(slug)
    const hasFullscreen = fullscreenImages.has(slug)
    if (!hasDataview && !hasFullscreen) {
      problems.push(`order.json slug "${slug}" has no artwork in src/assets/images`)
    } else if (!hasDataview) {
      problems.push(`"${slug}" is missing src/assets/images/dataview/${slug}.png`)
    } else if (!hasFullscreen) {
      problems.push(`"${slug}" is missing src/assets/images/fullscreen/${slug}.png`)
    }
  }

  for (const slug of dataviewImages.keys()) {
    if (!fullscreenImages.has(slug)) {
      problems.push(`"${slug}" has a dataview crop but no fullscreen crop`)
    }
  }
  for (const slug of fullscreenImages.keys()) {
    if (!dataviewImages.has(slug)) {
      problems.push(`"${slug}" has a fullscreen crop but no dataview crop`)
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `src/assets/images is out of sync with data/order.json:\n  - ${problems.join("\n  - ")}`,
    )
  }
}

verifySlideImages()

// ---------- lookups ----------

async function load(
  map: Map<string, ImageLoader>,
  slug: string,
  folder: string,
): Promise<ImageMetadata> {
  const loader = map.get(slug)
  if (!loader) {
    throw new Error(`no image for "${slug}" in src/assets/images/${folder}`)
  }
  return (await loader()).default
}

/** The data-view crop for an animal slide. */
export function dataviewImage(slug: string): Promise<ImageMetadata> {
  return load(dataviewImages, slug, "dataview")
}

/** The full-bleed crop for an animal slide. */
export function fullscreenImage(slug: string): Promise<ImageMetadata> {
  return load(fullscreenImages, slug, "fullscreen")
}

/** The single image behind a section title slide. */
export function titleImage(slug: string): Promise<ImageMetadata> {
  return load(titleImages, slug, "titles")
}

/**
 * Both crops for an animal slide. They are a pair by construction — the check
 * above refuses to build if one is missing — so phase 4 can put both view
 * modes in the DOM without a per-slide existence test.
 */
export async function animalImages(slug: string): Promise<{
  dataview: ImageMetadata
  fullscreen: ImageMetadata
}> {
  const [dataview, fullscreen] = await Promise.all([
    dataviewImage(slug),
    fullscreenImage(slug),
  ])
  return { dataview, fullscreen }
}
