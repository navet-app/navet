import { RoomNav } from '@navet/app/components/layout/room-nav';
import { Sidebar } from '@navet/app/components/layout/sidebar';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useDashboardCollectionStore } from '@navet/app/features/dashboard/dashboards/dashboard-collection-store';
import { DashboardLayout } from '@navet/app/features/dashboard/shell';
import { useTheme } from '@navet/app/hooks';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

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
function UnifiedSidebarStory({ collapsed = false }: { collapsed?: boolean }) {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const previous = useSettingsStore.getState().companionCollapsed;
    const collection = useDashboardCollectionStore.getState();
    const dashboardId = collection.activeDashboardId;
    const companion = collection.collection.dashboardsById[dashboardId]?.companion;
    useSettingsStore.getState().updateSettings({ companionCollapsed: collapsed });
    return () => {
      useSettingsStore.getState().updateSettings({ companionCollapsed: previous });
      if (companion) useDashboardCollectionStore.getState().updateCompanion(dashboardId, companion);
    };
  }, [collapsed]);
  return (
    <DashboardLayout
      mobileEditActions={{
        isEditMode: editing,
        onToggleEditMode: () => setEditing((value) => !value),
      }}
    >
      <RoomNav
        rooms={['Living Room', 'Kitchen']}
        activeRoom="All"
        onRoomChange={() => {}}
        isEditMode={editing}
        onToggleEditMode={() => setEditing((value) => !value)}
        showCustomizeButton={false}
      />
      <h2 className="text-xl font-medium">Living room</h2>
      <p>The side panel stays with the selected dashboard while navigating rooms.</p>
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
