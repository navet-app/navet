/** Match foreground colors to the surface beneath the card header. */
export function getCoverPositionTone(position: number, showPosition: boolean, unavailable = false) {
  const onAccentSurface = showPosition ? position <= 50 || position === 100 : position > 0;
  return !unavailable && onAccentSurface ? 'primary' : 'neutral';
}
