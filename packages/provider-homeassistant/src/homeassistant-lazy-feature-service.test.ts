import { beforeEach, expect, it, vi } from 'vitest';
import { createSessionBoundFeatureLoader } from './homeassistant-lazy-feature-service';

const session = vi.hoisted(() => ({
  callWS: vi.fn(),
  connection: undefined as object | undefined,
  userId: 'user-a',
}));
vi.mock('./homeassistant-service-bridge', () => ({
  getHomeAssistantPanelHass: () => ({
    callWS: session.callWS,
    connection: session.connection,
    user: { id: session.userId },
  }),
  getHomeAssistantConnection: () => null,
}));

beforeEach(() => {
  session.callWS = vi.fn();
  session.connection = undefined;
  session.userId = 'user-a';
});

it('rejects a delayed load for a replaced household before invoking its action', async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const action = vi.fn();
  const withService = createSessionBoundFeatureLoader(async () => {
    await gate;
    return {};
  });
  const pending = withService(action);
  session.callWS = vi.fn();
  release();
  await expect(pending).rejects.toThrow('Home Assistant session changed');
  expect(action).not.toHaveBeenCalled();
});

it('permits replacement hass wrappers with the same authenticated callWS transport', async () => {
  const result = {};
  const action = vi.fn(() => result);
  const withService = createSessionBoundFeatureLoader(async () => ({}));
  await expect(withService(action)).resolves.toBe(result);
  expect(action).toHaveBeenCalledOnce();
});

it.each(['callWS', 'connection'] as const)(
  'rejects an old action when a panel user changes with the same %s transport',
  async (transport) => {
    if (transport === 'connection') session.connection = {};
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const action = vi.fn();
    const withService = createSessionBoundFeatureLoader(async () => {
      await gate;
      return {};
    });
    const pending = withService(action);
    session.userId = 'user-b';
    release();
    await expect(pending).rejects.toThrow('Home Assistant session changed');
    expect(action).not.toHaveBeenCalled();
    await withService(action);
    expect(action).toHaveBeenCalledOnce();
  }
);

it('keeps explicit injected client ownership independent of the panel session', async () => {
  const client = {};
  const action = vi.fn();
  const withService = createSessionBoundFeatureLoader(async () => {
    session.userId = 'user-b';
    return {};
  });
  await withService(action, () => client);
  expect(action).toHaveBeenCalledOnce();
});
