import { dispatchEntityCommand } from '@navet/app/commands';
import { CardDialogSection } from '@navet/app/components/patterns/card-dialog';
import { OverlayScrollArea } from '@navet/app/components/primitives/overlay-scroll-area';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { navetTypographyTokens } from '@navet/app/components/system/tokens';
import { useI18n, useTheme } from '@navet/app/hooks';
import { useIntegrationStore } from '@navet/app/hooks/use-integration-store';
import { useProviderControlSession } from '@navet/app/hooks/use-provider-control-session';
import { useProviderEntityModel } from '@navet/app/hooks/use-provider-device';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import { readNavetHelperState } from '@navet/core/helper-state';
import type { NavetEntity } from '@navet/core/types';
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { DeviceControlRow } from './device-control-row';
import { HelperValueControl } from './helper-value-control';

function deviceId(entity: NavetEntity): string | undefined {
  const value = entity.attributes.deviceId ?? entity.attributes.sourceDeviceId;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Relationships use the owning provider's normalized device identity, never name matching. */
export function selectRelatedHelpers(
  parent: NavetEntity | null,
  entities: Record<string, NavetEntity>
): NavetEntity[] {
  if (!parent || parent.type === 'helper') return [];
  const parentDeviceId = deviceId(parent);
  if (!parentDeviceId) return [];
  return Object.values(entities)
    .filter(
      (entity) =>
        entity.type === 'helper' &&
        entity.providerId === parent.providerId &&
        entity.canonicalId !== parent.canonicalId &&
        deviceId(entity) === parentDeviceId
    )
    .sort(
      (left, right) =>
        Number(left.availability !== 'available') - Number(right.availability !== 'available') ||
        left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }) ||
        left.canonicalId.localeCompare(right.canonicalId)
    );
}

const EMPTY_IDS: string[] = [];
const HELPER_ROW_ESTIMATE = 41;
const HELPER_VISIBLE_ROWS = 8;
const HELPER_VIEWPORT_HEIGHT = (HELPER_VISIBLE_ROWS - 0.5) * HELPER_ROW_ESTIMATE;
const HELPER_VIRTUALIZATION_THRESHOLD = 12;
const HELPER_OVERSCAN = 2;

