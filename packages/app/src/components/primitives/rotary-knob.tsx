import { cn } from '@navet/app/components/ui/utils';
import type { ThemeType } from '@navet/app/hooks';
import { useTheme } from '@navet/app/hooks';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

// ─── Theme-dependent visual constants ────────────────────────────────────────

interface RotaryKnobVisualConstants {
  knobCenterGradient: { light: string; dark: string };
  knobInnerGradient: { light: string; dark: string };
  knobBandTrackStroke: { light: string; dark: string };
  knobInnerBorder: string;
  tickMajorStroke: { light: string; dark: string };
  tickMinorStroke: { light: string; dark: string };
}

const ROTARY_KNOB_VISUALS: RotaryKnobVisualConstants = {
  knobCenterGradient: {
    light:
      'radial-gradient(circle at 50% 46%, rgba(255,255,255,0.94), rgba(226,232,240,0.86) 42%, rgba(203,213,225,0.52) 66%, rgba(148,163,184,0.18) 100%)',
    dark: 'radial-gradient(circle at 50% 46%, rgba(255,255,255,0.18), rgba(255,255,255,0.10) 36%, rgba(255,255,255,0.05) 62%, rgba(255,255,255,0.02) 100%)',
  },
  knobInnerGradient: {
    light:
      'radial-gradient(circle at 42% 36%, rgba(255,255,255,0.88), rgba(248,250,252,0.68) 48%, rgba(226,232,240,0.34) 100%)',
    dark: 'radial-gradient(circle at 38% 34%, rgba(255,255,255,0.12), rgba(255,255,255,0.06) 52%, rgba(255,255,255,0.02) 100%)',
  },
  knobBandTrackStroke: {
    light: 'rgba(15,23,42,0.08)',
    dark: 'rgba(255,255,255,0.06)',
  },
  knobInnerBorder: 'border-white/10',
  tickMajorStroke: {
    light: 'rgba(255,255,255,0.34)',
    dark: 'rgba(255,255,255,0.34)',
  },
  tickMinorStroke: {
    light: 'rgba(255,255,255,0.22)',
    dark: 'rgba(255,255,255,0.14)',
  },
} as const;

function getRotaryKnobVisuals(theme: ThemeType) {
  const isLight = theme === 'light';
  return {
    knobCenterGradient: isLight
      ? ROTARY_KNOB_VISUALS.knobCenterGradient.light
      : ROTARY_KNOB_VISUALS.knobCenterGradient.dark,
    knobInnerGradient: isLight
      ? ROTARY_KNOB_VISUALS.knobInnerGradient.light
      : ROTARY_KNOB_VISUALS.knobInnerGradient.dark,
    knobBandTrackStroke: isLight
      ? ROTARY_KNOB_VISUALS.knobBandTrackStroke.light
      : ROTARY_KNOB_VISUALS.knobBandTrackStroke.dark,
    knobInnerBorder: ROTARY_KNOB_VISUALS.knobInnerBorder,
    tickMajorStroke: isLight
      ? ROTARY_KNOB_VISUALS.tickMajorStroke.light
      : ROTARY_KNOB_VISUALS.tickMajorStroke.dark,
    tickMinorStroke: isLight
      ? ROTARY_KNOB_VISUALS.tickMinorStroke.light
      : ROTARY_KNOB_VISUALS.tickMinorStroke.dark,
  };
}

