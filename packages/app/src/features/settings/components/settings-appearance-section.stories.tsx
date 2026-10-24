import { ScreensaverGate } from '@navet/app/features/dashboard/screensaver/screensaver-gate';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useSettingsSectionController } from '../hooks/use-settings-section-controller';
import { SettingsAppearanceSection } from './settings-appearance-section';

function AppearanceStory() {
  const controller = useSettingsSectionController();
  return (
    <div className="h-full min-w-0 overflow-x-hidden overflow-y-auto px-3 py-3 md:px-6 md:py-6">
      <div className="mx-auto w-full max-w-4xl">
        <SettingsAppearanceSection controller={controller} />
        <ScreensaverGate />
      </div>
    </div>
  );
}

const meta = {
  title: 'Pages/Settings/Appearance',
  component: AppearanceStory,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Appearance settings with the approved on-demand wallpaper and screensaver dialogs, shared landscape preview, built-in wallpapers and solid colors. Grouped into theme and background, layout, and effects and performance. Visual quality stays beside light card ambience because it controls whether that effect is available.',
      },
    },
  },
} satisfies Meta<typeof AppearanceStory>;

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
