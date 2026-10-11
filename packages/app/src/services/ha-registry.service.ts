import type { Connection } from 'home-assistant-js-websocket';

import type {
  HomeAssistantAreaRegistryEntry,
  HomeAssistantCategoryRegistryEntry,
  HomeAssistantDeviceRegistryEntry,
  HomeAssistantEntityRegistryEntry,
} from './home-assistant.service';

/**
 * Manages Home Assistant registry operations (areas, devices, entities).
 * Handles CRUD operations and registry synchronization.
 */
class HARegistryService {
  private areas: HomeAssistantAreaRegistryEntry[] = [];
  private deviceRegistry: HomeAssistantDeviceRegistryEntry[] = [];
  private entityRegistry: HomeAssistantEntityRegistryEntry[] = [];
  private automationCategories: HomeAssistantCategoryRegistryEntry[] = [];
  private pendingRegistryLoad = false;
  private loadPromise: Promise<void> | null = null;
  private loadGeneration = 0;

  resetRegistriesForSession(): void {
    this.loadGeneration += 1;
    this.loadPromise = null;
    this.pendingRegistryLoad = false;
    this.areas = [];
    this.deviceRegistry = [];
    this.entityRegistry = [];
    this.automationCategories = [];
  }

  constructor(private connection: () => Connection | null) {}

  /**
   * Load all registries from Home Assistant
   */
  loadRegistries(): Promise<void> {
    if (this.loadPromise) {
      this.pendingRegistryLoad = true;
      return this.loadPromise;
    }
    const generation = this.loadGeneration;
    const loadPromise = (async () => {
      do {
        this.pendingRegistryLoad = false;
        await this.loadRegistrySnapshot();
      } while (generation === this.loadGeneration && this.pendingRegistryLoad);
    })().finally(() => {
      if (this.loadPromise === loadPromise) this.loadPromise = null;
    });
    this.loadPromise = loadPromise;
    return loadPromise;
  }

  private async loadRegistrySnapshot(): Promise<void> {
    const generation = this.loadGeneration;
    const conn = this.connection();
    if (!conn) {
      return;
    }

    try {
      const [areas, devices, entities, automationCategories] = await Promise.all([
        conn.sendMessagePromise({
          type: 'config/area_registry/list',
        }) as Promise<HomeAssistantAreaRegistryEntry[]>,
        conn.sendMessagePromise({
          type: 'config/device_registry/list',
        }) as Promise<HomeAssistantDeviceRegistryEntry[]>,
        conn.sendMessagePromise({
          type: 'config/entity_registry/list',
        }) as Promise<HomeAssistantEntityRegistryEntry[]>,
        conn
          .sendMessagePromise({
            type: 'config/category_registry/list',
            scope: 'automation',
          })
          .catch(() => this.automationCategories) as Promise<HomeAssistantCategoryRegistryEntry[]>,
      ]);

      if (generation !== this.loadGeneration) return;
      this.areas = areas;
      this.deviceRegistry = devices;
      this.entityRegistry = entities;
      this.automationCategories = automationCategories;
    } catch (error) {
      console.error('[HARegistryService] Failed to load registries:', error);
      // Keep the last useful snapshot until the next successful refresh.
    }
  }

  getAreas(): HomeAssistantAreaRegistryEntry[] {
    return this.areas;
  }

  getDeviceRegistry(): HomeAssistantDeviceRegistryEntry[] {
    return this.deviceRegistry;
  }

  getEntityRegistry(): HomeAssistantEntityRegistryEntry[] {
    return this.entityRegistry;
  }

  getAutomationCategories(): HomeAssistantCategoryRegistryEntry[] {
    return this.automationCategories;
  }

  replaceRegistries(
    areas: HomeAssistantAreaRegistryEntry[],
    devices: HomeAssistantDeviceRegistryEntry[],
    entities: HomeAssistantEntityRegistryEntry[],
    automationCategories: HomeAssistantCategoryRegistryEntry[]
  ): void {
    this.areas = areas;
    this.deviceRegistry = devices;
    this.entityRegistry = entities;
    this.automationCategories = automationCategories;
  }

