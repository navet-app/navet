import { INTEGRATION_PROVIDERS } from '@navet/core/integration-providers';
import type {
  NavetProviderContract,
  NavetProviderSessionInput,
  NavetProviderSessionMap,
  NavetResourceResolveRequest,
  ResolvedPlatformResource,
} from '@navet/core/provider-contract';
import { createSnapshotBackedProviderAdapter } from '@navet/core/snapshot-backed-adapter';
import type { NavetProviderState } from '@navet/core/types';
import { createSessionBoundFeatureLoader } from './homeassistant-lazy-feature-service';
import { createHomeAssistantProviderStateMapper } from './homeassistant-mappers';
import {
  getHomeAssistantStoreState,
  type HomeAssistantPanelHass,
  isHomeAssistantConnected,
  resolveHomeAssistantArtwork,
  resolveHomeAssistantProxyUrl,
  resolveHomeAssistantResourceUrl,
  subscribeHomeAssistantStore,
} from './homeassistant-service-bridge';

interface HomeAssistantProviderSessionInput extends NavetProviderSessionInput {
  providerId: 'home_assistant';
}

function getHomeAssistantProviderSession(
  sessions: NavetProviderSessionMap
): HomeAssistantProviderSessionInput | null {
  const session = sessions.home_assistant;
  return session?.providerId === 'home_assistant'
    ? (session as HomeAssistantProviderSessionInput)
    : null;
}

function buildProviderSession(session: HomeAssistantProviderSessionInput, connected: boolean) {
  return {
    providerId: session.providerId,
    connected,
    runtime: session.runtime,
    authMode: session.authMode,
  };
}

const mapHomeAssistantProviderState = createHomeAssistantProviderStateMapper();

function getHomeAssistantState(): NavetProviderState {
  const state = getHomeAssistantStoreState();
  const mappingInput = {
    entities: state.entities,
    areas: state.areas,
    deviceRegistry: state.deviceRegistry,
    entityRegistry: state.entityRegistry,
  };
  return mapHomeAssistantProviderState(mappingInput, {
    connected: state.connected,
    connecting: state.connecting,
    reconnecting: state.reconnecting,
    entitiesHydrated: state.entities !== null,
    registriesHydrated: state.registriesHydrated,
    error: state.error,
  });
}

async function resolveHomeAssistantResource(
  request: NavetResourceResolveRequest
): Promise<ResolvedPlatformResource> {
  if (request.kind !== 'media_artwork' && request.kind !== 'primary_image') {
    return {
      id: request.deviceId,
      kind: 'unavailable',
      cacheKey: request.deviceId,
      authStrategy: 'none',
    };
  }

  return await resolveHomeAssistantArtwork(
    request.deviceId.replace(/^home_assistant:/, ''),
    request.attrs ?? {},
    request.fallbackPicture
  );
}

export function createHomeAssistantProviderContract(): NavetProviderContract {
  return {
    providerId: 'home_assistant',
    bootstrapSession: (sessions) => {
      const session = getHomeAssistantProviderSession(sessions);
      return session ? buildProviderSession(session, isHomeAssistantConnected()) : null;
    },
    initializeSession: async (session) => {
      if (session.providerId !== 'home_assistant') {
        return;
      }

      await getHomeAssistantStoreState().connect(session);
    },
    attachRuntimeBridge: (bridge) => {
      getHomeAssistantStoreState().syncPanelHass(bridge as HomeAssistantPanelHass);
    },
    teardownSession: () => {
      void getHomeAssistantStoreState().disconnect();
    },
    getState: getHomeAssistantState,
    subscribeState: subscribeHomeAssistantStore,
    resolveResource: resolveHomeAssistantResource,
    normalizeResourceUrl: (resourceUrl) => resolveHomeAssistantProxyUrl(resourceUrl) ?? resourceUrl,
    resolveResourceUrl: resolveHomeAssistantResourceUrl,
  };
}

const withCommands = createSessionBoundFeatureLoader(() => import('./homeassistant-commands'));

export function createHomeAssistantContractAdapter(
  contract: NavetProviderContract = createHomeAssistantProviderContract(),
  options: {
    getSession?: () => NavetProviderSessionInput | null | undefined;
  } = {}
) {
  return createSnapshotBackedProviderAdapter({
    providerId: 'home_assistant',
    providerLabel: INTEGRATION_PROVIDERS.home_assistant.label,
    contract,
    executeCommand: (entity, command) =>
      withCommands((commands) => commands.executeHomeAssistantCommand(entity, command)),
    getSession: options.getSession,
  });
}
