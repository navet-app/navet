export function formatFanStepPercentage(index: number, step: number, whole = false) {
  const value = index >= Math.round(100 / step) ? 100 : index * step;
  // Home Assistant's fan speed helpers report integer percentages.
  return whole ? Math.floor(value + 1e-9) : Number(value.toFixed(3));
}
