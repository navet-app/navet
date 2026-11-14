import { RoomNav } from '@navet/app/components/layout/room-nav';
import type { RoomNavigationGroup } from '@navet/app/components/layout/room-nav.utils';
import {
  createDashboardDefinition,
  createLegacyDashboardCollection,
  sanitizeDashboardCollection,
} from '@navet/app/features/dashboard/dashboards/dashboard-collection';
import { useDashboardCollectionStore } from '@navet/app/features/dashboard/dashboards/dashboard-collection-store';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

const DEFAULT_ROOMS = ['Living Room', 'Kitchen', 'Bedroom', 'Office'];
const UPSTAIRS_GROUP: RoomNavigationGroup = {
  id: 'upstairs',
  name: 'Upstairs',
  symbol: 'Layers3',
  rooms: ['Living Room', 'Guest Room', 'Office'],
};
const MANY_ROOMS = [
  'Living Room',
  'Kitchen',
  'Bedroom',
  'Office',
  'Dining Room',
  'Hallway',
  'Laundry',
  'Guest Room',
  'Nursery',
  'Garage',
  'Patio',
  'Studio',
  'Basement',
  'Loft',
];

function RoomNavStory({
  isEditMode = false,
  rooms = DEFAULT_ROOMS,
  groups = [],
  initialActiveRoom = 'All',
}: {
  isEditMode?: boolean;
  rooms?: string[];
  groups?: RoomNavigationGroup[];
  initialActiveRoom?: string;
}) {
  const [activeRoom, setActiveRoom] = useState(initialActiveRoom);
  const [editMode, setEditMode] = useState(isEditMode);

  return (
    <RoomNav
      rooms={rooms}
      roomGroups={groups}
      activeRoom={activeRoom}
      onRoomChange={setActiveRoom}
      allViewGrouping="custom"
      isEditMode={editMode}
      onAllViewGroupingChange={() => {}}
      onToggleEditMode={() => setEditMode((value) => !value)}
      onAddEntity={() => {}}
      addEntityLabel="Add card"
    />
  );
}

function MultipleDashboardsStory() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const previous = useDashboardCollectionStore.getState();
    const home = createDashboardDefinition({ id: 'home', name: 'Home' });
    const upstairs = createDashboardDefinition({ id: 'upstairs', name: 'Upstairs lights' });
    useDashboardCollectionStore.setState({
      collection: sanitizeDashboardCollection(
        {
          schemaVersion: 1,
          defaultDashboardId: 'home',
          order: ['home', 'upstairs'],
          dashboardsById: { home, upstairs },
          dashboardIdByClientId: {},
        },
        createLegacyDashboardCollection({ homeLayout: null })
      ),
      activeDashboardId: 'upstairs',
      activeSource: 'preview',
      pendingAssignedDashboardId: null,
      layoutHistory: { future: [], past: [] },
    });
    setReady(true);

    return () => {
      useDashboardCollectionStore.setState({
        collection: previous.collection,
        activeDashboardId: previous.activeDashboardId,
        activeSource: previous.activeSource,
        pendingAssignedDashboardId: previous.pendingAssignedDashboardId,
        layoutHistory: previous.layoutHistory,
      });
    };
  }, []);

  return ready ? (
    <RoomNavStory
      rooms={['Living Room', 'Kitchen', 'Guest Room', 'Office']}
      groups={[UPSTAIRS_GROUP]}
      initialActiveRoom="Living Room"
    />
  ) : null;
}

const meta = {
  title: 'App Shell/Navigation/Room Nav',
  component: RoomNavStory,
  tags: ['autodocs'],
  args: {
    isEditMode: false,
  },
  parameters: { docs: { description: {} } },
} satisfies Meta<typeof RoomNavStory>;

const richComponentDocsDescription = getStoryDocsDescription(meta.title);

