import { HumidifierCard } from '@navet/app/features/climate';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import { EntityCardStoryFrame, noopCardSizeChange } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';
import { expect, within } from 'storybook/test';

function HumidifierCardStory(args: Omit<ComponentProps<typeof HumidifierCard>, 'onSizeChange'>) {
  return (
    <EntityCardStoryFrame size={args.size === 'small' ? 'small' : 'medium'}>
      <HumidifierCard {...args} onSizeChange={noopCardSizeChange} />
    </EntityCardStoryFrame>
  );
}

const meta = {
  title: 'Cards/Entity/Humidifier',
  component: HumidifierCardStory,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['small', 'medium'],
    },
    initialTargetHumidity: {
      control: { type: 'range', min: 20, max: 80, step: 1 },
    },
    minHumidity: {
      control: { type: 'number', min: 0, max: 100, step: 1 },
    },
    maxHumidity: {
      control: { type: 'number', min: 0, max: 100, step: 1 },
    },
  },
  args: {
    id: 'humidifier.bedroom',
    name: 'Bedroom Humidifier',
    room: 'Bedroom',
    entityType: 'Humidifier',
    deviceClass: 'humidifier',
    initialState: true,
    initialTargetHumidity: 46,
    minHumidity: 30,
    maxHumidity: 70,
    targetHumidityStep: 1,
    initialMode: 'auto',
    availableModes: ['auto', 'eco', 'sleep'],
    size: 'medium',
    isEditMode: false,
  },
  parameters: { docs: { description: {} } },
} satisfies Meta<typeof HumidifierCardStory>;

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

export const Playground: Story = {};

export const Small: Story = {
  args: {
    size: 'small',
  },
};

export const Off: Story = {
  args: {
    initialState: false,
    initialMode: 'eco',
  },
};

export const Dehumidifier: Story = {
  args: {
    id: 'humidifier.basement',
    name: 'Basement Dehumidifier',
    room: 'Basement',
    entityType: 'Dehumidifier',
    deviceClass: 'dehumidifier',
    initialTargetHumidity: 52,
    minHumidity: 35,
    maxHumidity: 80,
    initialMode: 'auto',
    availableModes: ['auto', 'home', 'sleep'],
  },
};

export const Docs: Story = {
  parameters: {
    docsOnly: true,
  },
};

export const DialogControls: Story = {
  ...Dehumidifier,
  play: async ({ canvas, userEvent }) => {
    const open = canvas.getByRole('button', { name: 'Open settings for Basement Dehumidifier' });
    await userEvent.click(open);
    const dialog = within(await within(document.body).findByRole('dialog'));
    await expect(dialog.queryByText('humidifier.basement')).not.toBeInTheDocument();
    const more = dialog.getByRole('button', { name: 'More actions' });
    await userEvent.click(more);
    await expect(within(document.body).getByText('humidifier.basement')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect(dialog.queryByRole('slider')).not.toBeInTheDocument();
    const modeOption = dialog.getByRole('radio', { name: 'Sleep' }).closest('label');
    if (!modeOption) throw new Error('Missing mode option label');
    await expect(modeOption.getBoundingClientRect().height).toBe(36);

    await expect(dialog.getByText('52%', { selector: 'dd' })).toBeVisible();
    await expect(dialog.getByText('Current 52%')).toBeVisible();
    const increase = dialog.getByRole('button', { name: 'Increase target humidity' });
    await expect(increase.getBoundingClientRect().width).toBe(42);
    await expect(increase.getBoundingClientRect().height).toBe(42);
    increase.focus();
    await userEvent.keyboard('{Enter}');
    await expect(dialog.getByText('53%', { selector: 'dd' })).toBeVisible();
    await userEvent.click(dialog.getByRole('radio', { name: 'Sleep' }));
    await expect(dialog.getByRole('radio', { name: 'Sleep' })).toBeChecked();
    await expect(
      within(document.body).getByRole('dialog').getBoundingClientRect().height
    ).toBeLessThan(window.innerHeight * 0.8);
    for (const label of ['Close', 'Done']) {
      const current = within(await within(document.body).findByRole('dialog'));
      const button = current
        .getAllByRole('button', { name: label })
        .find((element) => element.getBoundingClientRect().width > 0);
      if (!button) throw new Error(`No visible ${label} button`);
      const bounds = button.getBoundingClientRect();
      const hit = document.elementFromPoint(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2
      );
      await expect(button.contains(hit)).toBe(true);
      await userEvent.click(button);
      await expect(within(document.body).queryByRole('dialog')).not.toBeInTheDocument();
      if (label === 'Close') await userEvent.click(open);
    }
  },
};

export const DialogMobile: Story = {
  ...DialogControls,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

export const DialogLight: Story = {
  ...DialogControls,
  globals: { theme: 'light' },
};

export const DialogGlass: Story = {
  ...DialogControls,
  globals: { theme: 'glass' },
};

export const DialogBlack: Story = {
  ...DialogControls,
  globals: { theme: 'black' },
};