  /**
   * Update entity area assignment
   */
  async updateEntityArea(entityId: string, areaId: string | null): Promise<void> {
    const conn = this.connection();
    if (!conn) {
      throw new Error('Home Assistant is not connected');
    }

    const entityEntry = this.entityRegistry.find((entry) => entry.entity_id === entityId);
    const deviceId = entityEntry?.device_id;
    const entityAreaId = entityEntry?.area_id;

    const tryEntityUpdate = async () => {
      try {
        await conn.sendMessagePromise({
          type: 'config/entity_registry/update',
          entity_id: entityId,
          area_id: areaId,
        });
      } catch (error) {
        throw new Error(`entity registry update failed: ${this.getUnknownErrorMessage(error)}`);
      }
    };

    const tryDeviceUpdate = async () => {
      if (!deviceId) {
        throw new Error(`No device registry entry found for ${entityId}`);
      }

      try {
        await conn.sendMessagePromise({
          type: 'config/device_registry/update',
          device_id: deviceId,
          area_id: areaId,
        });
      } catch (error) {
        throw new Error(`device registry update failed: ${this.getUnknownErrorMessage(error)}`);
      }
    };

    // Prefer updating whichever registry currently owns the room assignment
    if (entityAreaId) {
      try {
        await tryEntityUpdate();
      } catch (entityError) {
        try {
          await tryDeviceUpdate();
        } catch (deviceError) {
          throw new Error(
            `entity-first update failed: ${this.getUnknownErrorMessage(entityError)}; fallback device update failed: ${this.getUnknownErrorMessage(deviceError)}`
          );
        }
      }
    } else if (deviceId) {
      try {
        await tryDeviceUpdate();
      } catch (deviceError) {
        try {
          await tryEntityUpdate();
        } catch (entityError) {
          throw new Error(
            `device-first update failed: ${this.getUnknownErrorMessage(deviceError)}; fallback entity update failed: ${this.getUnknownErrorMessage(entityError)}`
          );
        }
      }
    } else {
      await tryEntityUpdate();
    }

    await this.loadRegistries();
  }

  /**
   * Update the user-facing entity name in Home Assistant's entity registry.
   */
  async updateEntityName(entityId: string, name: string): Promise<void> {
    const conn = this.connection();
    if (!conn) {
      throw new Error('Home Assistant is not connected');
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Entity name is required');
    }

    try {
      await conn.sendMessagePromise({
        type: 'config/entity_registry/update',
        entity_id: entityId,
        name: trimmedName,
      });
    } catch (error) {
      throw new Error(`entity registry name update failed: ${this.getUnknownErrorMessage(error)}`);
    }

    await this.loadRegistries();
  }

  /**
   * Create a new area
   */
  async createArea(name: string): Promise<HomeAssistantAreaRegistryEntry> {
    const conn = this.connection();
    if (!conn) {
      throw new Error('Home Assistant is not connected');
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Room name is required');
    }

    const existingArea = this.areas.find(
      (area) => area.name.localeCompare(trimmedName, undefined, { sensitivity: 'accent' }) === 0
    );
    if (existingArea) {
      return existingArea;
    }

    let createdArea: HomeAssistantAreaRegistryEntry;
    try {
      createdArea = (await conn.sendMessagePromise({
        type: 'config/area_registry/create',
        name: trimmedName,
      })) as HomeAssistantAreaRegistryEntry;
    } catch (error) {
      throw new Error(`area registry create failed: ${this.getUnknownErrorMessage(error)}`);
    }

    await this.loadRegistries();
    return createdArea;
  }

  /**
   * Update an area's user-facing name.
   */
  async updateAreaName(areaId: string, name: string): Promise<HomeAssistantAreaRegistryEntry> {
    const conn = this.connection();
    if (!conn) {
      throw new Error('Home Assistant is not connected');
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Room name is required');
    }

    let updatedArea: HomeAssistantAreaRegistryEntry;
    try {
      updatedArea = (await conn.sendMessagePromise({
        type: 'config/area_registry/update',
        area_id: areaId,
        name: trimmedName,
      })) as HomeAssistantAreaRegistryEntry;
    } catch (error) {
      throw new Error(`area registry update failed: ${this.getUnknownErrorMessage(error)}`);
    }

    await this.loadRegistries();
    return updatedArea;
  }

  /**
   * Delete an area
   */
  async deleteArea(areaId: string): Promise<void> {
    const conn = this.connection();
    if (!conn) {
      throw new Error('Home Assistant is not connected');
    }

    try {
      await conn.sendMessagePromise({
        type: 'config/area_registry/delete',
        area_id: areaId,
      });
    } catch (error) {
      throw new Error(`area registry delete failed: ${this.getUnknownErrorMessage(error)}`);
    }

    await this.loadRegistries();
  }

  private getUnknownErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    if (typeof error === 'string' && error.trim().length > 0) {
      return error;
    }

    if (error && typeof error === 'object') {
      const message =
        'message' in error && typeof error.message === 'string' ? error.message : null;
      const code = 'code' in error ? String(error.code) : null;

      if (message && code) {
        return `${message} (${code})`;
      }

      if (message) {
        return message;
      }

      try {
        return JSON.stringify(error);
      } catch {
        return 'unknown error';
      }
    }

    return 'unknown error';
  }
}

export default HARegistryService;
