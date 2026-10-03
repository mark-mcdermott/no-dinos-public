// tests/visual/capture.ts
import type { Browser, BrowserContextOptions } from "@playwright/test"
import type { Device, SlideState } from "./states"

/** A laptop, and the iPhone 13 Pro Max the mobile layout was tuned on. */
const DEVICES: Record<Device, BrowserContextOptions> = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 428, height: 926 }, isMobile: true, hasTouch: true },
}

/** Kill motion so a screenshot can never catch a transition mid-flight. */
const FREEZE_CSS = `
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    caret-color: transparent !important;
  }
`

/**
 * Renders one slide state and returns a full-page PNG.
 *
 * Slide index and view mode are set through the same cookies the deck itself
 * uses, so this works against any build that keeps that contract.
 */
export async function capture(
  browser: Browser,
  baseURL: string,
  state: SlideState,
): Promise<Buffer> {
  const context = await browser.newContext({
    ...DEVICES[state.device],
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  })

  try {
    await context.addCookies([
      { name: "current_slide", value: String(state.index), url: baseURL },
      { name: "view_mode", value: state.mode, url: baseURL },
    ])

    const page = await context.newPage()
    await page.goto(baseURL, { waitUntil: "load", timeout: 60_000 })
    await page.addStyleTag({ content: FREEZE_CSS })

    // Every image that actually occupies space must be decoded. Off-screen
    // slides in a prerendered deck have zero-size boxes and are skipped, so
    // this does not wait on lazily-loaded slides the viewer cannot see.
    await page.waitForFunction(
      () => {
        const laidOut = Array.from(document.querySelectorAll("img")).filter((img) => {
          const r = img.getBoundingClientRect()
          return r.width > 1 && r.height > 1
        })
        return laidOut.length > 0 && laidOut.every((img) => img.complete && img.naturalWidth > 0)
      },
      undefined,
      { timeout: 60_000 },
    )

    await page.evaluate(() => document.fonts.ready)
    return await page.screenshot({ fullPage: true, animations: "disabled" })
  } finally {
    await context.close()
  }
}
