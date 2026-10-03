// src/components/DeckControls.tsx
//
// The deck's only island, and the only thing on the page that needs JS.
//
// It renders nothing. Every one of the 64 states is already in the document as
// static HTML (see src/pages/index.astro), so there is no markup left for React
// to own — what is left is the state that used to live in Deck.tsx's useState:
// which slide, which view mode, whether the dock is showing. This drives all
// three by toggling `hidden` on the prerendered sections and rewriting the one
// label that can change without the slide changing.
//
// Behaviour, mostly carried over from Deck.tsx and SidebarNav.tsx:
//   • ArrowLeft / ArrowRight move one slide, clamped at both ends, ignored while
//     typing in an input, textarea or contenteditable
//   • the double chevrons jump to the first and last slide
//   • a horizontal swipe does the same on touch screens
//   • changing slide or mode scrolls back to the top, since below lg the data
//     view stacks into a page taller than the screen
//   • the centre chip toggles view mode on a short press and resets the deck on
//     a 550ms long press, plus Enter/Space on keyup
//   • Ctrl+D (the Control key on a Mac too) or the info button shows and hides
//     the dock (client-only state — it is not persisted)
//   • `current_slide` and `view_mode` cookies are read on mount and written on
//     every change, through src/lib/cookies.ts
//
// Note that this is *not* what paints the first frame. A blocking inline script
// in index.astro has already applied the cookie state by the time this runs, so
// the correct slide is up before hydration and never flashes slide 1 first. The
// contract between the two is the data attributes below; keep them in step.

"use client"

import { useEffect } from "react"
import {
  loadCurrentSlide,
  loadViewMode,
  resetDeckState,
  saveCurrentSlide,
  toggleViewMode,
  type ViewMode,
} from "@/lib/cookies"

const LONG_PRESS_MS = 550
const SWIPE_MIN_PX = 60

