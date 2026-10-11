import type { CSSProperties } from 'react';
import { withTintAlpha } from './custom-card-tint-surface';

/** Selection and hover inherit the owning surface's accent without replacing its background. */
export function getSelectableControlTintStyle(color: string): CSSProperties {
  return {
    '--selectable-control-accent': color,
    '--selectable-control-border': withTintAlpha(color, 0.5),
    '--selectable-control-hover': withTintAlpha(color, 0.12),
  } as CSSProperties;
}
