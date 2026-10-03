// tests/visual/states.ts
import fs from "node:fs"
import path from "node:path"

export type ViewMode = "dataview" | "fullscreen"
export type Device = "desktop" | "phone"
export type SlideState = {
  index: number
  slug: string
  mode: ViewMode
  device: Device
  /** Stable name used for artifact filenames. */
  id: string
}

const ROOT = process.cwd()
const ORDER = path.join(ROOT, "data", "order.json")
const ANIMALS = path.join(ROOT, "data", "animals")

function isAnimal(slug: string): boolean {
  return (
    fs.existsSync(path.join(ANIMALS, `${slug}.jsonc`)) ||
    fs.existsSync(path.join(ANIMALS, `${slug}.json`))
  )
}

const DEVICES: Device[] = ["desktop", "phone"]

/**
 * Every distinct thing the deck can render, on each device.
 *
 * Animals render differently per view mode, so they contribute two states.
 * Title slides render the same layout in both modes, so they contribute one.
 * The phone gets its own set because below `lg` the layout is a different one
 * (stacked data view, fitted titles, full-width dock), not a scaled desktop.
 */
export function slideStates(): SlideState[] {
  const order = JSON.parse(fs.readFileSync(ORDER, "utf-8")).order as string[]
  const states: SlideState[] = []

  for (const device of DEVICES) {
    const suffix = device === "desktop" ? "" : `-${device}`
    order.forEach((slug, index) => {
      const pad = String(index).padStart(2, "0")
      if (isAnimal(slug)) {
        for (const mode of ["dataview", "fullscreen"] as const) {
          states.push({ index, slug, mode, device, id: `${pad}-${slug}-${mode}${suffix}` })
        }
      } else {
        states.push({ index, slug, mode: "dataview", device, id: `${pad}-${slug}${suffix}` })
      }
    })
  }

  return states
}
