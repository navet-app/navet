import { Button } from '@navet/app/components/primitives/button';
import type { ProviderBatterySensorRow } from '@navet/app/hooks';
import { SettingsDialogStoryFrame } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { BatterySettingsDialog } from './battery-settings-dialog';

const sampleBatteries: ProviderBatterySensorRow[] = [
  { id: 'sensor.front_door_battery', name: 'Front Door Sensor', level: 18 },
  { id: 'sensor.kitchen_remote_battery', name: 'Kitchen Remote', level: 42 },
  {
    id: 'sensor.ikea_of_sweden_vallhorn_wireless_motion_sensor_workshop_battery',
    name: 'Workshop Motion Sensor',
    level: 67,
  },
  {
    id: 'sensor.ikea_of_sweden_vallhorn_wireless_motion_sensor_bathroom_battery',
    name: 'Bathroom Motion Sensor',
    level: 91,
  },
];

function BatterySettingsDialogStory() {
  const [isOpen, setIsOpen] = useState(false);
  const [roomValue, setRoomValue] = useState('__home__');
  const [tintColor, setTintColor] = useState<string | undefined>('#f97316');
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>(
    sampleBatteries.map((battery) => battery.id)
  );

  return (
    <SettingsDialogStoryFrame parentCardClassName="bg-[linear-gradient(180deg,rgba(249,115,22,0.16),rgba(15,23,42,0.28))]">
      <div className="relative flex items-start justify-center p-6">
        <Button variant="secondary" onClick={() => setIsOpen(true)}>
          Open battery dialog
        </Button>
      </div>
      <BatterySettingsDialog
        batteries={sampleBatteries}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        selectedEntityIds={selectedEntityIds}
        onSelectionChange={setSelectedEntityIds}
        roomValue={roomValue}
        roomLabel={roomValue === '__home__' ? 'Home' : roomValue}
        roomOptions={[
          { label: 'Home', value: '__home__' },
          { label: 'Hallway', value: 'Hallway' },
          { label: 'Living Room', value: 'Living Room' },
        ]}
        onRoomChange={setRoomValue}
        tintColor={tintColor}
        onTintColorChange={setTintColor}
      />
    </SettingsDialogStoryFrame>
  );
}

const meta = {
  component: BatterySettingsDialogStory,
  render: () => <BatterySettingsDialogStory />,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof BatterySettingsDialogStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
