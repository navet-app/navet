import { Button } from '@navet/app/components/primitives/button';
import { useTheme } from '@navet/app/hooks';
import { SettingsDialogStoryFrame } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { VacuumSettingsDialog } from './vacuum-settings-dialog';

function VacuumSettingsDialogStory(
  args: Omit<ComponentProps<typeof VacuumSettingsDialog>, 'isOpen' | 'onClose'>
) {
  const { accentColor, theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [tintColor, setTintColor] = useState(args.tintColor);
  const resolvedAccentColor = args.accentColorValue ?? accentColor;

  useEffect(() => {
    setTintColor(args.tintColor);
  }, [args.tintColor]);

  return (
    <SettingsDialogStoryFrame parentCardClassName="bg-[linear-gradient(180deg,rgba(24,24,27,0.98),rgba(10,10,12,0.98))]">
      <div className="relative flex items-start justify-center p-6">
        <Button variant="secondary" onClick={() => setIsOpen(true)}>
          Open vacuum dialog
        </Button>
      </div>
      <VacuumSettingsDialog
        {...args}
        theme={theme}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        accentColorValue={resolvedAccentColor}
        tintColor={tintColor}
        onTintColorChange={setTintColor}
      />
    </SettingsDialogStoryFrame>
  );
}

const meta = {
  component: VacuumSettingsDialogStory,
  render: (args) => <VacuumSettingsDialogStory {...args} />,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    entityId: 'vacuum.roborock_s7',
    onStartCleaning: () => {},
    onStartAreaCleaning: () => {},
    onPauseCleaning: () => {},
    onReturnHome: () => {},
    onLocate: () => {},
    onCleanSpot: () => {},
    onSetFanSpeed: () => {},
    name: 'Robo Cleaner',
    room: 'Whole Home',
    theme: 'dark',
    accentColorValue: undefined,
    currentStatus: 'cleaning',
    fanSpeed: 'Standard',
    fanSpeeds: ['Quiet', 'Standard', 'Max'],
    availableCleaningAreas: [
      { id: 'living_room', label: 'Living Room' },
      { id: 'kitchen', label: 'Kitchen' },
      { id: 'hallway', label: 'Hallway' },
      { id: 'bedroom', label: 'Bedroom' },
    ],
    capabilities: {
      canStart: true,
      canPause: true,
      canStop: false,
      canReturnHome: true,
      canLocate: true,
      canCleanSpot: true,
      canSetFanSpeed: true,
      currentFanSpeed: 'Standard',
      fanSpeedOptions: ['Quiet', 'Standard', 'Max'],
      canCycleFanSpeed: true,
      canShowMap: true,
      canCleanByArea: true,
      canOrderAreaCleaning: false,
      availableCleaningAreas: [
        { id: 'living_room', label: 'Living Room' },
        { id: 'kitchen', label: 'Kitchen' },
        { id: 'hallway', label: 'Hallway' },
        { id: 'bedroom', label: 'Bedroom' },
      ],
    },
    tintColor: undefined,
    onTintColorChange: () => {},
  },
} satisfies Meta<typeof VacuumSettingsDialogStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MultiSpeed: Story = {
  args: {
    fanSpeed: 'Balanced',
    fanSpeeds: ['Silent', 'Balanced', 'Turbo'],
    supportsFanSpeed: true,
  },
};

export const NoFanSpeedSupport: Story = {
  args: {
    fanSpeed: undefined,
    fanSpeeds: [],
    supportsFanSpeed: false,
  },
};

export const NoMappedAreas: Story = {
  args: {
    availableCleaningAreas: [],
    capabilities: {
      canStart: true,
      canPause: true,
      canStop: false,
      canReturnHome: true,
      canLocate: true,
      canCleanSpot: true,
      canSetFanSpeed: true,
      currentFanSpeed: 'Standard',
      fanSpeedOptions: ['Quiet', 'Standard', 'Max'],
      canCycleFanSpeed: true,
      canShowMap: false,
      canCleanByArea: false,
      canOrderAreaCleaning: false,
      availableCleaningAreas: [],
    },
  },
};

export const OrderedAreaCleaning: Story = {
  args: {
    capabilities: {
      canStart: true,
      canPause: true,
      canStop: false,
      canReturnHome: true,
      canLocate: true,
      canCleanSpot: true,
      canSetFanSpeed: true,
      currentFanSpeed: 'Standard',
      fanSpeedOptions: ['Quiet', 'Standard', 'Max'],
      canCycleFanSpeed: true,
      canShowMap: true,
      canCleanByArea: true,
      canOrderAreaCleaning: true,
      availableCleaningAreas: [
        { id: 'living_room', label: 'Living Room' },
        { id: 'kitchen', label: 'Kitchen' },
        { id: 'hallway', label: 'Hallway' },
        { id: 'bedroom', label: 'Bedroom' },
      ],
    },
  },
};

export const OverflowNavigation: Story = {
  play: async ({ canvasElement }) => {
    const page = within(document.body);
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Open vacuum dialog' })
    );
    const dialog = within(await page.findByRole('dialog', { name: 'Robo Cleaner' }));
    await expect(dialog.getByRole('button', { name: 'Fan Speed' })).toBeVisible();
    await expect(dialog.queryByRole('tablist')).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: 'More actions' }));
    await userEvent.click(page.getByRole('menuitem', { name: 'Map' }));
    await userEvent.click(dialog.getByRole('button', { name: /^Kitchen/ }));
    await expect(dialog.getByText('1 selected')).toBeVisible();
    await userEvent.click(dialog.getByRole('button', { name: 'Back to controls' }));
    await expect(dialog.getByRole('button', { name: 'Fan Speed' })).toBeVisible();
    await userEvent.click(dialog.getByRole('button', { name: 'More actions' }));
    await userEvent.click(page.getByRole('menuitem', { name: 'Customize' }));
    await expect(dialog.getByRole('button', { name: 'Back to controls' })).toBeVisible();
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }));
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Open vacuum dialog' })
    );
    await expect(
      within(await page.findByRole('dialog')).getByRole('button', { name: 'Fan Speed' })
    ).toBeVisible();
    await userEvent.click(within(page.getByRole('dialog')).getByRole('button', { name: 'Done' }));
  },
};

export const MobileOverflowNavigation: Story = {
  ...OverflowNavigation,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
