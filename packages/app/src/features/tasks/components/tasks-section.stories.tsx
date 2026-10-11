import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { createPreviewStoryScenario } from '@navet/app/preview/runtime';
import { getIntegrationProviderAdapter } from '@navet/app/services/integration-registry.service';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { type ThemeMode, useThemeStore } from '@navet/app/stores/theme-store';
import type { ProviderTodoListFeatureService } from '@navet/core/provider-feature-services';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import { TasksSection } from './tasks-section';

type TasksStoryMode = 'default' | 'empty' | 'many' | 'reconnecting' | 'low-power';

function TasksSectionStory({
  mode = 'default',
  theme = 'glass',
  withListsWorkspace = false,
}: {
  mode?: TasksStoryMode;
  theme?: ThemeMode;
  withListsWorkspace?: boolean;
}) {
  const surface = getThemeSurfaceTokens(theme);
  const [ready, setReady] = useState(!withListsWorkspace);
  useEffect(() => {
    if (!withListsWorkspace) return;
    const adapter = getIntegrationProviderAdapter('home_assistant');
    const previous = adapter.todoListFeatureService;
    const readonly = async () => {
      throw new Error('This fixture only advertises list navigation');
    };
    const service: ProviderTodoListFeatureService = {
      getLists: async () => [],
      subscribeLists: async (listener) => {
        listener([]);
        return () => {};
      },
      getItems: async () => [],
      subscribeItems: async (_listId, listener) => {
        listener([]);
        return () => {};
      },
      addItem: readonly,
      updateItem: readonly,
      removeItem: readonly,
    };
    adapter.todoListFeatureService = service;
    setReady(true);
    return () => {
      adapter.todoListFeatureService = previous;
    };
  }, [withListsWorkspace]);

  useEffect(() => {
    const previousSettingsState = useSettingsStore.getState();
    const previousThemeState = useThemeStore.getState();

    useThemeStore.setState({
      ...previousThemeState,
      theme,
      followSystemTheme: false,
      wallpaper: null,
    });

    if (mode === 'low-power') {
      useSettingsStore.setState({
        ...previousSettingsState,
        effectsQuality: 'low',
        lowPowerMode: true,
      });
    }

    return () => {
      useSettingsStore.setState(previousSettingsState);
      useThemeStore.setState(previousThemeState);
    };
  }, [mode, theme]);

  return (
    <div
      className={`h-full min-w-0 overflow-x-hidden overflow-y-auto p-3 md:p-6 ${surface.appBg}`}
      style={withListsWorkspace ? { height: 420 } : undefined}
    >
      {ready ? <TasksSection /> : null}
    </div>
  );
}

const meta = {
  title: 'Pages/Tasks/Routines',
  component: TasksSectionStory,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Read-only routine surface for automations, scenes, and scripts, ' +
          'with automation enablement controls.',
      },
    },
  },
} satisfies Meta<typeof TasksSectionStory>;

export default meta;

type Story = StoryObj<typeof meta>;

const defaultScenario = createPreviewStoryScenario();
const automationStoryEntities = defaultScenario.taskRuntime.entities ?? {};
const recentLastTriggered = new Date(Date.now() - 42 * 60 * 1000).toISOString();

function createTasksScenario({
  entities,
  entityReferences = [],
}: {
  entities: NonNullable<typeof defaultScenario.taskRuntime.entities>;
  entityReferences?: typeof defaultScenario.taskRuntime.entityReferences;
}) {
  const scenario = createPreviewStoryScenario();

  return {
    ...scenario,
    taskRuntime: {
      ...scenario.taskRuntime,
      entities: {
        ...(scenario.taskRuntime.entities ?? {}),
        ...entities,
      },
      entityReferences: [...scenario.taskRuntime.entityReferences, ...entityReferences],
    },
  };
}

export const Desktop: Story = {};

export const TabletPortrait: Story = {
  args: { mode: 'default' },
  globals: {
    viewport: {
      value: 'tablet',
      isRotated: false,
    },
  },
};

export const Mobile: Story = {
  args: { mode: 'default' },
  globals: {
    viewport: {
      value: 'mobile1',
      isRotated: false,
    },
  },
};

