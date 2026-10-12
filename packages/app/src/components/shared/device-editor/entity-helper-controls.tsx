import { dispatchEntityCommand } from '@navet/app/commands';
import { useI18n } from '@navet/app/hooks';
import { useIntegrationStore } from '@navet/app/hooks/use-integration-store';
import { useProviderControlSession } from '@navet/app/hooks/use-provider-control-session';
import { useProviderEntityModel } from '@navet/app/hooks/use-provider-device';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import { invokeIntegrationNativeAction } from '@navet/app/services/integration-native-action.service';
import { readNavetHelperState } from '@navet/core/helper-state';
import type { NavetEntity } from '@navet/core/types';
import { useEffect, useRef, useState } from 'react';
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
    .sort((left, right) => left.canonicalId.localeCompare(right.canonicalId));
}

const EMPTY_IDS: string[] = [];

export function EntityHelperControls({
  entityId,
  excludeEntityIds = EMPTY_IDS,
  theme,
}: {
  entityId: string;
  excludeEntityIds?: string[];
  theme?: ThemeType;
}) {
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
    <div className="mt-4">
      {helpers.map((entity) => (
        <EntityHelperRow key={entity.canonicalId} entity={entity} theme={theme} />
      ))}
    </div>
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
    if (expectedState === null) return;
    const timeout = setTimeout(() => {
      generation.current++;
      inFlight.current = false;
      setExpectedState(null);
      setPending(false);
      setFailed(true);
    }, 10000);
    return () => clearTimeout(timeout);
  }, [expectedState]);
  useEffect(
    () => () => {
      generation.current++;
    },
    []
  );
  const unavailable = entity.availability !== 'available';
  if (helper) {
    const value = unavailable
      ? t('common.unavailable')
      : helper.value === null
        ? t('providerDetails.unknown')
        : helper.helperType === 'text' && helper.mode === 'password'
          ? '••••'
          : `${helper.value}${helper.helperType === 'number' && helper.unit ? ` ${helper.unit}` : ''}`;
    return (
      <DeviceControlRow theme={theme} kind="disclosure" label={entity.name} value={value}>
        <HelperValueControl
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
  const action = entity.attributes.serviceAction;
  const isAction = action === 'press' || action === 'turn_on';
  const writable = !unavailable && (isAction || entity.capabilities.includes('toggle'));
  async function send(checked: boolean) {
    if (pending || inFlight.current || !writable) return;
    inFlight.current = true;
    const request = ++generation.current;
    setPending(true);
    setFailed(false);
    let waitingForEvent = false;
    try {
      if (action === 'press' && typeof entity.attributes.serviceDomain === 'string') {
        await invokeIntegrationNativeAction({
          providerId: entity.providerId,
          entityId: entity.canonicalId,
          domain: entity.attributes.serviceDomain,
          service: 'press',
        });
      } else {
        const result = await dispatchEntityCommand(
          { type: checked ? 'turn_on' : 'turn_off', entityId: entity.canonicalId },
          entity.providerId
        );
        if (!result.accepted) throw new Error('Rejected');
        if (request !== generation.current) return;
        waitingForEvent = !isAction && result.requiresEventConfirmation;
        if (waitingForEvent) setExpectedState(checked);
      }
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
  ) : unavailable ? (
    t('common.unavailable')
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
      value={
        unavailable
          ? t('common.unavailable')
          : String(entity.primaryState ?? t('providerDetails.unknown'))
      }
    />
  );
}
