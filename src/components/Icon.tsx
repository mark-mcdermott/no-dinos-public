// src/components/Icon.tsx
"use client";

import * as React from "react";
import * as Lucide from "lucide-react";

const ALIAS: Record<string, string> = {
  "book-audio": "audio-lines",
  "list-tree": "list",
  "folder-tree": "folder",
  sparkle: "sparkles",
  dices: "dice-6",
};

type LucideIcon = React.FC<React.SVGProps<SVGSVGElement>>;
const LUCIDE: Record<string, LucideIcon> =
  Lucide as unknown as Record<string, LucideIcon>;

const toPascal = (s: string) =>
  s
    .split(/[^a-z0-9]+/gi)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

export function Icon({
  name,
  className = "",
  ...rest
}: {
  name: string;
  className?: string;
} & React.SVGProps<SVGSVGElement>): React.ReactElement | null {
  if (!name) return null;

  const normalized = (ALIAS[name] ?? name).toLowerCase();
  const key = toPascal(normalized);

  const Comp = LUCIDE[key] ?? LUCIDE.HelpCircle;
  if (!Comp) return null;

  return <Comp className={className} aria-hidden {...rest} />;
}
