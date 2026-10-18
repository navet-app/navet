import { useMediaQuery } from '@navet/app/hooks';
import * as RadixSlider from '@radix-ui/react-slider';
import type { CSSProperties } from 'react';

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel: string;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  disabled?: boolean;
  dataCardInteractive?: boolean;
  rootClassName?: string;
  trackClassName?: string;
  rangeClassName?: string;
  thumbClassName?: string;
  touchThumbClassName?: string;
  trackStyle?: CSSProperties;
  rangeStyle?: CSSProperties;
  thumbStyle?: CSSProperties;
}

/** Radix positions thumbs with `left`/`bottom` + `translate(-50%,…)`; use a full-width runner + `translate3d` for custom slider UIs (see interaction-preview-card). */
export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  ariaLabel,
  onValueChange,
  onValueCommit,
  onInteractionStart,
  onInteractionEnd,
  disabled = false,
  dataCardInteractive = false,
  rootClassName = 'relative flex w-full items-center touch-none select-none',
  trackClassName = 'relative grow rounded-full',
  rangeClassName = 'absolute h-full rounded-full',
  thumbClassName = 'block rounded-full outline-none',
  touchThumbClassName,
  trackStyle,
  rangeStyle,
  thumbStyle,
}: SliderProps) {
  const isTouchDevice = useMediaQuery('(any-pointer: coarse)');
  const resolvedThumbClassName =
    isTouchDevice && touchThumbClassName ? touchThumbClassName : thumbClassName;

  return (
    <RadixSlider.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      data-card-interactive={dataCardInteractive || undefined}
      onValueChange={(values) => {
        const nextValue = values[0];
        if (typeof nextValue === 'number') {
          onValueChange(nextValue);
        }
      }}
      onValueCommit={(values) => {
        const nextValue = values[0];
        if (typeof nextValue === 'number') {
          onValueCommit?.(nextValue);
        }
        onInteractionEnd?.();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onInteractionStart?.();
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={() => onInteractionStart?.()}
      onKeyUp={() => onInteractionEnd?.()}
      onBlur={() => onInteractionEnd?.()}
      className={rootClassName}
    >
      <RadixSlider.Track className={trackClassName} style={trackStyle}>
        <RadixSlider.Range className={rangeClassName} style={rangeStyle} />
      </RadixSlider.Track>
      <RadixSlider.Thumb
        className={resolvedThumbClassName}
        style={thumbStyle}
        aria-label={ariaLabel}
      />
    </RadixSlider.Root>
  );
}