export const CompactAutomationRows: Story = {
  args: { mode: 'default' },
  parameters: {
    previewRuntime: {
      scenario: createTasksScenario({
        entities: {
          'automation.power_spike': {
            entityId: 'automation.power_spike',
            state: 'on',
            name: 'High power usage alert',
            attributes: {
              last_triggered: recentLastTriggered,
              mode: 'single',
              current: 0,
              trigger: {
                platform: 'numeric_state',
                entity_id: 'sensor.energy_meter_instantaneous_demand',
                above: 8000,
              },
              action: {
                service: 'notify.mobile_app',
                data: { message: 'Power spike' },
              },
            },
          },
          'automation.sunset': {
            entityId: 'automation.sunset',
            state: 'on',
            name: 'Sunset',
            attributes: {
              last_triggered: '2026-07-03T21:55:00.000Z',
              mode: 'restart',
              current: 0,
              trigger: { platform: 'sun', event: 'sunset' },
              action: {
                service: 'light.turn_on',
                target: { entity_id: 'light.living_room' },
              },
            },
          },
        },
        entityReferences: [
          { entityId: 'automation.power_spike', roomId: 'kitchen', deviceId: 'device-kitchen' },
          { entityId: 'automation.sunset', roomId: 'living-room', deviceId: 'device-living-room' },
        ],
      }),
    },
  },
};

export const AccordionDetails: Story = {
  args: { mode: 'default' },
  parameters: {
    previewRuntime: {
      scenario: createTasksScenario({
        entities: {
          'automation.detail_only': {
            entityId: 'automation.detail_only',
            state: 'on',
            name: 'Detail-only automation',
            attributes: {
              last_triggered: recentLastTriggered,
              trigger: { platform: 'time', at: '07:00:00' },
              condition: { condition: 'state', entity_id: 'sun.sun', state: 'below_horizon' },
              action: {
                service: 'light.turn_on',
                target: { entity_id: ['light.kitchen', 'light.living_room'] },
              },
            },
          },
        },
        entityReferences: [
          { entityId: 'automation.detail_only', roomId: 'kitchen', deviceId: 'device-kitchen' },
        ],
      }),
    },
  },
  play: async ({ canvas, userEvent, step }) => {
    await step('reveals and hides the routine detail sequence', async () => {
      const automationRow = canvas.getByText('Detail-only automation').closest('article');
      await expect(automationRow).not.toBeNull();
      const row = within(automationRow as HTMLElement);
      await expect(row.queryByRole('heading', { name: 'When' })).not.toBeInTheDocument();
      await userEvent.click(row.getByRole('button', { name: 'View' }));
      await expect(await row.findByRole('heading', { name: 'When' })).toBeInTheDocument();
      await expect(row.getByRole('heading', { name: 'If' })).toBeInTheDocument();
      await expect(row.getByRole('heading', { name: 'Then' })).toBeInTheDocument();
      await userEvent.click(row.getByRole('button', { name: 'Hide' }));
      await expect(row.queryByRole('heading', { name: 'When' })).not.toBeInTheDocument();
    });
  },
};

export const ScriptsList: Story = {
  args: { mode: 'default' },
  parameters: {
    previewRuntime: {
      scenario: createTasksScenario({
        entities: {
          'script.feed_mowgli': {
            entityId: 'script.feed_mowgli',
            state: 'off',
            name: 'Feed Mowgli',
            attributes: {},
          },
          'script.stop_all_music': {
            entityId: 'script.stop_all_music',
            state: 'off',
            name: 'Stop all music',
            attributes: {},
          },
        },
        entityReferences: [
          { entityId: 'script.feed_mowgli', roomId: 'kitchen', deviceId: 'device-kitchen' },
          {
            entityId: 'script.stop_all_music',
            roomId: 'living-room',
            deviceId: 'device-living-room',
          },
        ],
      }),
    },
  },
  play: async ({ canvas, userEvent, step }) => {
    await step('opens the scripts list without per-item type tags', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /quick actions/i }));
      await expect(canvas.getByText('Feed Mowgli')).toBeInTheDocument();
      await expect(canvas.getByText('Stop all music')).toBeInTheDocument();
      await expect(canvas.getByRole('button', { name: 'Run Feed Mowgli' })).toBeInTheDocument();
    });
  },
};

export const Empty: Story = {
  args: { mode: 'empty' },
  parameters: {
    previewRuntime: {
      scenario: {
        ...createPreviewStoryScenario(),
        taskRuntime: {
          ...createPreviewStoryScenario().taskRuntime,
          entities: {},
        },
      },
    },
  },
};

