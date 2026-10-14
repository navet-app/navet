import { createProviderScopedId, parseProviderScopedId } from '@navet/core/ids';
import type { ProviderHistoryFeatureService } from '@navet/core/provider-feature-services';
import type {
  ProviderHubFeatureService,
  ProviderHubSection,
  ProviderHubSnapshot,
} from '@navet/core/provider-hub';
import { homeyService } from './homey-service';
import type { HomeyCapabilityState, HomeyLog, HomeySnapshot } from './homey-types';

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
const resources = {
  flows: '/api/manager/flow/flow',
  advancedFlows: '/api/manager/flow/advancedflow',
  moods: '/api/manager/moods/mood',
  users: '/api/manager/users/user',
  me: '/api/manager/users/user/me',
  notifications: '/api/manager/notifications/notification',
  apps: '/api/manager/apps/app',
  logs: '/api/manager/insights/log',
} as const;

/** Optional managers must never prevent rooms and devices from connecting. */
export async function loadHomeyResources(request: Request): Promise<Partial<HomeySnapshot>> {
  const resourceErrors: NonNullable<HomeySnapshot['resourceErrors']> = {};
  const result: Partial<HomeySnapshot> = {
    flows: {},
    advancedFlows: {},
    moods: {},
    users: {},
    me: undefined,
    notifications: {},
    apps: {},
    logs: {},
    resourceErrors,
  };
  await Promise.all(
    Object.entries(resources).map(async ([key, path]) => {
      try {
        const value = await request<unknown>(path);
        if (!value || typeof value !== 'object' || (key === 'me' && Array.isArray(value)))
          throw new Error('Homey returned an invalid resource collection');
        const collection = Array.isArray(value)
          ? Object.fromEntries(
              value.map((item: { id?: string }) => {
                if (!item || typeof item.id !== 'string')
                  throw new Error('Homey returned an invalid resource');
                return [item.id, item];
              })
            )
          : value;
        Object.assign(result, { [key]: collection });
      } catch (error) {
        resourceErrors[key] =
          error instanceof Error ? error.message : 'Homey resource could not be loaded';
      }
    })
  );
  return result;
}

const scoped = (id: string) => createProviderScopedId('homey', id);
const controlScale = (cap?: HomeyCapabilityState) =>
  cap?.units === '%' && cap.min === 0 && cap.max === 1 ? 100 : 1;
function native(id: string) {
  const parsed = parseProviderScopedId(id);
  if (parsed && parsed.providerId !== 'homey')
    throw new Error('This resource belongs to another provider');
  return parsed?.nativeId ?? id;
}
const mutation = (method: string, data?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(data === undefined ? {} : { body: JSON.stringify(data) }),
});
const sectionKeys: Record<ProviderHubSection, string[]> = {
  devices: ['me'],
  rooms: [],
  automations: ['flows', 'advancedFlows', 'me'],
  scenes: ['moods'],
  people: ['users', 'me'],
  notifications: ['notifications'],
  apps: ['apps'],
  history: ['logs'],
  installations: [],
};

