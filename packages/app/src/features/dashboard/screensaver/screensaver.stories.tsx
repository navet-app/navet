import { Button } from '@navet/app/components/primitives/button';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { ScreensaverGate } from './screensaver-gate';
import { useScreensaverStore } from './screensaver-store';

// Extends the approved ambient prototype using the existing clock and fullscreen dialog.
// References: app-shell-header-topbar--default, cards-custom-photo--playground.
// Keep time dominant, current activity secondary, and one safe action to return.
function ScreensaverStory() {
  const [presses, setPresses] = useState(0);
  useEffect(() => {
    const previous = useSettingsStore.getState().screensaverEnabled;
    useSettingsStore.getState().updateSettings({ screensaverEnabled: true });
    useScreensaverStore.getState().start();
    return () => {
      useScreensaverStore.getState().stop();
      useSettingsStore.getState().updateSettings({ screensaverEnabled: previous });
    };
  }, []);
  return (
    <>
      <div className="p-6">
        <h1>Living room</h1>
        <Button onClick={() => setPresses((value) => value + 1)}>Device control</Button>
        <p>Device actions: {presses}</p>
      </div>
      <ScreensaverGate />
    </>
  );
}

const meta = {
  title: 'App Shell/Screensaver/Screensaver',
  component: ScreensaverStory,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Opt-in device screensaver with the locale-aware clock, current weather, and a triggered alarm or active timer. Tap or use the keyboard to return without activating an underlying control. Preview reduced effects, all themes, portrait and landscape displays. Rendered maintainer acceptance remains pending.',
      },
    },
  },
} satisfies Meta<typeof ScreensaverStory>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
export const SafeDismissal: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('button', { name: 'Return to dashboard' }));
    await expect(body.queryByRole('dialog', { name: 'Screensaver' })).not.toBeInTheDocument();
    await expect(body.getByText('Device actions: 0')).toBeVisible();
  },
};
