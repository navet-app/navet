import type { resolveScreensaverAppearance } from '@navet/app/constants/screensaver-options';
import { useLayoutEffect, useRef, useState } from 'react';
import { ScreensaverScene } from './screensaver';

// Keep the full landscape layout in a scaled canvas. The scene sizes itself with
// container queries, so no iframe, second runtime, or duplicate app load is needed.
export function ScreensaverThumbnail({
  appearance,
}: {
  appearance: ReturnType<typeof resolveScreensaverAppearance>;
}) {
  const frame = useRef<HTMLSpanElement | null>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const update = () => {
      const element = frame.current;
      if (element) setScale(Math.min(element.clientWidth / 1280, element.clientHeight / 720));
    };
    const observer = new ResizeObserver(update);
    if (frame.current) observer.observe(frame.current);
    update();
    return () => observer.disconnect();
  }, []);
  return (
    <span
      ref={frame}
      aria-hidden
      className="pointer-events-none absolute inset-0 block overflow-hidden"
    >
      <span
        className="absolute block overflow-hidden text-white"
        style={{
          width: 1280,
          height: 720,
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <ScreensaverScene {...appearance} />
      </span>
    </span>
  );
}
