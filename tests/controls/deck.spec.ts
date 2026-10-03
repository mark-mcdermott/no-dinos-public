// tests/controls/deck.spec.ts
//
// How the deck behaves, as opposed to how it looks (that is tests/visual).
// Everything here drives the real built page: the blocking inline script in
// index.astro, the DeckControls island, and the cookies between them.

import { test, expect, type BrowserContext, type Page } from "@playwright/test"

type ViewMode = "dataview" | "fullscreen"

const ACTIVE = "[data-deck-state]:not([hidden])"

async function setDeckCookies(
  context: BrowserContext,
  baseURL: string,
  cookies: { slide?: number; mode?: ViewMode },
) {
  const rows = []
  if (cookies.slide !== undefined) {
    rows.push({ name: "current_slide", value: String(cookies.slide), url: baseURL })
  }
  if (cookies.mode) rows.push({ name: "view_mode", value: cookies.mode, url: baseURL })
  await context.addCookies(rows)
}

/** Loads the deck and waits for the island to take over from the inline script. */
async function openDeck(page: Page) {
  await page.goto("/")
  // DeckControls stamps `data-dock` on mount; the inline script never does.
  await page.locator("#deck[data-dock]").waitFor({ state: "attached" })
}

async function active(page: Page) {
  const sections = page.locator(ACTIVE)
  await expect(sections).toHaveCount(1)
  return {
    index: Number(await sections.getAttribute("data-index")),
    mode: await sections.getAttribute("data-mode"),
  }
}

async function expectSlide(page: Page, index: number, mode?: ViewMode) {
  const section = page.locator(ACTIVE)
  await expect(section).toHaveCount(1)
  await expect(section).toHaveAttribute("data-index", String(index))
  if (mode) await expect(section).toHaveAttribute("data-mode", new RegExp(`${mode}|both`))
}

async function deckTotal(page: Page) {
  return Number(await page.locator("#deck").getAttribute("data-total"))
}

async function cookie(context: BrowserContext, name: string) {
  return (await context.cookies()).find((c) => c.name === name)?.value
}

const action = (page: Page, name: string) => page.locator(`${ACTIVE} [data-deck-action="${name}"]`)

const dock = (page: Page) => page.locator(`${ACTIVE} [data-deck-dock]`)

test.describe("first paint", () => {
  test("starts on the cover in data view with no cookies", async ({ page }) => {
    await openDeck(page)
    await expectSlide(page, 0)
    expect(await active(page)).toEqual({ index: 0, mode: "both" })
  })

  test("restores the saved slide and view mode", async ({ page, context, baseURL }) => {
    await setDeckCookies(context, baseURL!, { slide: 5, mode: "fullscreen" })
    await openDeck(page)
    await expectSlide(page, 5, "fullscreen")
  })

  test("applies the saved slide before the island hydrates", async ({ page, context, baseURL }) => {
    await setDeckCookies(context, baseURL!, { slide: 3 })
    // Block the island's JS entirely: only the inline script can pick the slide.
    await page.route(/\.js$/, (route) => route.abort())
    await page.goto("/")
    await expectSlide(page, 3)
  })

  test("clamps a saved slide past the end of the deck", async ({ page, context, baseURL }) => {
    await setDeckCookies(context, baseURL!, { slide: 999 })
    await openDeck(page)
    await expectSlide(page, (await deckTotal(page)) - 1)
  })
})

test.describe("navigation", () => {
  test("arrow keys step through slides and stop at both ends", async ({ page }) => {
    await openDeck(page)
    await page.keyboard.press("ArrowLeft")
    await expectSlide(page, 0)
    await page.keyboard.press("ArrowRight")
    await expectSlide(page, 1)
    await page.keyboard.press("ArrowRight")
    await expectSlide(page, 2)
    await page.keyboard.press("ArrowLeft")
    await expectSlide(page, 1)
  })

  test("prev and next buttons step one slide", async ({ page }) => {
    await openDeck(page)
    await action(page, "next").click()
    await expectSlide(page, 1)
    await action(page, "next").click()
    await expectSlide(page, 2)
    await action(page, "prev").click()
    await expectSlide(page, 1)
  })

  test("double chevrons jump to the last and first slide", async ({ page }) => {
    await openDeck(page)
    const last = (await deckTotal(page)) - 1
    await action(page, "last").click()
    await expectSlide(page, last)
    await page.keyboard.press("ArrowRight")
    await expectSlide(page, last)
    await action(page, "first").click()
    await expectSlide(page, 0)
  })

  test("persists the slide across a reload", async ({ page, context }) => {
    await openDeck(page)
    await action(page, "next").click()
    await action(page, "next").click()
    await expectSlide(page, 2)
    expect(await cookie(context, "current_slide")).toBe("2")
    await openDeck(page)
    await expectSlide(page, 2)
  })
})

