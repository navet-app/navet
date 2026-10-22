import { RoomNav } from '@navet/app/components/layout/room-nav';
import { Sidebar } from '@navet/app/components/layout/sidebar';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { getDeviceTypeIcon } from '@navet/app/constants/device-type-icons';
import { DemoChoreWorkspace } from '@navet/app/demo/demo-chore-workspace';
import { CompanionAddCardDialog } from '@navet/app/features/dashboard/companion/companion-editor';
import { CompanionEntityRow } from '@navet/app/features/dashboard/companion/companion-entity-row';
import { CompanionRowLoading } from '@navet/app/features/dashboard/companion/companion-row-loading';
import { useDashboardCollectionStore } from '@navet/app/features/dashboard/dashboards/dashboard-collection-store';
import { useRoomWorkspaceStore } from '@navet/app/features/dashboard/rooms/room-workspace-store';
import {
  createEmptyRoomWorkspaceV2,
  createNavetRoomWorkspaceRoomV2,
} from '@navet/app/features/dashboard/rooms/room-workspace-v2';
import { DashboardLayout } from '@navet/app/features/dashboard/shell';
import { useTheme } from '@navet/app/hooks';
import { getPreviewRuntimeScenario } from '@navet/app/preview/runtime';
import { useNavigationStore } from '@navet/app/stores/navigation-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

function SidebarStory() {
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <div className={`min-h-screen ${surface.appBg}`}>
      <Sidebar
        isMobileSearchOpen={searchOpen}
        isSearchActive={Boolean(query)}
        isSearchFocused={focused}
        searchQuery={query}
        handleSearchChange={setQuery}
        handleClearSearch={() => setQuery('')}
        handleToggleMobileSearch={() => setSearchOpen((open) => !open)}
        setIsSearchFocused={setFocused}
      />
      <div className="pl-16 md:pl-16">
        <div className="min-h-screen px-8 py-8">
          <div
            className={`mx-auto max-w-5xl rounded-[32px] border p-8 ${surface.panel} ${surface.border}`}
          >
            <div className="space-y-3">
              <h1 className={`text-2xl font-semibold ${surface.textPrimary}`}>Dashboard shell</h1>
              <p className={`max-w-2xl text-sm ${surface.textSecondary}`}>
                Sidebar navigation should feel like a stable app shell control, not a generic
                picker.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: 'App Shell/Navigation/Sidebar',
  component: SidebarStory,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Primary app sidebar and mobile bottom navigation for section switching.',
      },
    },
  },
} satisfies Meta<typeof SidebarStory>;

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

export const Docs: Story = {
  parameters: {
    docsOnly: true,
  },
};