export const Reconnecting: Story = {
  args: { mode: 'reconnecting' },
  parameters: {
    previewRuntime: {
      scenario: {
        ...createPreviewStoryScenario(),
        homeAssistant: {
          ...createPreviewStoryScenario().homeAssistant,
          connected: false,
          reconnecting: true,
        },
      },
    },
  },
};

export const ManyRoutines: Story = {
  args: { mode: 'many', withListsWorkspace: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const navigation = await canvas.findByRole('navigation', { name: 'Tasks workspace' });
    const workspace = navigation.parentElement;
    const routines = await canvas.findByRole('main');
    await waitFor(() => expect(routines.scrollHeight).toBeGreaterThan(routines.clientHeight));
    const scrollers: HTMLElement[] = [];
    for (let element: HTMLElement | null = routines; element; element = element.parentElement) {
      if (
        element.scrollHeight > element.clientHeight + 1 &&
        ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)
      )
        scrollers.push(element);
      if (element === workspace) break;
    }
    await expect(scrollers).toHaveLength(1);
    const navigationTop = navigation.getBoundingClientRect().top;
    routines.scrollTop = routines.scrollHeight;
    await expect(routines.scrollTop).toBeGreaterThan(0);
    await expect(navigation.getBoundingClientRect().top).toBe(navigationTop);
  },
  parameters: {
    previewRuntime: {
      scenario: {
        ...defaultScenario,
        taskRuntime: {
          ...defaultScenario.taskRuntime,
          entities: {
            ...automationStoryEntities,
            'scene.cleaning': {
              entityId: 'scene.cleaning',
              state: 'scening',
              name: 'Cleaning',
              attributes: {},
            },
            'automation.vacation': {
              entityId: 'automation.vacation',
              state: 'off',
              name: 'Vacation',
              attributes: {
                description: 'Keeps the home steady.',
                mode: 'single',
              },
            },
            'automation.leaving': {
              entityId: 'automation.leaving',
              state: 'on',
              name: 'Leaving Home',
              attributes: {
                mode: 'single',
                last_triggered: new Date().toISOString(),
                next_run: '2026-05-04T19:15:00.000Z',
              },
            },
            'automation.garden_lights': {
              entityId: 'automation.garden_lights',
              state: 'unavailable',
              name: 'Garden lights',
              attributes: {
                description: 'Turns on garden lights after dusk.',
                mode: 'restart',
              },
            },
          },
        },
      },
    },
  },
};

export const AttentionStates: Story = {
  args: { mode: 'many' },
  parameters: {
    previewRuntime: {
      scenario: {
        ...defaultScenario,
        taskRuntime: {
          ...defaultScenario.taskRuntime,
          entities: {
            ...automationStoryEntities,
            'automation.unavailable': {
              entityId: 'automation.unavailable',
              state: 'unavailable',
              name: 'Garage arrival lights',
              attributes: {
                description: 'Turns on the garage lights when someone arrives.',
              },
            },
            'automation.failed': {
              entityId: 'automation.failed',
              state: 'failed',
              name: 'Watering schedule',
              attributes: {
                description: 'Keeps the greenhouse watering schedule active.',
              },
            },
          },
        },
      },
    },
  },
};

export const DisabledRoutines: Story = {
  args: { mode: 'many' },
  parameters: {
    previewRuntime: {
      scenario: {
        ...defaultScenario,
        taskRuntime: {
          ...defaultScenario.taskRuntime,
          entities: {
            ...automationStoryEntities,
            'automation.sleeping_children': {
              entityId: 'automation.sleeping_children',
              state: 'off',
              name: 'Children asleep',
              attributes: {
                description: 'Pauses noisy notifications during bedtime.',
                mode: 'single',
              },
            },
            'automation.guest_mode': {
              entityId: 'automation.guest_mode',
              state: 'off',
              name: 'Guest mode',
              attributes: {
                description: 'Keeps guest areas comfortable while visitors are home.',
                mode: 'restart',
              },
            },
          },
        },
      },
    },
  },
};

export const LowPower: Story = {
  args: { mode: 'low-power' },
};

export const LightTheme: Story = {
  args: { theme: 'light' },
};

export const BlackTheme: Story = {
  args: { theme: 'black' },
};
