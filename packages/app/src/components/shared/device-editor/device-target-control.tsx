import type { ReactNode } from 'react';

interface DeviceTargetControlProps {
  label: string;
  value: string;
  currentReading?: string;
  status?: string;
  controls?: ReactNode;
  renderControls?: (value: ReactNode) => ReactNode;
  readableTokens: { titleColor: string; subtitleColor: string };
}

/** Compact target adjustment with the live reading kept separate from the setpoint. */
export function DeviceTargetControl({
  label,
  value,
  currentReading,
  status,
  controls,
  renderControls,
  readableTokens,
}: DeviceTargetControlProps) {
  return (
    <div className="space-y-2">
      {renderControls ? (
        <div className="text-center">
          <p
            aria-hidden="true"
            className="mb-2 text-xs"
            style={{ color: readableTokens.subtitleColor }}
          >
            {label}
          </p>
          <div className="flex justify-center">
            {renderControls(
              <dl>
                <dt className="sr-only">{label}</dt>
                <dd
                  className="text-3xl font-bold leading-none"
                  style={{ color: readableTokens.titleColor }}
                >
                  {value}
                </dd>
              </dl>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <dl className="min-w-0">
            <dt className="mb-1 text-xs" style={{ color: readableTokens.subtitleColor }}>
              {label}
            </dt>
            <dd
              className="text-3xl font-bold leading-none"
              style={{ color: readableTokens.titleColor }}
            >
              {value}
            </dd>
          </dl>
          <div className="shrink-0">{controls}</div>
        </div>
      )}
      {currentReading || status ? (
        <div
          className={`space-y-0.5 text-xs ${renderControls ? 'text-center' : ''}`}
          style={{ color: readableTokens.subtitleColor }}
        >
          {currentReading ? <p>{currentReading}</p> : null}
          {status ? <p>{status}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