// Same-family references: app-shell-navigation-sidebar--default and app-shell-header-topbar--default.
// Companion editing extends this composition; header actions use app-shell-header-header-actions--desktop.
// Device content reuses cards-entity-light--small and the existing small card family.
// Spacious landscape screens add the companion; other sizes retain the original header and navigation.
function UnifiedSidebarStory({
  collapsed = false,
  roomPanel,
}: {
  collapsed?: boolean;
  roomPanel?: 'inherited' | 'custom' | 'empty';
}) {
  const [editing, setEditing] = useState(Boolean(roomPanel));
  const currentRoom = useNavigationStore((state) => state.currentRoom);
  useEffect(() => {
    const previous = useSettingsStore.getState().companionCollapsed;
    const collection = useDashboardCollectionStore.getState();
    const dashboardId = collection.activeDashboardId;
    const companion = collection.collection.dashboardsById[dashboardId]?.companion;
    const previousWorkspace = useRoomWorkspaceStore.getState().workspace;
    const previousNavigation = useNavigationStore.getState();
    if (roomPanel) {
      const { workspace, roomId } = createNavetRoomWorkspaceRoomV2(createEmptyRoomWorkspaceV2(), {
        displayName: 'Kitchen',
      });
      useRoomWorkspaceStore.setState({ workspace });
      useNavigationStore.setState({
        currentRoom: 'Kitchen',
        currentRoomId: roomId,
        activeSection: 'home',
        activeCustomSidebarActionId: null,
      });
      collection.updateCompanion(dashboardId, {
        showSecurity: false,
        cards: [{ id: 'common-note', type: 'note', text: 'Leave the keys by the door.' }],
      });
      if (roomId)
        collection.updateRoomCompanion(
          dashboardId,
          roomId,
          roomPanel === 'inherited'
            ? null
            : {
                showSecurity: false,
                cards:
                  roomPanel === 'empty'
                    ? []
                    : [
                        {
                          id: 'room-note',
                          type: 'note',
                          text: 'Open the kitchen window after cooking.',
                        },
                      ],
              }
        );
    }
    useSettingsStore.getState().updateSettings({ companionCollapsed: collapsed });
    return () => {
      useSettingsStore.getState().updateSettings({ companionCollapsed: previous });
      if (roomPanel) {
        useDashboardCollectionStore.setState({ collection: collection.collection });
        useRoomWorkspaceStore.setState({ workspace: previousWorkspace });
        useNavigationStore.setState(previousNavigation);
      } else if (companion)
        useDashboardCollectionStore.getState().updateCompanion(dashboardId, companion);
    };
  }, [collapsed, roomPanel]);
  return (
    <DashboardLayout
      mobileEditActions={{
        isEditMode: editing,
        onToggleEditMode: () => setEditing((value) => !value),
      }}
    >
      <RoomNav
        rooms={['Living Room', 'Kitchen']}
        activeRoom={currentRoom}
        onRoomChange={(room) =>
          useNavigationStore.getState().setCurrentRoom(room, {
            roomId:
              useRoomWorkspaceStore
                .getState()
                .workspace?.rooms.find((item) => item.displayName === room)?.id ?? null,
          })
        }
        isEditMode={editing}
        onToggleEditMode={() => setEditing((value) => !value)}
        showCustomizeButton={false}
      />
      <h2 className="text-xl font-medium">{currentRoom === 'All' ? 'Home' : currentRoom}</h2>
      <p>Rooms use the dashboard panel unless a custom room panel is selected.</p>
      <div className="grid grid-cols-2 gap-4">
        {[
          'Kitchen island · 72%',
          'Main floor · 21°C',
          'Living room speaker · Morning mix',
          'Front door · Locked',
        ].map((label) => (
          <div key={label} className="rounded-2xl border border-current/10 p-6">
            {label}
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}

export const ExpandedCompanion: Story = {
  render: () => <UnifiedSidebarStory />,
  parameters: { viewport: { value: 'desktop' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const collapse = await canvas.findByRole('button', { name: 'Hide side panel' });
    await userEvent.click(collapse);
    const expand = await canvas.findByRole('button', { name: 'Show side panel' });
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByRole('region', { name: 'Side panel' })).not.toBeInTheDocument();
    await userEvent.click(expand);
    await expect(await canvas.findByRole('region', { name: 'Side panel' })).toBeVisible();
  },
};

export const CollapsedCompanion: Story = { render: () => <UnifiedSidebarStory collapsed /> };

export const CompanionLoadingRows: Story = {
  render: () => (
    <div className="w-80 space-y-2 p-6">
      <CompanionRowLoading name="Kitchen light" icon={getDeviceTypeIcon('light')} />
      <CompanionRowLoading name="Thermostat" icon={getDeviceTypeIcon('climate')} />
      <CompanionRowLoading name="Front door" icon={getDeviceTypeIcon('lock')} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rows = canvas.getAllByRole('status');
    await expect(rows).toHaveLength(3);
    for (const row of rows) await expect(row).toHaveAttribute('aria-busy', 'true');
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

// Exercises the expanded hit area of the shared compact entity-row presentation.
export const CompanionRowHitArea: Story = {
  render: () => {
    const entity = getPreviewRuntimeScenario('demo').entities.find(
      (item) => item.externalId === 'light.kitchen_island'
    );
    if (!entity) throw new Error('Missing preview light');
    return (
      <div className="w-80 p-6">
        <CompanionEntityRow entity={entity} editing={false} />
      </div>
    );
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const opener = await canvas.findByRole('button', { name: /^Open settings for Kitchen island/ });
    const row = opener.closest('[data-light-table-row]');
    if (!row) throw new Error('Missing companion row');
    const rect = row.getBoundingClientRect();
    const hit = canvasElement.ownerDocument.elementFromPoint(
      rect.right - 2,
      rect.top + rect.height / 2
    );
    await expect(hit).toBe(opener);
    if (!hit) throw new Error('Missing row gutter hit target');
    await userEvent.click(hit);
    await expect(await within(canvasElement.ownerDocument.body).findByRole('dialog')).toBeVisible();
  },
};

export const CompanionEditor: Story = {
  render: () => <UnifiedSidebarStory />,
  parameters: { viewport: { value: 'desktop' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Customize' }));
    await expect(canvas.getByRole('button', { name: 'Add item' })).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'More actions: Clock and date' })
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Customize' })).toBeVisible();
  },
};

// Extends app-shell-navigation-sidebar--companion-editor with the existing item-menu pattern.
export const InheritedRoomPanel: Story = {
  render: () => <UnifiedSidebarStory roomPanel="inherited" />,
  parameters: { viewport: { value: 'desktop' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const scope = await canvas.findByRole('button', { name: 'Panel for Kitchen' });
    await expect(scope).toHaveTextContent('Dashboard panel');
    await expect(canvas.getByRole('button', { name: 'Add item' })).toBeVisible();
    const addItem = canvas.getByRole('button', { name: 'Add item' });
    const done = canvas.getByRole('button', { name: 'Done' });
    await expect(
      done.getBoundingClientRect().left - addItem.getBoundingClientRect().right
    ).toBeGreaterThanOrEqual(8);
    await expect(
      scope.getBoundingClientRect().top - addItem.getBoundingClientRect().bottom
    ).toBeGreaterThanOrEqual(8);
    await expect(scope.scrollWidth - scope.clientWidth).toBeLessThanOrEqual(1);
    await userEvent.click(scope);
    await userEvent.click(body.getByRole('menuitem', { name: 'Create room panel' }));
    await expect(scope).toHaveTextContent('Kitchen panel');
    await expect(canvas.getByText('Leave the keys by the door.')).toBeVisible();
    await userEvent.click(scope);
    await userEvent.click(body.getByRole('menuitemradio', { name: 'Dashboard panel' }));
    await expect(body.queryByRole('alertdialog')).not.toBeInTheDocument();
    await expect(scope).toHaveTextContent('Dashboard panel');
    await userEvent.click(scope);
    await userEvent.click(body.getByRole('menuitemradio', { name: 'Kitchen panel' }));
    await expect(scope).toHaveTextContent('Kitchen panel');
    await expect(scope).toHaveFocus();
    await userEvent.click(done);
    await expect(canvas.queryByRole('button', { name: 'Add item' })).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: 'Panel for Kitchen' })
    ).not.toBeInTheDocument();
  },
};

export const CustomRoomPanel: Story = {
  render: () => <UnifiedSidebarStory roomPanel="custom" />,
  parameters: { viewport: { value: 'desktop' } },
};

export const EmptyRoomPanel: Story = {
  render: () => <UnifiedSidebarStory roomPanel="empty" />,
  parameters: { viewport: { value: 'desktop' } },
};

// Uses components-patterns-carddialog--default for the visible editor chrome.
export const GreetingEditorDialog: Story = {
  render: () => <UnifiedSidebarStory />,
  parameters: { viewport: { value: 'desktop' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Customize' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Greeting' }));
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog', {
      name: 'Edit Greeting',
    });
    await waitFor(() =>
      expect(within(dialog).getByRole('heading', { name: 'Edit Greeting' })).toBeVisible()
    );
    await expect(within(dialog).getByRole('textbox', { name: 'Greeting' })).toBeVisible();
    await expect(within(dialog).getByRole('button', { name: 'Close' })).toBeVisible();
  },
};