function MeasuredHelperRow({
  id,
  top,
  onMeasure,
  onRetain,
  children,
}: {
  id: string;
  top: number;
  onMeasure: (id: string, height: number) => void;
  onRetain: (id: string) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const measure = () => onMeasure(id, row.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [id, onMeasure]);
  return (
    <div
      ref={ref}
      className="absolute left-0 right-0 [&>div]:!border-b"
      style={{ top }}
      onFocusCapture={() => onRetain(id)}
      onClickCapture={() => onRetain(id)}
    >
      {children}
    </div>
  );
}

function VirtualizedHelperControls({
  helpers,
  theme,
  headingId,
}: {
  helpers: NavetEntity[];
  theme?: ThemeType;
  headingId: string;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [visibleHeight, setVisibleHeight] = useState(HELPER_VIEWPORT_HEIGHT);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const measuredHeights = useRef<Record<string, number>>({});
  const [retained, setRetained] = useState<Set<string>>(() => new Set());
  const measure = useCallback((id: string, height: number) => {
    if (height <= 0 || measuredHeights.current[id] === height) return;
    measuredHeights.current[id] = height;
    setHeights((previous) => ({ ...previous, [id]: height }));
  }, []);
  // Keep interacted rows alive so scrolling cannot discard drafts, focus or pending commands.
  const retain = useCallback((id: string) => {
    setRetained((previous) => (previous.has(id) ? previous : new Set([...previous, id])));
  }, []);
  const { rows, totalHeight } = useMemo(() => {
    let top = 0;
    const rows = helpers.map((entity) => {
      const height = heights[entity.canonicalId] ?? HELPER_ROW_ESTIMATE;
      const row = { entity, top, height };
      top += height;
      return row;
    });
    return { rows, totalHeight: top };
  }, [helpers, heights]);
  const viewportHeight = HELPER_VIEWPORT_HEIGHT;
  const hasMoreBelow = scrollTop + visibleHeight < totalHeight - 1;
  const start = Math.min(scrollTop, Math.max(0, totalHeight - viewportHeight));
  const overscan = HELPER_OVERSCAN * HELPER_ROW_ESTIMATE;
  return (
    <OverlayScrollArea
      className="-mr-3"
      contentClassName="pr-3"
      viewportClassName={[
        scrollTop > 1 ? 'helper-list-top-fade' : '',
        hasMoreBelow ? 'helper-list-bottom-fade' : '',
      ].join(' ')}
      viewportProps={{
        role: 'region',
        'aria-labelledby': headingId,
        tabIndex: 0,
        style: { height: `min(${viewportHeight}px, 60dvh)` },
        onScroll: (event) => {
          setScrollTop(event.currentTarget.scrollTop);
          setVisibleHeight(event.currentTarget.clientHeight || viewportHeight);
        },
      }}
    >
      <div className="relative" style={{ height: totalHeight }}>
        {rows
          .filter(
            ({ entity, top, height }) =>
              retained.has(entity.canonicalId) ||
              (top + height >= start - overscan && top <= start + viewportHeight + overscan)
          )
          .map(({ entity, top }) => (
            <MeasuredHelperRow
              key={entity.canonicalId}
              id={entity.canonicalId}
              top={top}
              onMeasure={measure}
              onRetain={retain}
            >
              <EntityHelperRow entity={entity} theme={theme} />
            </MeasuredHelperRow>
          ))}
      </div>
    </OverlayScrollArea>
  );
}

export function EntityHelperControls({
  entityId,
  excludeEntityIds = EMPTY_IDS,
  theme,
}: {
  entityId: string;
  excludeEntityIds?: string[];
  theme?: ThemeType;
}) {
  const { t } = useI18n();
  const { theme: currentTheme } = useTheme();
  const headingId = useId();
  const surface = getThemeSurfaceTokens(theme ?? currentTheme);
  const parent = useProviderEntityModel(entityId);
  const helpers = useIntegrationStore(
    (state) =>
      selectRelatedHelpers(
        parent,
        parent ? (state.providerEntitiesByProviderId[parent.providerId] ?? {}) : {}
      ).filter(
        (entity) =>
          !excludeEntityIds.includes(entity.canonicalId) &&
          !excludeEntityIds.includes(entity.externalId)
      ),
    shallow
  );
  return helpers.length ? (
    <CardDialogSection
      className="mt-6"
      label={
        <h3 id={headingId} className={navetTypographyTokens.caption}>
          {t('helpers.title')}
        </h3>
      }
      labelClassName={`border-b pb-2 text-xs ${surface.textSecondary} ${surface.dividerBorder}`}
    >
      {helpers.length > HELPER_VIRTUALIZATION_THRESHOLD ? (
        <VirtualizedHelperControls
          key={entityId}
          helpers={helpers}
          theme={theme}
          headingId={headingId}
        />
      ) : (
        <div>
          {helpers.map((entity) => (
            <EntityHelperRow key={entity.canonicalId} entity={entity} theme={theme} />
          ))}
        </div>
      )}
    </CardDialogSection>
  ) : null;
}

function EntityHelperRow({ entity, theme }: { entity: NavetEntity; theme?: ThemeType }) {
  const { key } = useProviderControlSession(entity.canonicalId, entity.providerId);
  return <EntityHelperRowContent key={key} entity={entity} theme={theme} />;
}

function EntityHelperRowContent({ entity, theme }: { entity: NavetEntity; theme?: ThemeType }) {
  const { t } = useI18n();
  const helper = readNavetHelperState(entity);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const [expectedState, setExpectedState] = useState<boolean | null>(null);
  const isOn = entity.primaryState === 'on' || entity.primaryState === true;
  useEffect(() => {
    if (expectedState !== null && expectedState === isOn) {
      generation.current++;
      inFlight.current = false;
      setExpectedState(null);
      setPending(false);
    }
  }, [expectedState, isOn]);
  useEffect(() => {
    if (!pending) return;
    const timeout = setTimeout(() => {
      generation.current++;
      inFlight.current = false;
      setExpectedState(null);
      setPending(false);
      setFailed(true);
    }, 10000);
    return () => clearTimeout(timeout);
  }, [pending]);
  useEffect(
    () => () => {
      generation.current++;
    },
    []
  );
  const unavailable = entity.availability !== 'available';
  if (unavailable)
    return (
      <DeviceControlRow
        theme={theme}
        kind="reading"
        label={entity.name}
        value={t('common.unavailable')}
      />
    );
  if (helper) {
    const value =
      helper.value === null
        ? t('providerDetails.unknown')
        : helper.helperType === 'text' && helper.mode === 'password'
          ? '••••'
          : `${helper.value}${helper.helperType === 'number' && helper.unit ? ` ${helper.unit}` : ''}`;
    return (
      <DeviceControlRow theme={theme} kind="disclosure" label={entity.name} value={value}>
        <HelperValueControl
          layout="inline"
          id={entity.canonicalId}
          name={entity.name}
          helper={helper}
          providerId={entity.providerId}
          surfaceTheme={theme}
          unavailable={unavailable}
        />
      </DeviceControlRow>
    );
  }
  const isAction = entity.capabilities.includes('press');
  const writable = !unavailable && (isAction || entity.capabilities.includes('toggle'));
  async function send(checked: boolean) {
    if (pending || inFlight.current || !writable) return;
    inFlight.current = true;
    const request = ++generation.current;
    setPending(true);
    setFailed(false);
    let waitingForEvent = false;
    try {
      const result = await dispatchEntityCommand(
        {
          type: isAction ? 'press' : checked ? 'turn_on' : 'turn_off',
          entityId: entity.canonicalId,
        },
        entity.providerId
      );
      if (!result.accepted) throw new Error('Rejected');
      if (request !== generation.current) return;
      waitingForEvent = !isAction && result.requiresEventConfirmation;
      if (waitingForEvent) setExpectedState(checked);
    } catch {
      if (request === generation.current) setFailed(true);
    } finally {
      if (request === generation.current && !waitingForEvent) {
        inFlight.current = false;
        setPending(false);
      }
    }
  }
  const status = failed ? (
    <span role="alert">{t('helpers.updateFailed')}</span>
  ) : pending ? (
    t('helpers.updating')
  ) : undefined;
  if (isAction)
    return (
      <DeviceControlRow
        theme={theme}
        kind="action"
        label={entity.name}
        disabled={!writable || pending}
        status={status}
        onAction={() => void send(true)}
      />
    );
  if (entity.capabilities.includes('toggle'))
    return (
      <DeviceControlRow
        theme={theme}
        kind="toggle"
        label={entity.name}
        checked={isOn}
        disabled={!writable || pending}
        status={status}
        onCheckedChange={(checked) => void send(checked)}
      />
    );
  return (
    <DeviceControlRow
      theme={theme}
      kind="reading"
      label={entity.name}
      value={String(entity.primaryState ?? t('providerDetails.unknown'))}
    />
  );
}
