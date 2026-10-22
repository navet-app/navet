import type { Meta, StoryObj } from '@storybook/react-vite';
import { useSettingsSectionController } from '../hooks/use-settings-section-controller';
import { SettingsLocalizationSection } from './settings-localization-section';

function LocalizationStory() {
  const controller = useSettingsSectionController();
  return (
    <div className="h-full min-w-0 overflow-x-hidden overflow-y-auto px-3 py-3 md:px-6 md:py-6">
      <div className="mx-auto w-full max-w-4xl">
        <SettingsLocalizationSection controller={controller} />
      </div>
    </div>
  );
}

const meta = {
  id: 'pages-settings-localization',
  title: 'Pages/Settings/Language & units',
  component: LocalizationStory,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Language and units settings tab — language, time format (12h/24h), and temperature unit.',
      },
    },
  },
} satisfies Meta<typeof LocalizationStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
