import { Button } from '@navet/app/components/primitives/button';
import { TEMP_OPTIONS } from '@navet/app/constants/light-constants';
import { defaultTranslate } from '@navet/app/i18n';
import { SettingsDialogStoryFrame } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Sun, SunDim, SunMedium } from 'lucide-react';
import { useState } from 'react';
import { expect, within } from 'storybook/test';
import type { LightBrightnessPreset } from './light-card-types';
import { LightSettingsDialog } from './light-settings-dialog';

function LightSettingsDialogStory({
  onOffOnly = false,
  initiallyOn = true,
  effects = false,
}: {
  onOffOnly?: boolean;
  initiallyOn?: boolean;
  effects?: boolean;
}) {
  const [isOn, setIsOn] = useState(initiallyOn);
  const [currentEffect, setCurrentEffect] = useState<string | null>(null);
  const [brightness, setBrightness] = useState(62);
  const [colorTemp, setColorTemp] = useState(3500);
  const [selectedColor, setSelectedColor] = useState<string | null>('#FFA500');
  const [customColor, setCustomColor] = useState('#f97316');
  const [selectedIcon, setSelectedIcon] = useState('Lightbulb');
  const [tintColor, setTintColor] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const presets: LightBrightnessPreset[] = [
    { key: 'bright', brightness: 100, label: 'Bright', icon: Sun },
    { key: 'dim', brightness: 50, label: 'Dim', icon: SunMedium },
    { key: 'night', brightness: 25, label: 'Night', icon: SunDim },
  ];

  return (
    <SettingsDialogStoryFrame parentCardClassName="bg-[linear-gradient(180deg,rgba(249,115,22,0.28),rgba(124,45,18,0.26))]">
      <div className="relative flex items-start justify-center p-6">
        <Button variant="secondary" onClick={() => setIsOpen(true)}>
          Open light dialog
        </Button>
      </div>
      <LightSettingsDialog
        entityId="light.living_room_main"
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        onRemoveCard={() => setIsOpen(false)}
        name="Living Room Main"
        room="Living room"
        isOn={isOn}
        onPowerChange={setIsOn}
        supportsBrightness={!onOffOnly}
        supportsColorTemperature={!onOffOnly}
        supportsColorControl={!onOffOnly}
        currentEffect={currentEffect}
        effectOptions={
          effects
            ? [
                { isOff: true, label: 'No effect', value: '__navet_no_effect__' },
                { isOff: false, label: 'Rainbow', value: 'Rainbow' },
                { isOff: false, label: 'Fire', value: 'Fire' },
              ]
            : []
        }
        minColorTemp={2200}
        maxColorTemp={6400}
        tempOptions={TEMP_OPTIONS.map(({ labelKey, ...option }) => ({
          ...option,
          label: defaultTranslate(labelKey),
        }))}
        brightnessPresets={presets}
        colorTemp={colorTemp}
        selectedColor={selectedColor}
        customColor={customColor}
        brightness={brightness}
        selectedIcon={selectedIcon}
        tintColor={tintColor}
        supportsEffects={effects}
        onTempChange={setColorTemp}
        onTempCommit={setColorTemp}
        onColorChange={setSelectedColor}
        onCustomColorChange={setCustomColor}
        onEffectSelect={(effect) =>
          setCurrentEffect(effect === '__navet_no_effect__' ? null : effect)
        }
        onBrightnessChange={setBrightness}
        applyBrightnessPresetsToAll
        onApplyBrightnessPresetsToAllChange={() => {}}
        onBrightnessPresetValueChange={() => {}}
        onBrightnessPresetOrderChange={() => {}}
        onIconChange={setSelectedIcon}
        onTintColorChange={setTintColor}
      />
    </SettingsDialogStoryFrame>
  );
}

