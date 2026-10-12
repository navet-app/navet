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
import { useEffect, useId, useRef, useState } from 'react';
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
const HELPER_SCROLL_THRESHOLD = 12;

function ScrollableHelperControls({
  helpers,
  theme,
  headingId,
}: {
  helpers: NavetEntity[];
  theme?: ThemeType;
  headingId: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [hasMoreBelow, setHasMoreBelow] = useState(true);
  useEffect(() => {
    const content = contentRef.current;
    const viewport = content?.closest<HTMLElement>('[role="region"]');
    if (!content || !viewport) return;
    const update = () => {
      if (!viewport.clientHeight) return;
      setScrollTop(viewport.scrollTop);
      setHasMoreBelow(viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(content);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
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
        style: { height: `min(${HELPER_VIEWPORT_HEIGHT}px, 60dvh)` },
        onScroll: (event) => {
          const viewport = event.currentTarget;
          setScrollTop(viewport.scrollTop);
          setHasMoreBelow(viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1);
        },
      }}
    >
      <div ref={contentRef}>
        {/* Keep every control mounted for native Tab and screen-reader navigation. */}
        {helpers.map((entity) => (
          <EntityHelperRow key={entity.canonicalId} entity={entity} theme={theme} />
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
      {helpers.length > HELPER_SCROLL_THRESHOLD ? (
        <ScrollableHelperControls
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
