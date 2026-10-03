// ------------------------------
// file: lib/types.ts
// ------------------------------
export type MetaRow = { key: string; value: string; icon?: string };
export type DetailRow = { name: string; description: string; icon?: string };
export type ClassRow = { label: string; value: string; icon?: string };

// NEW: 3-chip “Quick Facts” row under the sidebar metadata
export type QuickFactRow = { label: string; value: string; icon?: string };

/**
 * A slide image after `getImage()` has run: the fallback `src` plus the
 * width-descriptor candidates the browser picks from. Produced in
 * `src/pages/index.astro` and consumed by `LoaderImage.astro`.
 */
export type SlideImageSource = {
  src: string
  srcSet?: string
}

export type TitleData = {
  title?: string | undefined
  titleSize?: number | undefined
  alignY?: "top" | "center" | "bottom" | undefined
  alignX?: "left" | "center" | "right" | undefined
  stackWords?: boolean | undefined
  imageFocus?: { x: number; y: number } | undefined
}

export type AnimalData = {
  name?: string
  metadata?: { key: string; value: string; icon?: string }[]
  details?: { name: string; description: string; icon?: string }[]
  classification?: { label: string; value: string; icon?: string }[]
  geologicPeriod?: string
  quickFacts?: { label: string; value: string; icon?: string }[]
  fullscreenDisplay?: TitleData[]
}
