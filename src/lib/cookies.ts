// src/lib/cookies.ts
const DAYS = 365;
const maxAge = 60 * 60 * 24 * DAYS;

const get = (name: string) =>
  typeof document === "undefined"
    ? ""
    : document.cookie
        .split("; ")
        .find((row) => row.startsWith(name + "="))
        ?.split("=")[1] ?? "";

const set = (name: string, value: string) => {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
};

export type ViewMode = "dataview" | "fullscreen";

export function loadViewMode(fallback: ViewMode = "dataview"): ViewMode {
  const v = get("view_mode");
  return (v === "fullscreen" || v === "dataview") ? (v as ViewMode) : fallback;
}

export function toggleViewMode(curr: ViewMode): ViewMode {
  const next = curr === "fullscreen" ? "dataview" : "fullscreen";
  set("view_mode", next);
  return next;
}

export function saveCurrentSlide(i: number) {
  set("current_slide", String(Math.max(0, i | 0)));
}

export function loadCurrentSlide(fallback = 0) {
  const raw = get("current_slide");
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function resetDeckState() {
  set("current_slide", "0");
  set("view_mode", "dataview");
}
