import { authSessionManager } from '@navet/app/infrastructure/home-assistant/auth/auth-session-manager';
import { toLegacyAuthRuntime } from '@navet/app/infrastructure/home-assistant/runtime/runtime-context';
import { getRuntimeContext } from '@navet/app/infrastructure/home-assistant/runtime/runtime-detector';
import { fromProviderSessionInput, toAuthCompatibleSession } from './auth/types';
import type { IntegrationSessionRuntimeRegistration } from './session-runtime-types';

let registration: IntegrationSessionRuntimeRegistration | null = null;

type SessionListener = Parameters<IntegrationSessionRuntimeRegistration['subscribe']>[0];
type LoginInput = Parameters<IntegrationSessionRuntimeRegistration['login']>[0];
type ProviderIdArg = Parameters<IntegrationSessionRuntimeRegistration['logout']>[0];
type ReplaceSessionArg = Parameters<IntegrationSessionRuntimeRegistration['replaceSession']>[0];
type ActiveProviderArg = Parameters<IntegrationSessionRuntimeRegistration['setActiveProvider']>[0];

function createSessionRuntimeRegistration(): IntegrationSessionRuntimeRegistration {
  return {
    getAuthRuntime: () => toLegacyAuthRuntime(getRuntimeContext().kind),
    getSnapshot: () => authSessionManager.getSnapshot(),
    getSession: () => toAuthCompatibleSession(authSessionManager.getSession()),
    subscribe: (listener: SessionListener) =>
      authSessionManager.subscribe((snapshot, session) =>
        listener(snapshot, toAuthCompatibleSession(session))
      ),
    init: async () => await authSessionManager.init(),
    login: async (input: LoginInput) =>
      await authSessionManager.login({
        haBaseUrl: input?.haBaseUrl,
        hassUrl: input?.hassUrl,
        accessToken: input?.accessToken,
        username: input?.username,
        password: input?.password,
        providerId: input?.providerId,
      }),
    logout: async (providerId: ProviderIdArg) => {
      await authSessionManager.logout(providerId);
    },
    refresh: async (providerId: ProviderIdArg) => await authSessionManager.refresh(providerId),
    invalidatePersistedSession: async (providerId: ProviderIdArg) => {
      await authSessionManager.invalidatePersistedSession(providerId);
    },
    replaceSession: (session: ReplaceSessionArg) =>
      authSessionManager.replaceSession(fromProviderSessionInput(session)),
    setActiveProvider: (providerId: ActiveProviderArg) =>
      authSessionManager.setActiveProvider(providerId),
  };
}

export function getIntegrationSessionRuntimeRegistration(): IntegrationSessionRuntimeRegistration {
  if (registration) {
    return registration;
  }

  registration = createSessionRuntimeRegistration();
  return registration;
}
