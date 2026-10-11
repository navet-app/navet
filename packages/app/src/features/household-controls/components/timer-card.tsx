import { BaseCard } from '@navet/app/components/primitives/base-card';
import { Button } from '@navet/app/components/primitives/button';
import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import { CardMetric } from '@navet/app/components/primitives/card-metric';
import { Input } from '@navet/app/components/primitives/input';
import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useI18n, useProviderEntityModel, useTheme } from '@navet/app/hooks';
import { type NavetTimerState, readNavetTimerState } from '@navet/core/household-device-state';
import type { IntegrationProviderId } from '@navet/core/integration-providers';
import { Pause, Play, Timer } from 'lucide-react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { useDeviceCommand } from '../hooks/use-device-command';

function useTimerRemaining(timer: NavetTimerState) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (timer.phase !== 'active' || !timer.finishesAt) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timer.phase, timer.finishesAt]);
  return timer.phase === 'active' && timer.finishesAt
    ? Math.max(0, Math.ceil((Date.parse(timer.finishesAt) - now) / 1000))
    : (timer.remainingSeconds ?? timer.durationSeconds);
}
function formatRemaining(seconds: number | null): string | null {
  if (seconds === null) return null;
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 3600)
    .toString()
    .padStart(2, '0')}:${Math.floor((total % 3600) / 60)
    .toString()
    .padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}