export interface RotaryKnobProps {
  id: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  isOn?: boolean;
  ariaLabel?: string;
  ariaValueText?: string;
  className?: string;
  glowClassName?: string;
  bandStrokeWidth?: number;
  tickOffsetRem?: number;
  bandPrimaryColor: string;
  bandSecondaryColor: string;
  bandGlowColor: string;
  faceTreatment?: 'default' | 'soft';
  faceTintColor?: string;
  onValueChange?: (value: number) => void;
  onValueCommit?: (value: number) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

function normalizeAngleDelta(delta: number) {
  if (delta > 180) {
    return delta - 360;
  }

  if (delta < -180) {
    return delta + 360;
  }

  return delta;
}

function getPointerAngle(element: HTMLDivElement | null, clientX: number, clientY: number) {
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  return normalizeAngle((Math.atan2(clientY - centerY, clientX - centerX) * 180) / Math.PI + 180);
}

function snapToStep(value: number, min: number, max: number, step: number) {
  const snappedValue = Math.round((value - min) / step) * step + min;
  return Number(clamp(snappedValue, min, max).toFixed(3));
}

export const RotaryKnob = memo(function RotaryKnob({
  id,
  value,
  min = 0,
  max = 100,
  step = 1,
  isOn = true,
  ariaLabel,
  ariaValueText,
  className,
  glowClassName,
  bandStrokeWidth = 22,
  tickOffsetRem = 9.25,
  bandPrimaryColor,
  bandSecondaryColor,
  bandGlowColor,
  faceTreatment = 'default',
  faceTintColor,
  onValueChange,
  onValueCommit,
}: RotaryKnobProps) {
  const { theme } = useTheme();
  const knobRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const dragStartValueRef = useRef<number>(value);
  const dragLastAngleRef = useRef<number | null>(null);
  const dragAccumulatedAngleRef = useRef<number>(0);
  const lastIssuedValueRef = useRef<number>(snapToStep(value, min, max, step || 1));
  const [isDragging, setIsDragging] = useState(false);
  const safeStep = step || 1;
  const knobTurns = (value - min) / safeStep;
  const tickRotation = normalizeAngle(knobTurns * 14);
  const isSoftFace = faceTreatment === 'soft';
  const interactionDiameterRem = tickOffsetRem * 2 + 2;

  const resetDragState = useCallback(() => {
    activePointerIdRef.current = null;
    dragLastAngleRef.current = null;
    dragAccumulatedAngleRef.current = 0;
    setIsDragging(false);
  }, []);

  const commitValueChange = useCallback(
    (nextValue: number) => {
      const snappedValue = snapToStep(nextValue, min, max, safeStep);
      lastIssuedValueRef.current = snappedValue;

      if (!onValueChange) {
        return;
      }

      onValueChange(snappedValue);
    },
    [max, min, onValueChange, safeStep]
  );

  useEffect(() => {
    if (isDragging) {
      return;
    }

    lastIssuedValueRef.current = snapToStep(value, min, max, safeStep);
  }, [isDragging, max, min, safeStep, value]);

  useEffect(() => {
    if (!isDragging || !onValueChange) {
      return;
    }

    const updateFromPointer = (clientX: number, clientY: number) => {
      const angle = getPointerAngle(knobRef.current, clientX, clientY);
      if (angle === null) {
        return;
      }

      if (dragLastAngleRef.current === null) {
        dragLastAngleRef.current = angle;
        return;
      }

      const angleDelta = normalizeAngleDelta(angle - dragLastAngleRef.current);
      dragAccumulatedAngleRef.current += angleDelta;
      dragLastAngleRef.current = angle;

      const nextValue =
        dragStartValueRef.current + (dragAccumulatedAngleRef.current / 18) * safeStep;
      commitValueChange(nextValue);
    };

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }

      updateFromPointer(event.clientX, event.clientY);
    };

    const handleWindowPointerEnd = (event: PointerEvent) => {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }

      resetDragState();
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerEnd);
    window.addEventListener('pointercancel', handleWindowPointerEnd);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerEnd);
      window.removeEventListener('pointercancel', handleWindowPointerEnd);
    };
  }, [commitValueChange, isDragging, onValueChange, resetDragState, safeStep]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isOn || !onValueChange) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;
    dragStartValueRef.current = value;
    dragAccumulatedAngleRef.current = 0;
    dragLastAngleRef.current = getPointerAngle(knobRef.current, event.clientX, event.clientY);
    lastIssuedValueRef.current = snapToStep(value, min, max, safeStep);
    setIsDragging(true);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resetDragState();
    onValueCommit?.(lastIssuedValueRef.current);
  };

  useEffect(() => {
    const knob = knobRef.current;
    if (!knob || !isOn || !onValueChange) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      const nextValue = value + direction * safeStep;
      commitValueChange(nextValue);
      onValueCommit?.(snapToStep(nextValue, min, max, safeStep));
    };

    // React's delegated wheel listener is passive, so cancellation needs a native listener.
    knob.addEventListener('wheel', handleWheel, { passive: false });
    return () => knob.removeEventListener('wheel', handleWheel);
  }, [commitValueChange, isOn, max, min, onValueChange, onValueCommit, safeStep, value]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isOn || !onValueChange) {
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault();
      const nextValue = value + safeStep;
      commitValueChange(nextValue);
      onValueCommit?.(snapToStep(nextValue, min, max, safeStep));
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const nextValue = value - safeStep;
      commitValueChange(nextValue);
      onValueCommit?.(snapToStep(nextValue, min, max, safeStep));
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      commitValueChange(min);
      onValueCommit?.(snapToStep(min, min, max, safeStep));
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      commitValueChange(max);
      onValueCommit?.(snapToStep(max, min, max, safeStep));
    }
  };

  const visuals = getRotaryKnobVisuals(theme);
  const softFaceTint = faceTintColor ?? bandPrimaryColor;
  const knobCenterBackground = isSoftFace
    ? `radial-gradient(circle at 48% 42%, rgba(255,255,255,0.22), color-mix(in srgb, ${softFaceTint} 34%, transparent) 42%, color-mix(in srgb, ${softFaceTint} 20%, transparent) 70%, rgba(255,255,255,0.06) 100%)`
    : visuals.knobCenterGradient;
  const knobInnerBackground = isSoftFace
    ? `radial-gradient(circle at 42% 36%, rgba(255,255,255,0.16), color-mix(in srgb, ${softFaceTint} 18%, transparent) 52%, rgba(255,255,255,0.05) 100%)`
    : visuals.knobInnerGradient;
  const knobVisual = (
    <>
      <svg
        className="pointer-events-none absolute inset-[-0.75rem] h-[calc(100%+1.5rem)] w-[calc(100%+1.5rem)] overflow-visible"
        viewBox="0 0 352 352"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id={`rotary-knob-band-${id}`}
            x1="176"
            y1="18"
            x2="176"
            y2="334"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor={bandSecondaryColor} />
            <stop offset="50%" stopColor={bandPrimaryColor} />
            <stop offset="100%" stopColor={bandSecondaryColor} />
          </linearGradient>
          <filter id={`rotary-knob-band-glow-${id}`}>
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle
          cx="176"
          cy="176"
          r="163"
          fill="none"
          stroke={visuals.knobBandTrackStroke}
          strokeWidth={bandStrokeWidth}
          opacity={isOn ? 1 : 0.35}
        />
        <circle
          cx="176"
          cy="176"
          r="163"
          fill="none"
          stroke={`url(#rotary-knob-band-${id})`}
          strokeWidth={bandStrokeWidth}
          opacity={isOn ? 1 : 0.35}
          filter={isOn ? `url(#rotary-knob-band-glow-${id})` : 'none'}
          style={{
            filter: isOn ? `drop-shadow(0 0 16px ${bandGlowColor})` : 'none',
            transition: 'opacity 220ms ease, filter 220ms ease, stroke 220ms ease',
          }}
        />
      </svg>

      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: knobCenterBackground,
          boxShadow: isOn
            ? isSoftFace
              ? `inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -6px 18px rgba(0,0,0,0.06), 0 0 30px ${bandGlowColor}`
              : `inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -18px 44px rgba(0,0,0,0.26), 0 0 42px ${bandGlowColor}`
            : 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -18px 44px rgba(0,0,0,0.18)',
        }}
      />

      <div
        className={`absolute inset-[1.1rem] rounded-full border ${visuals.knobInnerBorder} ${
          isSoftFace ? 'bg-transparent' : 'bg-black/10'
        }`}
      />

      <div
        className="absolute inset-[1.4rem] rounded-full"
        style={{ background: knobInnerBackground }}
      />

      <div
        className={cn(
          'absolute inset-[0.65rem] rounded-full',
          isDragging ? '' : 'transition-transform duration-300 ease-out'
        )}
        style={{ transform: `rotate(${tickRotation}deg)` }}
      >
        {Array.from({ length: 40 }).map((_, index) => {
          const angle = index * 9;
          const isMajor = index % 5 === 0;

          return (
            <div
              key={angle}
              className="absolute left-1/2 top-1/2 origin-center"
              style={{ transform: `translate(-50%, -50%) rotate(${angle}deg)` }}
            >
              <div
                className={cn('rounded-full', isMajor ? 'h-5 w-[2px]' : 'h-3.5 w-px')}
                style={{
                  transform: `translateY(-${tickOffsetRem}rem)`,
                  backgroundColor: isOn
                    ? isMajor
                      ? visuals.tickMajorStroke
                      : visuals.tickMinorStroke
                    : visuals.tickMinorStroke,
                }}
              />
            </div>
          );
        })}
      </div>

      <div
        className={`absolute inset-[4rem] rounded-full border ${visuals.knobInnerBorder}`}
        style={{
          boxShadow: isSoftFace ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.08)',
          background: isSoftFace ? 'rgba(255,255,255,0.015)' : undefined,
        }}
      />
    </>
  );

  return (
    <div className={cn('relative h-[22rem] w-[22rem] overflow-visible', className)}>
      {isOn && glowClassName ? (
        <div
          data-rotary-knob-glow="true"
          className={cn(
            'pointer-events-none absolute right-[-6.5rem] top-1/2 h-80 w-80 -translate-y-1/2 rounded-full blur-3xl opacity-75',
            glowClassName
          )}
        />
      ) : null}

      {isOn && onValueChange ? (
        <div
          ref={knobRef}
          className={cn(
            'absolute inset-0 flex touch-none items-center justify-center cursor-grab active:cursor-grabbing'
          )}
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={ariaValueText}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onKeyDown={handleKeyDown}
        >
          <div
            aria-hidden="true"
            className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 touch-none select-none rounded-full"
            data-rotary-knob-hit-surface="true"
            style={{
              height: `${interactionDiameterRem}rem`,
              minHeight: '100%',
              minWidth: '100%',
              width: `${interactionDiameterRem}rem`,
            }}
          />
          {knobVisual}
        </div>
      ) : (
        <div
          ref={knobRef}
          className="absolute inset-0 flex items-center justify-center"
          role="img"
          aria-hidden="true"
        >
          {knobVisual}
        </div>
      )}
    </div>
  );
});