export function mapHomeyHubSnapshot(snapshot: HomeySnapshot): ProviderHubSnapshot {
  const favoriteDevices = snapshot.me?.properties?.favoriteDevices;
  const favoriteFlows = snapshot.me?.properties?.favoriteFlows;
  const favoritesAvailable = !!snapshot.me && !snapshot.resourceErrors?.me;
  const sections: ProviderHubSnapshot['sections'] = {
    installations: [],
    devices: Object.values(snapshot.devices).map((device) => ({
      id: scoped(device.id),
      name: device.name,
      description: snapshot.zones[device.zone ?? '']?.name,
      available: device.available !== false,
      favorite: favoritesAvailable
        ? Array.isArray(favoriteDevices) && favoriteDevices.includes(device.id)
        : undefined,
      controls: Object.entries(device.capabilitiesObj ?? {}).map(([id, cap]) => ({
        id,
        name: cap.title || id,
        value:
          typeof cap.value === 'boolean' ||
          typeof cap.value === 'string' ||
          typeof cap.value === 'number'
            ? typeof cap.value === 'number'
              ? controlScale(cap) === 100
                ? Number((cap.value * 100).toFixed(4))
                : cap.value
              : cap.value
            : null,
        type:
          cap.type ??
          (typeof cap.value === 'boolean'
            ? 'boolean'
            : typeof cap.value === 'number'
              ? 'number'
              : 'string'),
        writable: cap.setable === true,
        min: cap.min === undefined ? undefined : cap.min * controlScale(cap),
        max: cap.max === undefined ? undefined : cap.max * controlScale(cap),
        step: cap.step === undefined ? undefined : cap.step * controlScale(cap),
        unit: cap.units,
        options: cap.values?.map((option) => ({ id: option.id, name: option.title })),
      })),
    })),
    rooms: Object.values(snapshot.zones).map((zone) => ({
      id: scoped(zone.id),
      name: zone.name,
      available: true,
    })),
    automations: [
      ...Object.values(snapshot.flows ?? {}).map((flow) => ({ ...flow, kind: 'flow' })),
      ...Object.values(snapshot.advancedFlows ?? {}).map((flow) => ({
        ...flow,
        kind: 'advancedflow',
      })),
    ].map((flow) => ({
      id: scoped(`${flow.kind}/${flow.id}`),
      name: flow.name,
      available: flow.enabled !== false,
      runnable: flow.enabled !== false && flow.triggerable === true,
      favorite: favoritesAvailable
        ? Array.isArray(favoriteFlows) && favoriteFlows.includes(flow.id)
        : undefined,
    })),
    scenes: Object.values(snapshot.moods ?? {}).map((mood) => ({
      id: scoped(`mood/${mood.id}`),
      name: mood.name,
      description: snapshot.zones[mood.zone ?? '']?.name,
      available: true,
      runnable: true,
    })),
    people: Object.values({
      ...(snapshot.users ?? {}),
      ...(snapshot.me ? { [snapshot.me.id]: snapshot.me } : {}),
    }).map((user) => ({
      id: scoped(`person/${user.id}`),
      name: user.name || user.id,
      available: true,
      controls: [
        {
          id: 'present',
          name: 'Present',
          type: 'boolean',
          value: user.present ?? null,
          writable: user.id === snapshot.me?.id,
        },
        {
          id: 'asleep',
          name: 'Asleep',
          type: 'boolean',
          value: user.asleep ?? null,
          writable: user.id === snapshot.me?.id,
        },
      ],
    })),
    notifications: Object.values(snapshot.notifications ?? {}).map((item) => ({
      id: scoped(item.id),
      name: item.ownerName || 'Homey',
      description: item.excerpt,
      available: true,
    })),
    apps: Object.values(snapshot.apps ?? {}).map((app) => ({
      id: scoped(app.id),
      name: app.name,
      description: [app.version, app.state].filter(Boolean).join(' · '),
      available: true,
    })),
    history: Object.values(snapshot.logs ?? {}).map((log) => ({
      id: scoped(`insight/${log.id}`),
      name: log.title || log.id,
      description: [
        snapshot.devices[(log.ownerUri ?? log.uri ?? '').replace(/^homey:device:/, '')]?.name ||
          log.ownerName,
        log.units,
      ]
        .filter(Boolean)
        .join(' · '),
      unit: log.units,
      available: true,
    })),
  };
  const errors: ProviderHubSnapshot['errors'] = {};
  for (const [section, keys] of Object.entries(sectionKeys)) {
    const messages = keys.map((key) => snapshot.resourceErrors?.[key]).filter(Boolean);
    if (messages.length) errors[section as ProviderHubSection] = [...new Set(messages)].join('; ');
  }
  return {
    sections,
    errors,
    profile: snapshot.me ? { name: snapshot.me.name || '', email: snapshot.me.email } : undefined,
  };
}

export async function runHomeyResource(resourceId: string): Promise<void> {
  await homeyService.runResource(native(resourceId));
}

function findLog(id: string): HomeyLog | undefined {
  const snapshot = homeyService.getSnapshot();
  if (id.startsWith('insight/')) return snapshot.logs?.[id.slice(8)];
  const [deviceId, capabilityId] = id.split('#');
  return Object.values(snapshot.logs ?? {}).find(
    (log) =>
      (log.ownerUri === `homey:device:${deviceId}` || log.uri === `homey:device:${deviceId}`) &&
      (log.id === capabilityId || log.id === `homey:device:${deviceId}:${capabilityId}`)
  );
}

