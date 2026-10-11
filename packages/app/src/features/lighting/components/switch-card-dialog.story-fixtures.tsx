import { Button } from '@navet/app/components/primitives/button';
import { SettingsDialogStoryFrame } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SwitchSettingsDialog } from './switch-settings-dialog';

function SwitchSettingsDialogStory() {
  const [isOpen, setIsOpen] = useState(false);
  const [tintColor, setTintColor] = useState('#f97316');
  const [selectedIcon, setSelectedIcon] = useState('Power');
  const [selectedMetricLabels, setSelectedMetricLabels] = useState<string[]>(['Power', 'Voltage']);

  return (
    <SettingsDialogStoryFrame parentCardClassName="bg-[linear-gradient(180deg,rgba(249,115,22,0.18),rgba(15,23,42,0.28))]">
      <div className="relative flex items-start justify-center p-6">
        <Button variant="secondary" onClick={() => setIsOpen(true)}>
          Open switch dialog
        </Button>
      </div>
      <SwitchSettingsDialog
        entityId="switch.espresso_machine"
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        name="Espresso Machine"
        entityType="switch"
        isOn
        metricSectionTitle="Card metric"
        metricSectionDescription="Select up to two metrics."
        metricLimit={2}
        availableMetrics={[
          { label: 'Power', value: 1140, unit: 'W', icon: 'zap' },
          { label: 'Voltage', value: 230, unit: 'V', icon: 'gauge' },
          { label: 'Energy', value: 2.6, unit: 'kWh', icon: 'activity' },
        ]}
        selectedMetricLabels={selectedMetricLabels}
        getMetricLabel={(metric) => metric.label}
        onMetricToggle={(label) =>
          setSelectedMetricLabels((current) =>
            current.includes(label)
              ? current.filter((item) => item !== label)
              : current.length >= 2
                ? current
                : [...current, label]
          )
        }
        selectedIcon={selectedIcon}
        onIconChange={setSelectedIcon}
        siblingEntities={[
          {
            id: 'switch.espresso_machine_power',
            entity: {
              entityId: 'switch.espresso_machine_power',
              state: 'on',
              attributes: { friendly_name: 'Power relay' },
            },
          },
        ]}
        tintColor={tintColor}
        onTintColorChange={setTintColor}
      />
    </SettingsDialogStoryFrame>
  );
}

const meta = {
  component: SwitchSettingsDialogStory,
  render: () => <SwitchSettingsDialogStory />,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SwitchSettingsDialogStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