export function TimerControls(props: {
  id: string;
  providerId: IntegrationProviderId;
  timer: NavetTimerState;
  unavailable?: boolean;
}) {
  return <TimerControlsContent key={`${props.providerId}:${props.id}`} {...props} />;
}
function TimerControlsContent({
  id,
  providerId,
  timer,
  unavailable = false,
}: {
  id: string;
  providerId: IntegrationProviderId;
  timer: NavetTimerState;
  unavailable?: boolean;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const inputId = useId();
  const [duration, setDuration] = useState(() => String(timer.durationSeconds ?? ''));
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setDuration(String(timer.durationSeconds ?? ''));
  }, [timer.durationSeconds]);
  const operation = useDeviceCommand({
    entityId: id,
    providerId,
    stateKey: JSON.stringify([timer.phase, timer.finishesAt]),
  });
  const disabled = unavailable || operation.pending;
  const remaining = formatRemaining(useTimerRemaining(timer));
  const phase =
    timer.phase === 'unknown' ? t('providerDetails.unknown') : t(`timer.${timer.phase}`);
  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !timer.canStart) return;
    const seconds = duration === '' ? undefined : Number(duration);
    if (seconds !== undefined && (!Number.isSafeInteger(seconds) || seconds < 0)) return;
    const previousFinish = timer.finishesAt;
    const immediateFinish =
      (seconds === undefined || seconds === 0) &&
      timer.durationSeconds === 0 &&
      (timer.remainingSeconds === null || timer.remainingSeconds === 0);
    void operation.execute(
      {
        type: 'timer_start',
        entityId: id,
        ...(seconds !== undefined ? { durationSeconds: seconds } : {}),
      },
      immediateFinish
        ? undefined
        : (key) => {
            const [phase, finish] = JSON.parse(key);
            return phase === 'active' && (timer.phase !== 'active' || finish !== previousFinish);
          }
    );
  }
  return (
    <div className={`space-y-4 ${surface.textPrimary}`} aria-busy={operation.pending}>
      <p className="text-lg font-semibold tabular-nums">
        {remaining ?? t('providerDetails.unknown')}{' '}
        <span className={`text-sm font-normal ${surface.textSecondary}`}>{phase}</span>
      </p>
      <form onSubmit={start} className="space-y-3">
        <label htmlFor={inputId} className="block text-sm font-medium">
          {t('timer.duration')}
        </label>
        <Input
          id={inputId}
          type="number"
          min={0}
          step={1}
          value={duration}
          disabled={disabled || !timer.canStart}
          onChange={(event) => {
            dirty.current = true;
            setDuration(event.target.value);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            leading={<Play className="h-4 w-4" />}
            disabled={disabled || !timer.canStart}
          >
            {t('timer.start')}
          </Button>
          {timer.phase === 'paused' ? (
            <Button
              variant="secondary"
              disabled={disabled || !timer.canStart}
              onClick={() => {
                void operation.execute(
                  { type: 'timer_start', entityId: id },
                  (key) => JSON.parse(key)[0] === 'active'
                );
              }}
            >
              {t('timer.resume')}
            </Button>
          ) : null}
          {timer.canPause ? (
            <Button
              variant="secondary"
              leading={<Pause className="h-4 w-4" />}
              disabled={disabled}
              onClick={() => {
                void operation.execute(
                  { type: 'timer_pause', entityId: id },
                  (key) => JSON.parse(key)[0] === 'paused'
                );
              }}
            >
              {t('timer.pause')}
            </Button>
          ) : null}
          {timer.canCancel ? (
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => {
                void operation.execute(
                  { type: 'timer_cancel', entityId: id },
                  (key) => JSON.parse(key)[0] === 'idle'
                );
              }}
            >
              {t('timer.cancel')}
            </Button>
          ) : null}
          {timer.canFinish ? (
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => {
                void operation.execute(
                  { type: 'timer_finish', entityId: id },
                  (key) => JSON.parse(key)[0] === 'idle'
                );
              }}
            >
              {t('timer.finish')}
            </Button>
          ) : null}
        </div>
      </form>
      {unavailable ? <p role="status">{t('common.unavailable')}</p> : null}
      {operation.pending ? (
        <p role="status" className={surface.textSecondary}>
          {t('helpers.updating')}
        </p>
      ) : null}
      {operation.error ? <p role="alert">{t('deviceControls.failed')}</p> : null}
    </div>
  );
}
export function TimerCard({
  id,
  name,
  timer: initial,
  providerId,
  size,
  isEditMode,
}: {
  id: string;
  name: string;
  timer?: NavetTimerState;
  room?: string;
  providerId: IntegrationProviderId;
  size: CardSize;
  isEditMode: boolean;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const entity = useProviderEntityModel(id);
  const live = entity?.providerId === providerId ? readNavetTimerState(entity) : undefined;
  const timer = live ?? {
    phase: 'unknown',
    durationSeconds: null,
    remainingSeconds: null,
    finishesAt: null,
    ...initial,
    canStart: false,
    canPause: false,
    canCancel: false,
    canFinish: false,
  };
  const unavailable = !!entity && (!live || entity.availability !== 'available');
  const [open, setOpen] = useState(false);
  const phaseLabel = timer.phase === 'unknown' ? undefined : t(`timer.${timer.phase}`);
  const value = formatRemaining(useTimerRemaining(timer));
  return (
    <>
      <BaseCard
        size={size}
        title={name}
        interactive={!isEditMode}
        role={!isEditMode ? 'button' : undefined}
        tabIndex={!isEditMode ? 0 : undefined}
        aria-label={size === 'tiny' && phaseLabel ? `${name}, ${phaseLabel}` : name}
        onClick={() => {
          if (!isEditMode) setOpen(true);
        }}
      >
        <CardMetric
          value={
            !entity
              ? t('common.loading')
              : unavailable
                ? t('common.unavailable')
                : (value ?? t('providerDetails.unknown'))
          }
          label={size === 'tiny' ? undefined : phaseLabel}
          theme={theme}
          isActive={false}
          accentClassName="text-current"
          valueClassName={`break-words line-clamp-2 ${size === 'tiny' ? 'text-xs' : 'text-lg'} font-semibold tabular-nums`}
        />
      </BaseCard>
      {open ? (
        <BaseCardDialog
          isOpen={open}
          onOpenChange={setOpen}
          title={name}
          theme={theme}
          entityId={id}
          entityType="timer"
          tabs={[
            {
              key: 'controls',
              label: t('providerDetails.controls', { name }),
              icon: Timer,
              content: (
                <TimerControls
                  id={id}
                  providerId={providerId}
                  timer={timer}
                  unavailable={!entity || unavailable}
                />
              ),
            },
          ]}
        />
      ) : null}
    </>
  );
}
