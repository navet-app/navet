import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { LightEffectPicker } from './light-effect-picker';

function EffectPickerStory({ variant }: { variant: 'compact' | 'dialog' }) {
  const [currentEffect, setCurrentEffect] = useState<string | null>('Prism');
  return (
    <div className="w-64">
      <LightEffectPicker
        isOn
        currentEffect={currentEffect}
        onSelect={setCurrentEffect}
        variant={variant}
        options={['Prism', ...Array.from({ length: 40 }, (_, index) => `Effect ${index + 1}`)].map(
          (label) => ({ label, value: label, isOff: false })
        )}
      />
    </div>
  );
}

const meta = {
  title: 'Components/Shared/Light Effect Picker',
  component: EffectPickerStory,
  args: { variant: 'compact' },
} satisfies Meta<typeof EffectPickerStory>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ManyEffects: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    const menu = within(canvasElement.ownerDocument.body).getByRole('menu');
    const view = canvasElement.ownerDocument.defaultView;
    if (!view) throw new Error('Expected a browser window.');
    await expect(view.getComputedStyle(menu).overflowY).toBe('auto');
    await userEvent.keyboard('{End}');
    await expect(within(menu).getByRole('menuitemradio', { name: 'Effect 40' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByRole('button')).toHaveAttribute('title', 'Current effect: Effect 40');
  },
};

export const DialogManyEffects: Story = {
  args: { variant: 'dialog' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    const menu = within(canvasElement.ownerDocument.body).getByRole('menu');
    await userEvent.keyboard('{End}');
    await expect(within(menu).getByRole('menuitemradio', { name: 'Effect 40' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByRole('button')).toHaveTextContent('Effect 40');
  },
};
