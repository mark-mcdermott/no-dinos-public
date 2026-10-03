// ------------------------------
// file: lib/period.ts (optional mapping → marker position)
// ------------------------------
const PERIOD_POS: Record<string, number> = {
// rough illustrative placement along the Cambrian→Quaternary bar (0..100)
Cambrian: 2,
Ordovician: 6,
Silurian: 9,
Devonian: 14,
Carboniferous: 18,
Permian: 22,
Triassic: 30,
Jurassic: 38,
Cretaceous: 46,
Paleogene: 62,
Neogene: 72,
Quaternary: 90,
};
export function periodToPct(name?: string) {
if (!name) return 65;
return PERIOD_POS[name] ?? 65;
}