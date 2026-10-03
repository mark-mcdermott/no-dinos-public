// Build-time helper that turns the `animals` + `titles` collections into the
// ordered slide list the deck renders. `data/order.json` is the sole source of
// slide order — see CLAUDE.md's "Data model" section — and cross-consistency
// between order.json and the collection files is enforced in
// `src/content.config.ts` at astro sync time, so by the point this runs every
// slug is guaranteed to resolve.

import fs from "node:fs"
import path from "node:path"
import { getCollection, type CollectionEntry } from "astro:content"

export type OrderedSlide =
  | { slug: string; kind: "animal"; entry: CollectionEntry<"animals"> }
  | { slug: string; kind: "title"; entry: CollectionEntry<"titles"> }

const ORDER_JSON = path.join(process.cwd(), "data", "order.json")

function readOrder(): string[] {
  const raw = JSON.parse(fs.readFileSync(ORDER_JSON, "utf-8")) as { order: string[] }
  return raw.order
}

/**
 * Returns every slide in deck order. Only slugs present in `data/order.json`
 * are surfaced; animals or titles that lack an entry in `order.json` are
 * already rejected by the sync-time cross-check in `src/content.config.ts`.
 */
export async function getOrderedSlides(): Promise<OrderedSlide[]> {
  const [animals, titles] = await Promise.all([
    getCollection("animals"),
    getCollection("titles"),
  ])
  const animalsBySlug = new Map(animals.map((e) => [e.id, e]))
  const titlesBySlug = new Map(titles.map((e) => [e.id, e]))

  const order = readOrder()
  const slides: OrderedSlide[] = []
  for (const slug of order) {
    const animal = animalsBySlug.get(slug)
    if (animal) {
      slides.push({ slug, kind: "animal", entry: animal })
      continue
    }
    const title = titlesBySlug.get(slug)
    if (title) {
      slides.push({ slug, kind: "title", entry: title })
      continue
    }
    // Unreachable in a healthy tree: content.config.ts asserted this above.
    throw new Error(`order.json slug "${slug}" resolved to neither an animal nor a title`)
  }
  return slides
}
