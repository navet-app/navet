import { Button } from '@navet/app/components/primitives/button';
import { useTheme } from '@navet/app/hooks';
import { SettingsDialogStoryFrame } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EnergyNowSettingsDialog } from './energy-now-dashboard-widget';

function EnergyNowSettingsDialogStory() {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState('sensor.home_energy_now');
  const [roomValue, setRoomValue] = useState('__home__');
  const [tintColor, setTintColor] = useState<string | undefined>('#f97316');

  return (
    <SettingsDialogStoryFrame parentCardClassName="bg-[linear-gradient(180deg,rgba(249,115,22,0.18),rgba(15,23,42,0.28))]">
      <div className="relative flex items-start justify-center p-6">
        <Button variant="secondary" onClick={() => setIsOpen(true)}>
          Open energy dialog
        </Button>
      </div>
      <EnergyNowSettingsDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        selectedSourceId={selectedSourceId}
        onSelectionChange={setSelectedSourceId}
        roomValue={roomValue}
        roomLabel={roomValue === '__home__' ? 'Home' : roomValue}
        roomOptions={[
          { label: 'Home', value: '__home__' },
          { label: 'Living Room', value: 'Living Room' },
          { label: 'Kitchen', value: 'Kitchen' },
        ]}
        onRoomChange={setRoomValue}
        tintColor={tintColor}
        onTintColorChange={setTintColor}
        theme={theme}
        options={[
          {
            id: 'sensor.home_energy_now',
            name: 'Home usage',
            currentPowerW: 1170,
            todayUsageKWh: 18.4,
            group: 'home',
          },
          {
            id: 'sensor.solar_energy_now',
            name: 'Solar',
            currentPowerW: 840,
            todayUsageKWh: 12.6,
            group: 'sources',
          },
          {
            id: 'sensor.grid_energy_now',
            name: 'Grid',
            currentPowerW: 330,
            todayUsageKWh: 8.9,
            group: 'sources',
          },
          {
            id: 'sensor.ev_charger_energy_now',
            name: 'EV charger',
            currentPowerW: 2200,
            todayUsageKWh: 5.2,
            group: 'devices',
          },
        ]}
      />
    </SettingsDialogStoryFrame>
  );
}

const meta = {
  component: EnergyNowSettingsDialogStory,
  render: () => <EnergyNowSettingsDialogStory />,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof EnergyNowSettingsDialogStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
