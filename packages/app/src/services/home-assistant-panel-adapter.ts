import type {
  Connection,
  HassConfig,
  HassEntities,
  HassUser,
  MessageBase,
} from 'home-assistant-js-websocket';

import type {
  HomeAssistantAreaRegistryEntry,
  HomeAssistantCategoryRegistryEntry,
  HomeAssistantDeviceRegistryEntry,
  HomeAssistantEntityRegistryEntry,
} from './home-assistant.service';

export interface HomeAssistantPanelHass {
  states: HassEntities;
  config: HassConfig;
  user?: HassUser;
  connection?: Connection;
  shell?: HomeAssistantPanelShellBridge;
  callService: (
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: {
      entity_id?: string | string[];
      area_id?: string | string[];
      device_id?: string | string[];
    }
  ) => Promise<unknown>;
  callApi?: <T = unknown>(
    method: string,
    path: string,
    parameters?: Record<string, unknown>
  ) => Promise<T>;
  callWS: <T = unknown>(message: Record<string, unknown>) => Promise<T>;
}

export interface HomeAssistantPanelShellBridge {
  canToggleKiosk: boolean;
  canOpenSidebar: boolean;
  canNavigateHome: boolean;
  connect: (listener?: () => void) => void;
  disconnect: () => void;
  isKioskEnabled: () => boolean | null;
  setHomeAssistantKioskEnabled: (enabled: boolean) => Promise<boolean>;
  openHomeAssistantSidebar: () => Promise<boolean>;
  navigateToHomeAssistantHome: () => Promise<boolean>;
}

export class HomeAssistantPanelAdapter {
  private hass: HomeAssistantPanelHass;
  private connectionBridge?: {
    session: { hass: HomeAssistantPanelHass };
    connection: Connection;
  };

  constructor(hass: HomeAssistantPanelHass) {
    this.hass = hass;
  }

  update(hass: HomeAssistantPanelHass): void {
    if (this.connectionBridge) {
      const previous = this.connectionBridge.session.hass;
      if (
        previous.connection === hass.connection &&
        previous.user?.id === hass.user?.id &&
        (hass.connection || previous.callWS === hass.callWS)
      ) {
        this.connectionBridge.session.hass = hass;
      } else {
        this.connectionBridge = undefined;
      }
    }
    this.hass = hass;
  }

  getHass(): HomeAssistantPanelHass {
    return this.hass;
  }

  getConfig(): HassConfig {
    return this.hass.config;
  }

  getEntities(): HassEntities {
    return this.hass.states;
  }

  getUser(): HassUser | null {
    return this.hass.user ?? null;
  }

  getConnection(): Connection {
    if (this.connectionBridge) return this.connectionBridge.connection;
    const session = { hass: this.hass };
    const connection = {
      sendMessagePromise: (message: Record<string, unknown>) => session.hass.callWS(message),
      subscribeMessage: <Result>(
        callback: (result: Result) => void,
        subscribeMessage: MessageBase,
        options?: { resubscribe?: boolean; preCheck?: () => boolean | Promise<boolean> }
      ) => {
        if (session.hass.connection?.subscribeMessage) {
          return session.hass.connection.subscribeMessage(callback, subscribeMessage, options);
        }

        return Promise.reject(new Error('Home Assistant panel connection cannot subscribe'));
      },
    } as unknown as Connection;
    this.connectionBridge = { session, connection };
    return connection;
  }

  async callService(
    domain: string,
    service: string,
    serviceData: Record<string, unknown> = {},
    target?: {
      entity_id?: string | string[];
      area_id?: string | string[];
      device_id?: string | string[];
    }
  ): Promise<void> {
    const normalizedServiceData = { ...serviceData };

    if (target?.entity_id && normalizedServiceData.entity_id === undefined) {
      normalizedServiceData.entity_id = target.entity_id;
    }
    if (target?.area_id && normalizedServiceData.area_id === undefined) {
      normalizedServiceData.area_id = target.area_id;
    }
    if (target?.device_id && normalizedServiceData.device_id === undefined) {
      normalizedServiceData.device_id = target.device_id;
    }

    await this.hass.callService(domain, service, normalizedServiceData, target);
  }

  async callApi<T = unknown>(
    method: string,
    path: string,
    parameters?: Record<string, unknown>
  ): Promise<T> {
    const normalizedPath = path.replace(/^\/?api\//, '').replace(/^\//, '');
    if (this.hass.callApi) {
      return await this.hass.callApi<T>(method, normalizedPath, parameters);
    }

    throw new Error('Home Assistant panel REST requests require the authenticated hass API bridge');
  }

  async loadRegistries(): Promise<{
    areas: HomeAssistantAreaRegistryEntry[];
    devices: HomeAssistantDeviceRegistryEntry[];
    entities: HomeAssistantEntityRegistryEntry[];
    automationCategories: HomeAssistantCategoryRegistryEntry[];
  }> {
    const [areas, devices, entities, automationCategories] = await Promise.all([
      this.hass.callWS<HomeAssistantAreaRegistryEntry[]>({ type: 'config/area_registry/list' }),
      this.hass.callWS<HomeAssistantDeviceRegistryEntry[]>({ type: 'config/device_registry/list' }),
      this.hass.callWS<HomeAssistantEntityRegistryEntry[]>({ type: 'config/entity_registry/list' }),
      this.hass.callWS<HomeAssistantCategoryRegistryEntry[]>({
        type: 'config/category_registry/list',
        scope: 'automation',
      }),
    ]);

    return { areas, devices, entities, automationCategories };
  }
}