test.describe("view mode", () => {
  test("the centre chip toggles view mode and persists it", async ({ page, context, baseURL }) => {
    await setDeckCookies(context, baseURL!, { slide: 1 })
    await openDeck(page)
    await expectSlide(page, 1, "dataview")

    await action(page, "mode").click()
    await expectSlide(page, 1, "fullscreen")
    expect(await cookie(context, "view_mode")).toBe("fullscreen")

    await action(page, "mode").click()
    await expectSlide(page, 1, "dataview")
    expect(await cookie(context, "view_mode")).toBe("dataview")
  })

  test("title slides relabel the chip in fullscreen", async ({ page, context, baseURL }) => {
    await setDeckCookies(context, baseURL!, { slide: 0, mode: "fullscreen" })
    await openDeck(page)
    await expect(page.locator(`${ACTIVE} [data-deck-mode-label]`).first()).toHaveText("fullscreen")
  })

  test("a long press on the chip resets to the cover in data view", async ({ page, context, baseURL }) => {
    await setDeckCookies(context, baseURL!, { slide: 7, mode: "fullscreen" })
    await openDeck(page)
    const box = await action(page, "mode").boundingBox()
    if (!box) throw new Error("mode chip is not laid out")

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(800)
    await page.mouse.up()

    await expectSlide(page, 0, "dataview")
    expect(await cookie(context, "current_slide")).toBe("0")
    expect(await cookie(context, "view_mode")).toBe("dataview")
  })
})

test.describe("dock", () => {
  test("Ctrl+D shows and hides the dock", async ({ page }) => {
    await openDeck(page)
    await expect(dock(page)).toBeVisible()
    await page.keyboard.press("Control+d")
    await expect(dock(page)).toBeHidden()
    await page.keyboard.press("Control+d")
    await expect(dock(page)).toBeVisible()
  })

  test("the info button toggles the dock and stays visible itself", async ({ page }) => {
    await openDeck(page)
    await action(page, "toggle-dock").click()
    await expect(dock(page)).toBeHidden()
    await expect(action(page, "toggle-dock")).toBeVisible()
    await action(page, "toggle-dock").click()
    await expect(dock(page)).toBeVisible()
  })

  test("the dock stays hidden while navigating", async ({ page }) => {
    await openDeck(page)
    await page.keyboard.press("Control+d")
    await page.keyboard.press("ArrowRight")
    await expectSlide(page, 1)
    await expect(dock(page)).toBeHidden()
  })

  test("the tooltip mentions arrow keys on the cover only", async ({ page }) => {
    await openDeck(page)
    const tooltip = page.locator(`${ACTIVE} [role="tooltip"]`)
    await expect(tooltip).toContainText("arrow keys")
    await expect(tooltip).toContainText("Ctrl + D")
    await page.keyboard.press("ArrowRight")
    await expect(tooltip).not.toContainText("arrow keys")
    await expect(tooltip).toContainText("Ctrl + D")
  })
})

test.describe("touch", () => {
  test.use({ viewport: { width: 428, height: 926 }, isMobile: true, hasTouch: true })

  async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
    await page.evaluate(
      ([start, end]) => {
        const root = document.getElementById("deck")!
        const touch = (p: { x: number; y: number }) =>
          new Touch({ identifier: 1, target: root, clientX: p.x, clientY: p.y })
        root.dispatchEvent(
          new TouchEvent("touchstart", { touches: [touch(start)], changedTouches: [touch(start)], bubbles: true }),
        )
        root.dispatchEvent(
          new TouchEvent("touchend", { touches: [], changedTouches: [touch(end)], bubbles: true }),
        )
      },
      [from, to],
    )
  }

  test("a sideways swipe changes slide", async ({ page }) => {
    await openDeck(page)
    await swipe(page, { x: 350, y: 400 }, { x: 100, y: 400 })
    await expectSlide(page, 1)
    await swipe(page, { x: 100, y: 400 }, { x: 350, y: 400 })
    await expectSlide(page, 0)
  })

  test("a mostly vertical drag does not change slide", async ({ page }) => {
    await openDeck(page)
    await swipe(page, { x: 200, y: 100 }, { x: 270, y: 600 })
    await expectSlide(page, 0)
  })

  test("changing slide scrolls a stacked data view back to the top", async ({ page, context, baseURL }) => {
    await setDeckCookies(context, baseURL!, { slide: 1, mode: "dataview" })
    await openDeck(page)
    await page.evaluate(() => window.scrollTo(0, 800))
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    await action(page, "next").click()
    await expectSlide(page, 2)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  })

  test("the data view stacks instead of squeezing in a sidebar", async ({ page, context, baseURL }) => {
    await setDeckCookies(context, baseURL!, { slide: 1, mode: "dataview" })
    await openDeck(page)
    const aside = page.locator(`${ACTIVE} aside`)
    const width = await aside.evaluate((el) => el.getBoundingClientRect().width)
    expect(width).toBe(428)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(428)
  })
})
