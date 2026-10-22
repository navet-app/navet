import { useDashboardProfileRuntimeStore } from '@navet/app/features/dashboard/clients/dashboard-profile-runtime-store';
import {
  createDashboardDefinition,
  createLegacyDashboardCollection,
  sanitizeDashboardCollection,
} from '@navet/app/features/dashboard/dashboards/dashboard-collection';
import { useDashboardCollectionStore } from '@navet/app/features/dashboard/dashboards/dashboard-collection-store';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { useSettingsSectionController } from '../hooks/use-settings-section-controller';
import { SettingsDashboardSection } from './settings-dashboard-section';

function DashboardStory() {
  const controller = useSettingsSectionController();
  return (
    <div className="h-full min-w-0 overflow-x-hidden overflow-y-auto px-3 py-3 md:px-6 md:py-6">
      <div className="mx-auto w-full max-w-4xl">
        <SettingsDashboardSection controller={controller} />
      </div>
    </div>
  );
}

function MultipleDashboardStory() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const previous = useDashboardCollectionStore.getState();
    const home = createDashboardDefinition({ id: 'home', name: 'Home' });
    const upstairs = createDashboardDefinition({
      id: 'upstairs',
      name: 'Upstairs lights',
      source: {
        kind: 'rooms',
        roomNames: ['Bedroom', 'Hallway'],
        include: 'lights',
        devices: [
          { id: '0:light.bedroom', room: 'Bedroom', type: 'lights', size: 'small' },
          { id: '0:light.hallway', room: 'Hallway', type: 'lights', size: 'small' },
        ],
      },
    });
    const family = createDashboardDefinition({ id: 'family', name: 'Family overview' });
    useDashboardCollectionStore.setState({
      collection: sanitizeDashboardCollection(
        {
          schemaVersion: 1,
          defaultDashboardId: 'home',
          order: ['home', 'upstairs', 'family'],
          dashboardsById: { home, upstairs, family },
          dashboardIdByClientId: {
            'sonoff-upstairs': 'upstairs',
            'kitchen-tablet': 'family',
          },
        },
        createLegacyDashboardCollection({ homeLayout: null })
      ),
      activeDashboardId: 'home',
    });
    const now = new Date().toISOString();
    useDashboardProfileRuntimeStore.getState().setClients([
      {
        id: 'sonoff-upstairs',
        name: 'Sonoff upstairs',
        kind: 'wall_panel',
        firstSeenAt: now,
        lastSeenAt: now,
        lastRevision: 4,
      },
      {
        id: 'kitchen-tablet',
        name: 'Kitchen tablet',
        kind: 'tablet',
        firstSeenAt: now,
        lastSeenAt: now,
        lastRevision: 4,
      },
    ]);
    setReady(true);

    return () => {
      useDashboardCollectionStore.setState({
        collection: previous.collection,
        activeDashboardId: previous.activeDashboardId,
        activeSource: previous.activeSource,
        pendingAssignedDashboardId: previous.pendingAssignedDashboardId,
        layoutHistory: previous.layoutHistory,
      });
      useDashboardProfileRuntimeStore.getState().reset();
    };
  }, []);

  return ready ? <DashboardStory /> : null;
}

const meta = {
  title: 'Pages/Settings/Dashboard',
  component: DashboardStory,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Dashboard settings grouped by task: dashboard management, shared content, hidden entities, and setup.',
      },
    },
  },
} satisfies Meta<typeof DashboardStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mobile: Story = {
  globals: {
    viewport: {
      value: 'mobile1',
      isRotated: false,
    },
  },
};

export const MultipleDashboards: Story = {
  render: () => <MultipleDashboardStory />,
};
