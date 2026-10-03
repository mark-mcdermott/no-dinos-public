// Delete build-emitted image originals that nothing in the output references.
//
// astro's image pipeline emits both the original source image and the WebP
// derivatives it generates from it, then deletes the original once it is sure
// the pipeline was its only consumer. That last step does not happen when the
// page rendering the images also pulls in `astro:content`, which phase 4's deck
// does — so all 60 source PNGs (160 MB) survive into dist/_astro/ with nothing
// linking to them. See "Phase 3" in docs/astro-rewrite-plan.md.
//
// This runs after `astro build` and removes exactly the assets whose filename
// appears nowhere in the emitted HTML/CSS/JS. It is deliberately dumb: it
// deletes on absence of evidence rather than trying to model astro's internals,
// so a file stays if there is any textual reference to it at all.
//
// Scope is limited to the build assets folder (dist/_astro by default), which
// only ever holds hashed, build-generated files. Anything copied verbatim from
// public/ is out of scope — and this repo has no public/ images anyway, which
// CLAUDE.md forbids for unrelated reasons.

import fs from "node:fs"
import path from "node:path"

const DIST = path.resolve("dist")
const ASSETS = path.join(DIST, "_astro")

// Raster sources astro accepts as `<Image>` input. Derivatives are .webp here
// and are referenced from the HTML, so they never match the unreferenced test —
// but including webp keeps the rule honest rather than assuming.
const PRUNABLE = new Set([".png", ".jpg", ".jpeg", ".gif", ".tiff", ".avif", ".webp"])
// Everything the build can emit a reference from.
const TEXT = new Set([".html", ".css", ".js", ".mjs", ".json", ".xml", ".txt", ".svg", ".map"])

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    return e.isDirectory() ? walk(full) : [full]
  })
}

if (!fs.existsSync(ASSETS)) {
  console.log("prune-unused-images: no dist/_astro, nothing to do")
  process.exit(0)
}

const all = walk(DIST)
const candidates = walk(ASSETS).filter((f) => PRUNABLE.has(path.extname(f).toLowerCase()))

// One haystack of every text file in the output. Reading them once and doing
// substring checks beats re-scanning per candidate; the whole output is a few
// MB of text at most.
const haystack = all
  .filter((f) => TEXT.has(path.extname(f).toLowerCase()))
  .map((f) => fs.readFileSync(f, "utf-8"))
  .join("\n")

let removed = 0
let freed = 0
for (const file of candidates) {
  const name = path.basename(file)
  if (haystack.includes(name)) continue
  freed += fs.statSync(file).size
  fs.unlinkSync(file)
  removed++
}

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`
if (removed === 0) {
  console.log(`prune-unused-images: nothing unreferenced (${candidates.length} assets checked)`)
} else {
  console.log(
    `prune-unused-images: removed ${removed} unreferenced of ${candidates.length} image assets, freed ${mb(freed)}`,
  )
}