export async function getHomeyHistory(resourceId: string, period: 'day' | 'week' | 'month') {
  const log = findLog(native(resourceId));
  if (!log) throw new Error('Homey has no Insights history for this entity');
  const owner = log.ownerUri ?? log.uri ?? log.id.split(':', 3).join(':');
  const resolution = { day: 'last24Hours', week: 'last7Days', month: 'last31Days' }[period];
  const entries = await homeyService.request<{
    values: { t: string; v: number | boolean | null }[];
  }>(
    `/api/manager/insights/log/${encodeURIComponent(owner)}/${encodeURIComponent(log.id)}/entry?resolution=${resolution}`
  );
  if (!Array.isArray(entries.values)) throw new Error('Homey returned invalid Insights history');
  return entries.values
    .filter(
      (point): point is { t: string; v: number | boolean } =>
        typeof point.t === 'string' &&
        Number.isFinite(Date.parse(point.t)) &&
        (typeof point.v === 'boolean' || (typeof point.v === 'number' && Number.isFinite(point.v)))
    )
    .map((point) => ({ time: point.t, value: point.v }))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

let favoriteQueue: Promise<unknown> = Promise.resolve();
export const homeyHubFeatureService: ProviderHubFeatureService = {
  async getSnapshot() {
    return mapHomeyHubSnapshot(homeyService.getSnapshot());
  },
  async refresh() {
    await homeyService.loadSnapshot();
    return mapHomeyHubSnapshot(homeyService.getSnapshot());
  },
  subscribe: (listener) => homeyService.subscribe(listener),
  run: runHomeyResource,
  setFavorite(resourceId, favorite) {
    const operation = favoriteQueue
      .catch(() => undefined)
      .then(async () => {
        const id = native(resourceId);
        const snapshot = homeyService.getSnapshot();
        const flow = /^(flow|advancedflow)\//.test(id);
        const key = flow ? 'favoriteFlows' : 'favoriteDevices';
        const itemId = flow ? id.slice(id.indexOf('/') + 1) : id;
        if (
          !(flow
            ? snapshot.flows?.[itemId] || snapshot.advancedFlows?.[itemId]
            : snapshot.devices[itemId])
        )
          throw new Error('Unknown Homey favorite');
        const me = await homeyService.request<HomeySnapshot['me']>('/api/manager/users/user/me');
        if (!me) throw new Error('Homey profile is unavailable');
        const current = me.properties?.[key];
        const values = new Set(Array.isArray(current) ? current : []);
        if (favorite) values.add(itemId);
        else values.delete(itemId);
        await homeyService.request(
          `/api/manager/users/user/me/properties/${key}`,
          mutation('PUT', { value: [...values] })
        );
        homeyService.replaceSnapshot({
          me: { ...me, properties: { ...me.properties, [key]: [...values] } },
        });
      });
    favoriteQueue = operation;
    return operation;
  },
  async setControl(resourceId, controlId, value) {
    const id = native(resourceId);
    const snapshot = homeyService.getSnapshot();
    if (id.startsWith('person/')) {
      if (
        id.slice(7) !== snapshot.me?.id ||
        !['present', 'asleep'].includes(controlId) ||
        typeof value !== 'boolean'
      )
        throw new Error('Only your own presence can be changed');
      await homeyService.request(
        `/api/manager/presence/me/${controlId}`,
        mutation('PUT', { value })
      );
      homeyService.replaceSnapshot({ me: { ...snapshot.me, [controlId]: value } });
      return;
    }
    const control = mapHomeyHubSnapshot(snapshot)
      .sections.devices.find((device) => device.id === scoped(id))
      ?.controls?.find((cap) => cap.id === controlId);
    if (!control?.writable || snapshot.devices[id]?.available === false)
      throw new Error('This capability cannot be changed');
    if (
      (control.type === 'boolean' && typeof value !== 'boolean') ||
      (control.type === 'number' &&
        (typeof value !== 'number' ||
          !Number.isFinite(value) ||
          (control.min !== undefined && value < control.min) ||
          (control.max !== undefined && value > control.max))) ||
      (control.type === 'enum' && !control.options?.some((option) => option.id === value)) ||
      (control.type === 'string' && typeof value !== 'string')
    )
      throw new Error('Invalid capability value');
    const nativeValue =
      typeof value === 'number'
        ? value / controlScale(snapshot.devices[id].capabilitiesObj?.[controlId])
        : value;
    await homeyService.request(
      `/api/manager/devices/device/${encodeURIComponent(id)}/capability/${encodeURIComponent(controlId)}`,
      mutation('PUT', { value: nativeValue })
    );
    homeyService.replaceSnapshot({
      devices: {
        ...snapshot.devices,
        [id]: {
          ...snapshot.devices[id],
          capabilitiesObj: {
            ...snapshot.devices[id].capabilitiesObj,
            [controlId]: {
              ...snapshot.devices[id].capabilitiesObj?.[controlId],
              value: nativeValue,
            },
          },
        },
      },
    });
  },
  getHistory: getHomeyHistory,
};

export const homeyHistoryFeatureService: ProviderHistoryFeatureService = {
  entityHistoryQueryMode: 'retained-series',
  getMessageClient: () => null,
  supportsEntityHistory: (entityId) => {
    const snapshot = homeyService.getSnapshot();
    // A failed manager fetch is a real error, not evidence that history is unsupported.
    return Boolean(snapshot.resourceErrors?.logs || findLog(native(entityId)));
  },
  async getEntityHistory(request) {
    const start = Date.parse(request.startTime);
    const end = request.endTime ? Date.parse(request.endTime) : Date.now();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
      throw new Error('Invalid history time range');
    const age = Date.now() - start;
    if (age > 31 * 86_400_000) throw new Error('Homey history supports the last 31 days');
    const points = await getHomeyHistory(
      request.entityId,
      age <= 86_400_000 ? 'day' : age <= 7 * 86_400_000 ? 'week' : 'month'
    );
    return {
      entityId: request.entityId,
      points: points
        .filter((point) => Date.parse(point.time) >= start && Date.parse(point.time) <= end)
        .map((point) => ({
          state:
            typeof point.value === 'boolean' ? (point.value ? 'on' : 'off') : String(point.value),
          changedAt: point.time,
        })),
    };
  },
};
