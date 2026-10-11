import type { NavetCapabilityId } from './capabilities';
import type { IntegrationProviderId } from './integration-providers';

export type NavetResourceKind =
  | 'primary_image'
  | 'media_artwork'
  | 'camera_snapshot'
  | 'camera_stream';

export interface NavetResource {
  kind: NavetResourceKind;
  providerId: IntegrationProviderId;
  entityId: string;
  path?: string;
}

export type NavetEntityType =
  | 'light'
  | 'fan'
  | 'switch'
  | 'sensor'
  | 'binary_sensor'
  | 'helper'
  | 'timer'
  | 'counter'
  | 'valve'
  | 'remote'
  | 'climate'
  | 'media_player'
  | 'weather'
  | 'cover'
  | 'lock'
  | 'scene'
  | 'person'
  | 'vacuum'
  | 'calendar'
  | 'camera'
  | 'grouped_sensor'
  | 'hvac'
  | 'energy'
  | 'unknown';

export type NavetEntityPrimaryState = string | number | boolean | null;

export type NavetEntityAvailability = 'available' | 'unavailable' | 'unknown';

export interface NavetEntity {
  id: string;
  canonicalId: string;
  providerId: IntegrationProviderId;
  externalId: string;
  type: NavetEntityType;
  name: string;
  room?: string;
  /**
   * Stable provider-scoped room identity.
   *
   * `room` remains the human-readable compatibility label while app-owned room
   * organization migrates to canonical IDs.
   */
  roomId?: string;
  primaryState: NavetEntityPrimaryState;
  availability: NavetEntityAvailability;
  attributes: Record<string, unknown>;
  capabilities: NavetCapabilityId[];
  resources?: Partial<Record<NavetResourceKind, NavetResource>>;
  lastUpdated?: string;
}

export interface NavetProviderRoom {
  id: string;
  canonicalId: string;
  providerId: IntegrationProviderId;
  externalId: string;
  name: string;
  normalizedName: string;
  alias?: string;
  memberIds: string[];
  sourceType: 'provider_managed' | 'derived';
  supportsOrdering: boolean;
  supportsDeletion: boolean;
}

export interface NavetProviderRuntimeState {
  providerId: IntegrationProviderId;
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  entitiesHydrated: boolean;
  registriesHydrated: boolean;
  error: string | null;
  unreachable?: boolean;
}

export interface NavetProviderState extends NavetProviderRuntimeState {
  entities: NavetEntity[];
  rooms: NavetProviderRoom[];
}

// Shared UI should emit only provider-neutral commands. Keep `service` as an adapter/app shim.
export type NavetCommand =
  | { type: 'timer_start'; entityId: string; durationSeconds?: number }
  | { type: 'timer_pause'; entityId: string }
  | { type: 'timer_cancel'; entityId: string }
  | { type: 'timer_finish'; entityId: string }
  | { type: 'counter_increment'; entityId: string }
  | { type: 'counter_decrement'; entityId: string }
  | { type: 'counter_reset'; entityId: string }
  | { type: 'set_counter_value'; entityId: string; value: number }
  | { type: 'set_position'; entityId: string; position: number }
  | { type: 'set_number_value'; entityId: string; value: number }
  | { type: 'select_option'; entityId: string; option: string }
  | { type: 'set_text_value'; entityId: string; value: string }
  | { type: 'set_datetime_value'; entityId: string; value: string }
  | { type: 'turn_on'; entityId: string }
  | { type: 'turn_off'; entityId: string }
  | { type: 'set_fan_speed'; entityId: string; percentage: number }
  | { type: 'set_vacuum_fan_speed'; entityId: string; fanSpeed: string }
  | { type: 'clean_vacuum_areas'; entityId: string; areaIds: string[] }
  | { type: 'play_pause'; entityId: string }
  | { type: 'previous_track'; entityId: string }
  | { type: 'next_track'; entityId: string }
  | { type: 'set_volume'; entityId: string; volume: number }
  | { type: 'mute'; entityId: string }
  | { type: 'unmute'; entityId: string }
  | { type: 'set_shuffle'; entityId: string; shuffle: boolean }
  | { type: 'set_repeat_mode'; entityId: string; repeatMode: 'off' | 'one' | 'all' }
  | { type: 'join_group'; entityId: string; members: string[] }
  | { type: 'leave_group'; entityId: string }
  | { type: 'set_climate_preset'; entityId: string; preset: string }
  | { type: 'set_climate_fan_mode'; entityId: string; mode: string }
  | { type: 'set_climate_swing_mode'; entityId: string; mode: string }
  | { type: 'set_climate_swing_horizontal_mode'; entityId: string; mode: string }
  | { type: 'set_climate_humidity'; entityId: string; humidity: number }
  | { type: 'set_climate_mode'; entityId: string; mode: string }
  | { type: 'set_brightness'; entityId: string; brightness: number }
  | { type: 'set_color_temperature'; entityId: string; kelvin: number }
  | { type: 'set_temperature'; entityId: string; temperature: number }
  | { type: 'lock'; entityId: string }
  | { type: 'unlock'; entityId: string }
  | { type: 'arm_home'; entityId: string; code?: string }
  | { type: 'arm_away'; entityId: string; code?: string }
  | { type: 'arm_night'; entityId: string; code?: string }
  | { type: 'arm_vacation'; entityId: string; code?: string }
  | { type: 'arm_custom_bypass'; entityId: string; code?: string }
  | { type: 'disarm'; entityId: string; code?: string }
  | { type: 'trigger'; entityId: string; code?: string }
  | { type: 'open'; entityId: string }
  | { type: 'close'; entityId: string }
  | { type: 'start'; entityId: string }
  | { type: 'pause'; entityId: string }
  | { type: 'stop'; entityId: string }
  | { type: 'return_home'; entityId: string }
  | { type: 'locate'; entityId: string }
  | { type: 'clean_spot'; entityId: string };

export type NavetUiCommand = NavetCommand;

export interface CommandResult {
  accepted: boolean;
  providerRequestId?: string;
  optimisticState?: Partial<Pick<NavetEntity, 'primaryState' | 'availability' | 'attributes'>>;
  requiresEventConfirmation: boolean;
  error?: string;
}

export type NavetEntityEvent =
  | {
      type: 'entity_added' | 'entity_updated' | 'entity_removed';
      providerId: IntegrationProviderId;
      entityId: string;
      entity?: NavetEntity;
      at: string;
    }
  | {
      type: 'connection_changed';
      providerId: IntegrationProviderId;
      connected: boolean;
      at: string;
    };

export type Unsubscribe = () => void;
