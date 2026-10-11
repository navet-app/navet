import { useSettingsSectionController } from '@navet/app/features/settings/hooks/use-settings-section-controller';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ThemeAppearancePicker } from './theme-appearance-picker';

function ThemeAppearancePickerStory() {
  const {
    colorOptions,
    customPrimaryColor,
    followSystemTheme,
    manualTheme,
    primaryColor,
    setCustomPrimaryColor,
    setFollowSystemTheme,
    setPrimaryColor,
    setTheme,
    theme,
    themeOptions,
  } = useSettingsSectionController();

  return (
    <div className="flex justify-center p-8">
      <div className="w-full max-w-xl">
        <ThemeAppearancePicker
          colorOptions={colorOptions}
          customAccent={customPrimaryColor}
          selectedAccent={primaryColor}
          selectedTheme={manualTheme}
          effectiveTheme={theme}
          themeOptions={themeOptions}
          onAccentChange={setPrimaryColor}
          onCustomAccentChange={setCustomPrimaryColor}
          onThemeChange={setTheme}
          followSystemTheme={followSystemTheme}
          onFollowSystemThemeChange={setFollowSystemTheme}
        />
      </div>
    </div>
  );
}

const meta = {
  title: 'Components/Shared/Appearance Picker',
  component: ThemeAppearancePickerStory,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Shared appearance picker with a system appearance switch, miniature dashboard previews for the four themes, and independent accent swatches. Check selected states, keyboard focus, custom colors, and system-controlled themes across mobile and desktop.',
      },
    },
  },
} satisfies Meta<typeof ThemeAppearancePickerStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Docs: Story = {
  parameters: {
    docsOnly: true,
  },
};
