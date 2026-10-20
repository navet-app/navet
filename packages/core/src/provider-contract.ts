import type { IntegrationProviderId } from './integration-providers';
import type {
  CommandResult,
  NavetCommand,
  NavetEntity,
  NavetEntityEvent,
  NavetProviderState,
  NavetResourceKind,
  Unsubscribe,
} from './types';

export type PlatformResourceAuthStrategy = 'none' | 'same_origin' | 'bearer' | 'panel_bridge';

export interface ResolvedPlatformResource {
  id: string;
  kind: 'image' | 'hls_stream' | 'webrtc_stream' | 'mjpeg_stream' | 'external_link' | 'unavailable';
  url?: string;
  cacheKey: string;
  authStrategy: PlatformResourceAuthStrategy;
  expiresAt?: number;
  headers?: Record<string, string>;
  fallback?: ResolvedPlatformResource;
  metadata?: {
    mimeType?: string;
    width?: number;
    height?: number;
    source?: string;
    mode?: 'auto' | 'web_rtc' | 'mse';
  };
}

export interface NavetProviderSession {
  providerId: IntegrationProviderId;
  connected: boolean;
  runtime?: string;
  authMode?: string;
}

export interface NavetProviderSessionInput {
  providerId: IntegrationProviderId;
  runtime?: string;
  authMode?: string;
  haBaseUrl?: string;
  hassUrl?: string;
  auth?: {
    accessToken?: string;
  } | null;
  [key: string]: unknown;
}

export type NavetProviderSessionMap = Partial<
  Record<IntegrationProviderId, NavetProviderSessionInput | null | undefined>
>;

export interface NavetResourceResolveRequest {
  deviceId: string;
  providerId: IntegrationProviderId;
  kind: NavetResourceKind;
  attrs?: Record<string, unknown>;
  fallbackPicture?: string;
}

export interface NavetProviderContract {
  providerId: IntegrationProviderId;
  bootstrapSession?: (sessions: NavetProviderSessionMap) => NavetProviderSession | null;
  initializeSession?: (session: NavetProviderSessionInput) => Promise<void>;
  attachRuntimeBridge?: (bridge: unknown) => void;
  teardownSession?: () => void;
  getState: () => NavetProviderState;
  subscribeState?: (listener: () => void) => () => void;
  resolveResource?: (
    request: NavetResourceResolveRequest
  ) => Promise<ResolvedPlatformResource> | ResolvedPlatformResource;
  normalizeResourceUrl?: (resourceUrl: string) => string | null;
  /** Obtain a display URL, including any provider-owned asynchronous authentication. */
  resolveDisplayResource?: (resourceUrl: string) => Promise<ResolvedPlatformResource>;
}

export interface SmartHomeProviderAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listEntities(): Promise<NavetEntity[]>;
  getEntity(id: string): Promise<NavetEntity | null>;
  execute(command: NavetCommand): Promise<CommandResult>;
  subscribeToEvents(callback: (event: NavetEntityEvent) => void): Promise<Unsubscribe>;
}