export default function DeckControls({ total }: { total: number }) {
  useEffect(() => {
    const root = document.getElementById("deck")
    if (!root) return

    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-deck-state]"))
    const clamp = (n: number) => Math.min(Math.max(n, 0), Math.max(total - 1, 0))

    let index = clamp(loadCurrentSlide(0))
    let mode: ViewMode = loadViewMode("dataview")
    let dockVisible = true

    // Whatever is on screen is no longer a lazy-loading candidate, so stop
    // making the browser decide — the fetch starts the moment this runs rather
    // than whenever the intersection observer would otherwise have fired.
    const promote = (section: HTMLElement) => {
      section
        .querySelectorAll<HTMLImageElement>('img[loading="lazy"]')
        .forEach((img) => { img.loading = "eager" })
    }

    // The section at `idx` in the *current* mode, or `null` off either end of
    // the deck. Title slides are `data-mode="both"` and match regardless.
    const sectionAt = (idx: number) =>
      sections.find((s) => {
        const sectionMode = s.dataset.mode
        return Number(s.dataset.index) === idx && (sectionMode === "both" || sectionMode === mode)
      }) ?? null

    const apply = () => {
      root.dataset.dock = dockVisible ? "on" : "off"

      for (const section of sections) {
        const sectionMode = section.dataset.mode
        const active =
          Number(section.dataset.index) === index &&
          (sectionMode === "both" || sectionMode === mode)

        section.hidden = !active
        if (!active) continue

        promote(section)

        // Title slides are built once and shared by both modes, so their mode
        // label is the one piece of baked text that can be wrong.
        section
          .querySelectorAll<HTMLElement>("[data-deck-mode-label]")
          .forEach((el) => { el.textContent = mode })
      }

      // Fetch the immediate neighbours too, in the current mode: an arrow
      // press one slide over should never be the moment that slide's fetch
      // starts. Only ±1 — on a fast link one neighbour is already ahead of a
      // human pressing the key again, and it caps how much art loads for a
      // reader who never moves past the first slide.
      const prev = sectionAt(index - 1)
      const next = sectionAt(index + 1)
      if (prev) promote(prev)
      if (next) promote(next)
    }

    const show = () => {
      apply()
      window.scrollTo(0, 0)
    }

    const go = (next: number) => {
      const clamped = clamp(next)
      if (clamped === index) return
      index = clamped
      saveCurrentSlide(index)
      show()
    }

    const doToggleMode = () => {
      mode = toggleViewMode(mode)
      show()
    }

    const toggleDock = () => {
      dockVisible = !dockVisible
      apply()
    }

    const doReset = () => {
      resetDeckState()
      index = 0
      mode = "dataview"
      show()
    }

    // ---------- long-press plumbing for the centre chip ----------

    let timer: number | null = null
    let pressed = false
    const clearPress = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = null
      pressed = false
    }
    const modeChip = (target: EventTarget | null) =>
      (target as Element | null)?.closest<HTMLElement>('[data-deck-action="mode"]') ?? null

    const onPointerDown = (e: PointerEvent) => {
      const chip = modeChip(e.target)
      if (!chip) return
      chip.setPointerCapture?.(e.pointerId)
      pressed = true
      timer = window.setTimeout(() => {
        if (pressed) {
          clearPress()
          doReset()
        }
      }, LONG_PRESS_MS)
    }

    // Still pending on release means it was a short press, not a long one.
    const onPointerUp = (e: PointerEvent) => {
      if (!modeChip(e.target)) return
      const wasPending = timer !== null
      clearPress()
      if (wasPending) doToggleMode()
    }

    const onPointerCancel = () => clearPress()

    // ---------- the rest of the controls ----------

    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-deck-action]")
      if (!el) return
      const action = el.dataset.deckAction
      if (action === "first") go(0)
      else if (action === "prev") go(index - 1)
      else if (action === "next") go(index + 1)
      else if (action === "last") go(total - 1)
      else if (action === "toggle-dock") toggleDock()
      // "mode" is deliberately absent: the pointer handlers above own it, so
      // that a long press can mean reset rather than toggle.
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (!modeChip(e.target)) return
      if (e.key === "Enter" || e.key === " ") {
        doToggleMode()
        e.preventDefault()
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const tag = (t?.tagName || "").toLowerCase()
      if (tag === "input" || tag === "textarea" || t?.isContentEditable) return
      if (e.key === "ArrowLeft") { go(index - 1); e.preventDefault() }
      if (e.key === "ArrowRight") { go(index + 1); e.preventDefault() }
      // ctrlKey rather than metaKey on every platform, so ⌘D still bookmarks.
      if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "d") {
        toggleDock()
        e.preventDefault()
      }
    }

    // A swipe must be clearly sideways, so vertical scrolling never turns a page.
    let touchStart: { x: number; y: number } | null = null
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      touchStart = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null
    }
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      if (!touchStart || !t) return
      const dx = t.clientX - touchStart.x
      const dy = t.clientY - touchStart.y
      touchStart = null
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 2) return
      go(dx < 0 ? index + 1 : index - 1)
    }

    root.addEventListener("pointerdown", onPointerDown)
    root.addEventListener("pointerup", onPointerUp)
    root.addEventListener("pointercancel", onPointerCancel)
    root.addEventListener("click", onClick)
    root.addEventListener("keyup", onKeyUp)
    window.addEventListener("keydown", onKeyDown)
    root.addEventListener("touchstart", onTouchStart, { passive: true })
    root.addEventListener("touchend", onTouchEnd, { passive: true })

    // Mirrors Deck.tsx persisting `i` on mount: it normalises a cookie that
    // points past the end of the deck.
    saveCurrentSlide(index)
    apply()

    return () => {
      clearPress()
      root.removeEventListener("pointerdown", onPointerDown)
      root.removeEventListener("pointerup", onPointerUp)
      root.removeEventListener("pointercancel", onPointerCancel)
      root.removeEventListener("click", onClick)
      root.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("keydown", onKeyDown)
      root.removeEventListener("touchstart", onTouchStart)
      root.removeEventListener("touchend", onTouchEnd)
    }
  }, [total])

  return null
}
