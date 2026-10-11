import { Button } from '@navet/app/components/primitives/button';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import { SettingsDialogStoryFrame } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import { ClimateSettingsDialog } from './index';

function ClimateSettingsDialogStory() {
  const [isOn] = useState(true);
  const [mode, setMode] = useState('cool');
  const [targetTemp, setTargetTemp] = useState(22);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <SettingsDialogStoryFrame parentCardClassName="bg-[linear-gradient(180deg,rgba(59,130,246,0.22),rgba(15,23,42,0.28))]">
      <div className="relative flex items-start justify-center p-6">
        <Button variant="secondary" onClick={() => setIsOpen(true)}>
          Open Climate dialog
        </Button>
      </div>
      <ClimateSettingsDialog
        entityId="climate.main_floor"
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        name="Main Floor Climate"
        isOn={isOn}
        mode={mode}
        targetTemp={targetTemp}
        currentTemp={24}
        temperaturePresets={[
          { label: 'Sleep', value: 18 },
          { label: 'Comfort', value: 21 },
          { label: 'Boost', value: 24 },
        ]}
        onTargetTempChange={setTargetTemp}
        onModeChange={setMode}
      />
    </SettingsDialogStoryFrame>
  );
}

const meta = {
  title: 'Cards/Dialogs/Climate',
  component: ClimateSettingsDialogStory,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen', docs: { description: {} } },
} satisfies Meta<typeof ClimateSettingsDialogStory>;

const richComponentDocsDescription = getStoryDocsDescription(meta.title);

meta.parameters = {
  ...meta.parameters,
  docs: {
    ...meta.parameters?.docs,
    description: {
      ...meta.parameters?.docs?.description,
      component: richComponentDocsDescription,
    },
  },
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open Climate dialog' }));
    const dialog = within(await within(document.body).findByRole('dialog'));
    const more = dialog.getByRole('button', { name: 'More actions' });
    const assertUncovered = async (button: HTMLElement) => {
      button.scrollIntoView({ block: 'nearest' });
      await waitFor(() => {
        const bounds = button.getBoundingClientRect();
        const hit = document.elementFromPoint(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2
        );
        expect(button.contains(hit)).toBe(true);
      });
    };
    await assertUncovered(more);
    await userEvent.click(more);
    await expect(within(document.body).getByRole('menuitem', { name: 'Edit room' })).toBeVisible();
    await userEvent.click(within(document.body).getByRole('menuitem', { name: 'Controls' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Back to controls' }));
    await expect(
      dialog.queryByRole('button', { name: 'Back to controls' })
    ).not.toBeInTheDocument();
    for (const label of ['Close', 'Done']) {
      const current = within(await within(document.body).findByRole('dialog'));
      const button = current
        .getAllByRole('button', { name: label })
        .find((element) => element.getBoundingClientRect().width > 0);
      if (!button) throw new Error(`No visible ${label} button`);
      await assertUncovered(button);
      await userEvent.click(button);
      await expect(within(document.body).queryByRole('dialog')).not.toBeInTheDocument();
      if (label === 'Close') {
        await userEvent.click(canvas.getByRole('button', { name: 'Open Climate dialog' }));
      }
    }
  },
};
export const Mobile: Story = {
  ...Default,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