export const CameraEditorDialog: Story = {
  render: () => <UnifiedSidebarStory />,
  parameters: { viewport: { value: 'desktop' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Customize' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Camera' }));
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog', {
      name: 'Edit Camera',
    });
    await waitFor(() =>
      expect(within(dialog).getByRole('heading', { name: 'Edit Camera' })).toBeVisible()
    );
    await expect(within(dialog).getByRole('combobox', { name: 'Device' })).toBeVisible();
    await expect(within(dialog).getByRole('button', { name: 'Done' })).toBeVisible();
  },
};

// Uses pages-dashboard-add-entity-dialog--default with immediate per-row Add item actions.
function BulkCompanionSourcesStory() {
  const [open, setOpen] = useState(true);
  const [addedNames, setAddedNames] = useState<string[]>([]);
  const entities = (['camera', 'weather'] as const).flatMap((type) => {
    const source = getPreviewRuntimeScenario('demo').entities.find(
      (entity) => entity.type === type
    );
    if (!source) return [];
    return ['Alpha', 'Beta'].map((name) => ({
      ...source,
      name: `${name} ${type}`,
      canonicalId: `${source.canonicalId}_${name}`,
    }));
  });
  return open ? (
    <CompanionAddCardDialog
      entities={entities}
      onClose={() => setOpen(false)}
      onAdd={(cards) => {
        setAddedNames((current) => [
          ...current,
          ...cards.map(
            (card) => entities.find((entity) => entity.canonicalId === card.entityId)?.name ?? ''
          ),
        ]);
      }}
    />
  ) : (
    <p role="status">{addedNames.join(', ')}</p>
  );
}