meta.parameters = {
  ...meta.parameters,
  docs: {
    ...meta.parameters?.docs,
    description: {
      ...meta.parameters?.docs?.description,
      component: richComponentDocsDescription,
    },
  },
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const GroupedRooms: Story = {
  args: {
    rooms: ['Living Room', 'Kitchen', 'Guest Room', 'Office'],
    groups: [UPSTAIRS_GROUP],
    initialActiveRoom: 'Living Room',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const upstairs = await canvas.findByRole('button', { name: 'Living Room' });

    await expect(upstairs).toHaveAttribute('aria-current', 'page');
    await expect(canvas.queryByRole('button', { name: 'Guest Room' })).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Office' })).toBeNull();

    await userEvent.click(upstairs);
    const menu = await page.findByRole('menu');
    await expect(within(menu).getByRole('menuitem', { name: 'Living Room' })).toBeVisible();
    await expect(within(menu).getByRole('menuitem', { name: 'Guest Room' })).toBeVisible();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Office' }));
    const officeDropdown = await canvas.findByRole('button', { name: 'Office' });
    await expect(officeDropdown).toHaveAttribute('aria-current', 'page');
    await userEvent.click(canvas.getByRole('button', { name: 'Kitchen' }));
    await expect(officeDropdown).not.toHaveAttribute('aria-current');
    await expect(canvas.getByRole('button', { name: 'Kitchen' })).toHaveAttribute(
      'aria-current',
      'page'
    );

    await userEvent.click(officeDropdown);
    await expect(officeDropdown).toHaveAttribute('aria-current', 'page');
    await expect(page.queryByRole('menu')).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: 'Kitchen' }));
    const chevron = officeDropdown.querySelector('[data-room-group-chevron]');
    await expect(chevron).not.toBeNull();
    await userEvent.click(chevron as Element);
    await expect(await page.findByRole('menu')).toBeVisible();
  },
};

export const NestedProviderZones: Story = {
  args: {
    rooms: [
      'Home zones',
      'Upstairs',
      'Home zones / Upstairs / Hall',
      'Downstairs',
      'Home zones / Downstairs / Hall',
    ],
    groups: [
      {
        id: 'homey:home',
        name: 'Home zones',
        rooms: [
          'Home zones',
          'Upstairs',
          'Home zones / Upstairs / Hall',
          'Downstairs',
          'Home zones / Downstairs / Hall',
        ],
        hierarchy: {
          room: 'Home zones',
          children: [
            {
              room: 'Upstairs',
              children: [{ room: 'Home zones / Upstairs / Hall', children: [] }],
            },
            {
              room: 'Downstairs',
              children: [{ room: 'Home zones / Downstairs / Hall', children: [] }],
            },
          ],
        },
      },
    ],
    initialActiveRoom: 'Home zones',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const home = canvas.getByRole('button', { name: 'Home zones', current: 'page' });
    await userEvent.click(home);
    const upstairs = await page.findByRole('menuitem', { name: 'Upstairs' });
    await userEvent.hover(upstairs);
    await userEvent.click(
      await page.findByRole('menuitem', { name: 'Home zones / Upstairs / Hall' })
    );
    await expect(home).toHaveAttribute('aria-current', 'page');
    await expect(page.queryByRole('menu')).toBeNull();
  },
};

export const EditMode: Story = {
  args: {
    isEditMode: true,
  },
};

export const ManyRooms: Story = {
  args: {
    rooms: MANY_ROOMS,
  },
};

export const MultipleDashboards: Story = {
  render: () => <MultipleDashboardsStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await expect(await canvas.findByRole('button', { name: /Upstairs lights/ })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Living Room' })).toBeVisible();
    const dashboardSwitcher = canvas.getByRole('button', { name: /Open dashboards/ });
    const dashboardChevron = dashboardSwitcher.querySelector('[data-dashboard-switcher-chevron]');
    await expect(dashboardChevron).not.toBeNull();
    await userEvent.click(dashboardChevron as Element);
    await expect(
      within(await page.findByRole('menu')).getByRole('menuitem', { name: /Home/ })
    ).toBeVisible();
  },
};

export const ManyRoomsOverflowMenu: Story = {
  args: {
    rooms: MANY_ROOMS,
  },
  render: (args) => (
    <div className="max-w-[22rem]">
      <RoomNavStory {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    const overflowButton = await canvas.findByRole('button', { name: 'Rooms' });
    await userEvent.click(overflowButton);

    await expect(await page.findByRole('menu')).toBeInTheDocument();
  },
};
