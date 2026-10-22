import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { useSettingsSectionController } from '../hooks/use-settings-section-controller';
import { SettingsSystemSection } from './settings-system-section';

function SystemStory({ connectedProvider = false }: { connectedProvider?: boolean }) {
  const controller = useSettingsSectionController();
  if (connectedProvider) {
    controller.providerCards = controller.providerCards.map((provider) =>
      provider.id === 'home_assistant'
        ? {
            ...provider,
            status: 'connected',
            isActive: true,
            isConnected: true,
            canDisconnect: true,
            baseUrl: 'http://navet.local:5200/__navet_ha_proxy__',
          }
        : provider
    );
  }

  return (
    <div className="h-full min-w-0 overflow-x-hidden overflow-y-auto px-3 py-3 md:px-6 md:py-6">
      <div className="mx-auto w-full max-w-4xl">
        <SettingsSystemSection controller={controller} />
      </div>
    </div>
  );
}

const meta = {
  title: 'Pages/Settings/System',
  component: SystemStory,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'System settings grouped into provider connections, device access, backup and recovery, and session actions.',
      },
    },
  },
} satisfies Meta<typeof SystemStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of ['Connections', 'Backup and recovery', 'Session']) {
      await expect(canvas.getByRole('region', { name })).toBeVisible();
    }
  },
};

export const ConnectedProvider: Story = {
  args: {
    connectedProvider: true,
  },
};
