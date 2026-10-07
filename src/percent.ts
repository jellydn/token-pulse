/**
 * Clamp a percentage into [floor, 100].
 * - display text: floor 0 (0% is meaningful)
 * - UI bars: floor 1 (keeps a visible bar)
 */
export function clampPercent(value: number | null, floor = 0): number {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(floor, Math.round(value)));
}