const meta = {
  component: LightSettingsDialogStory,
  render: (args) => <LightSettingsDialogStory {...args} />,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LightSettingsDialogStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent, step }) => {
    const openButton = canvas.getByRole('button', { name: /open light dialog/i });

    await step('opens the dialog from the trigger', async () => {
      await userEvent.click(openButton);
    });

    // Dialog content is portaled under `document.body`; `#storybook-root` is aria-hidden while open.
    const dialog = await within(document.body).findByRole('dialog');
    const dialogScope = within(dialog);
    const brightnessSlider = dialogScope.getByRole('slider', { name: /brightness/i });

    await step('starts with the expected brightness value', async () => {
      await expect(brightnessSlider).toHaveAttribute('aria-valuenow', '62');
      await expect(dialogScope.getByText('62%')).toBeInTheDocument();
    });

    await step('keeps warmth and color controls in the same layout', async () => {
      await userEvent.click(dialogScope.getByRole('tab', { name: 'Warmth' }));
      const dialogBounds = dialog.getBoundingClientRect();
      const warmthSlider = dialogScope.getByRole('slider', { name: 'Color Temperature' });
      const warmthBounds = warmthSlider.getBoundingClientRect();
      const warmthTrack = warmthSlider.parentElement?.parentElement?.firstElementChild;
      const warmthTrackWidth = warmthTrack?.getBoundingClientRect().width;
      const doneBounds = dialogScope.getByRole('button', { name: 'Done' }).getBoundingClientRect();
      await userEvent.click(dialogScope.getByRole('tab', { name: 'Colors' }));
      const colorBounds = dialogScope.getByRole('slider', { name: 'Hue' }).getBoundingClientRect();
      await expect(warmthSlider.getBoundingClientRect().width).toBeCloseTo(warmthBounds.width, 0);
      await expect(warmthTrack?.getBoundingClientRect().width).toBeCloseTo(
        warmthTrackWidth ?? 0,
        0
      );
      await expect(warmthSlider.closest('[role="tabpanel"]')).toHaveAttribute('inert');
      await expect(dialog.getBoundingClientRect().height).toBeCloseTo(dialogBounds.height, 0);
      await expect(dialog.getBoundingClientRect().top).toBeCloseTo(dialogBounds.top, 0);
      await expect(colorBounds.top).toBeCloseTo(warmthBounds.top, 0);
      await expect(
        dialogScope.getByRole('button', { name: 'Done' }).getBoundingClientRect().top
      ).toBeCloseTo(doneBounds.top, 0);
      await expect(dialogScope.queryByText('Detailed color')).not.toBeInTheDocument();
      await userEvent.click(dialogScope.getByRole('tab', { name: 'Warmth' }));
      warmthSlider.focus();
      await userEvent.keyboard('{Home}');
      await expect(
        warmthSlider.getBoundingClientRect().left - (warmthTrack?.getBoundingClientRect().left ?? 0)
      ).toBeCloseTo(0, 0);
      await userEvent.keyboard('{End}');
      await expect(
        (warmthTrack?.getBoundingClientRect().right ?? 0) -
          warmthSlider.getBoundingClientRect().right
      ).toBeCloseTo(0, 0);
    });

    await step('updates brightness with keyboard interaction', async () => {
      brightnessSlider.focus();
      await userEvent.keyboard('{ArrowUp}');
      await expect(brightnessSlider).toHaveAttribute('aria-valuenow', '63');
      await expect(dialogScope.getByText('63%')).toBeInTheDocument();
    });
    await step(
      'keeps the handle inside the drag area at low, middle, and full brightness',
      async () => {
        const fill = dialog.querySelector('[data-light-brightness-fill]');
        const handle = dialog.querySelector('[data-light-brightness-handle]');
        const track = fill?.parentElement;
        if (!fill || !handle || !track)
          throw new Error('Brightness slider geometry is unavailable');
        const expectAlignment = () => {
          const handleRect = handle.getBoundingClientRect();
          const fillRect = fill.getBoundingClientRect();
          const trackRect = track.getBoundingClientRect();
          expect(handleRect.top).toBeGreaterThanOrEqual(trackRect.top + 1);
          expect(handleRect.bottom).toBeLessThanOrEqual(trackRect.bottom - 1);
          expect(handleRect.left).toBeGreaterThanOrEqual(trackRect.left);
          expect(handleRect.right).toBeLessThanOrEqual(trackRect.right);
          expect(
            Math.abs(handleRect.top + handleRect.height / 2 - fillRect.top)
          ).toBeLessThanOrEqual(4);
        };
        expectAlignment();
        brightnessSlider.focus();
        await userEvent.keyboard('{Home}');
        await expect(brightnessSlider).toHaveAttribute('aria-valuenow', '1');
        expectAlignment();
        await userEvent.keyboard('{End}');
        await expect(brightnessSlider).toHaveAttribute('aria-valuenow', '100');
        expectAlignment();
      }
    );
    await step('applies a named preset and controls power inside the dialog', async () => {
      await userEvent.click(dialogScope.getByRole('checkbox', { name: 'Dim 50%' }));
      await expect(brightnessSlider).toHaveAttribute('aria-valuenow', '50');
      await userEvent.click(dialogScope.getByRole('button', { name: 'Turn off' }));
      await expect(brightnessSlider).toHaveAttribute('data-disabled');
      await userEvent.click(dialogScope.getByRole('button', { name: 'Turn on' }));
      await expect(brightnessSlider).not.toHaveAttribute('data-disabled');
    });
    await step(
      'opens secondary controls from the overflow menu and returns to light controls',
      async () => {
        await userEvent.click(dialogScope.getByRole('button', { name: 'More actions' }));
        const menu = within(await within(document.body).findByRole('menu'));
        await expect(menu.getByRole('menuitem', { name: 'Edit room' })).toBeInTheDocument();
        await expect(menu.getByText('light.living_room_main')).toBeInTheDocument();
        await userEvent.click(menu.getByRole('menuitem', { name: 'Presets' }));
        await expect(dialogScope.getByText('Edit Brightness Presets')).toBeVisible();
        await userEvent.click(dialogScope.getByRole('button', { name: 'Back to controls' }));
        await expect(brightnessSlider).toBeVisible();
        await userEvent.click(dialogScope.getByRole('button', { name: 'More actions' }));
        await userEvent.click(
          within(await within(document.body).findByRole('menu')).getByRole('menuitem', {
            name: 'Edit card name',
          })
        );
        await expect(dialogScope.getByRole('textbox', { name: 'Card name' })).toHaveFocus();
        await userEvent.click(dialogScope.getByRole('button', { name: 'Cancel' }));
        await userEvent.click(dialogScope.getByRole('button', { name: 'More actions' }));
        const hideAction = within(await within(document.body).findByRole('menu')).getByRole(
          'menuitem',
          { name: 'Hide' }
        );
        await expect(hideAction).toHaveAttribute('data-variant', 'destructive');
        await userEvent.click(hideAction);
        await expect(
          within(document.body).queryByRole('dialog', { name: 'Living Room Main' })
        ).not.toBeInTheDocument();
      }
    );
  },
};

export const Off: Story = { args: { initiallyOn: false } };
export const OnOffOnly: Story = { args: { onOffOnly: true, initiallyOn: false } };
export const WithEffects: Story = {
  args: { effects: true },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: /open light dialog/i }));
    const scope = within(await within(document.body).findByRole('dialog'));
    await userEvent.click(scope.getByRole('tab', { name: 'Effects' }));
    await userEvent.click(scope.getByRole('checkbox', { name: 'Fire' }));
    await expect(scope.getByRole('checkbox', { name: 'Fire' })).toBeChecked();
    await expect(scope.getByRole('checkbox', { name: 'No effect' })).not.toBeChecked();
  },
};