export const AddMultipleCameras: Story = {
  render: () => <BulkCompanionSourcesStory />,
  parameters: { viewport: { value: 'desktop' } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Add item' }));

    await userEvent.click(dialog.getByRole('button', { name: 'Add item: Alpha camera' }));
    await userEvent.type(dialog.getByPlaceholderText('Search entities'), 'Beta');
    await userEvent.click(dialog.getByRole('button', { name: 'Add item: Beta camera' }));
    await userEvent.clear(dialog.getByPlaceholderText('Search entities'));
    await expect(
      dialog.queryByRole('button', { name: 'Add item: Alpha camera' })
    ).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }));
    await expect(await body.findByRole('status')).toHaveTextContent('Alpha camera, Beta camera');
  },
};

export const AddMultipleWeatherSources: Story = {
  render: () => <BulkCompanionSourcesStory />,
  parameters: { viewport: { value: 'mobile' } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('dialog', { name: 'Add item' }));
    await userEvent.type(dialog.getByPlaceholderText('Search entities'), 'weather');
    await userEvent.click(dialog.getByRole('button', { name: 'Add item: Alpha weather' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Add item: Beta weather' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }));
    await expect(await body.findByRole('status')).toHaveTextContent('Alpha weather, Beta weather');
  },
};

export const AddChoresToPanel: Story = {
  render: () => (
    <DemoChoreWorkspace>
      <UnifiedSidebarStory />
    </DemoChoreWorkspace>
  ),
  parameters: { viewport: { value: 'desktop' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Customize' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Add item' }));
    const dialog = within(await body.findByRole('dialog', { name: 'Add item' }));
    await userEvent.type(dialog.getByPlaceholderText('Search entities'), 'Chores');
    await userEvent.click(dialog.getByRole('button', { name: 'Add item: Chores' }));
    const confirmation = await body.findByText('Added Chores');
    await waitFor(() => expect(confirmation.closest('[data-sonner-toast]')).toBeVisible());
    await expect(dialog.queryByText('Added Chores')).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }));
    const panel = within(canvas.getByRole('region', { name: 'Side panel' }));
    const chore = await panel.findByText('Unload dishwasher');
    await expect(chore).toBeVisible();
    const viewport = chore.closest('[data-companion-scroll-viewport]');
    if (!viewport) throw new Error('Missing companion scroll viewport');
    await waitFor(() => {
      const bounds = viewport.getBoundingClientRect();
      const row = chore.getBoundingClientRect();
      expect(row.top).toBeGreaterThanOrEqual(bounds.top);
      expect(row.bottom).toBeLessThanOrEqual(bounds.bottom);
    });
    await userEvent.click(panel.getByRole('button', { name: 'Done' }));
    await expect(panel.queryByRole('button', { name: 'Chores' })).not.toBeInTheDocument();
    await userEvent.click(panel.getByRole('button', { name: 'Mark done: Unload dishwasher' }));
    await waitFor(() => expect(panel.queryByText('Unload dishwasher')).not.toBeInTheDocument());
  },
};
