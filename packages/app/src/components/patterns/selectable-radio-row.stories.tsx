import type { Meta, StoryObj } from '@storybook/react-vite';
import { Moon, Sun, Sunrise } from 'lucide-react';
import { useId, useState } from 'react';
import { expect, within } from 'storybook/test';
import { SelectableRadioList, SelectableRadioRow } from './selectable-radio-row';

function SelectableRadioRows({
  size = 'default',
  disabled = false,
  longLabels = false,
  radioColor,
}: {
  size?: 'default' | 'compact';
  disabled?: boolean;
  longLabels?: boolean;
  radioColor?: string;
}) {
  const name = useId();
  const [selected, setSelected] = useState('dim');
  const options = [
    { value: 'bright', label: 'Bright', description: 'Full brightness', metric: '100%', icon: Sun },
    { value: 'dim', label: 'Dim', description: 'Half brightness', metric: '50%', icon: Sunrise },
    { value: 'night', label: 'Night', description: 'Low brightness', metric: '25%', icon: Moon },
  ];
  return (
    <fieldset aria-label="Brightness preset" className="w-full min-w-0 max-w-sm">
      <SelectableRadioList>
        {options.map((option) => (
          <li key={option.value}>
            <SelectableRadioRow
              name={name}
              value={option.value}
              size={size}
              radioColor={radioColor}
              checked={selected === option.value}
              onValueChange={setSelected}
              disabled={disabled}
              label={
                longLabels
                  ? `${option.label} preset for the living room reading lights`
                  : option.label
              }
              labelClassName="break-words"
              description={option.description}
              leading={<option.icon aria-hidden="true" className="h-4 w-4" />}
              trailing={<span className="text-xs tabular-nums">{option.metric}</span>}
            />
          </li>
        ))}
      </SelectableRadioList>
    </fieldset>
  );
}

const meta = {
  title: 'Components/Patterns/Selectable Radio Row',
  component: SelectableRadioRows,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Single-choice sibling of SelectableCheckboxList and SelectableCheckboxRow. Reuse the grouped shell, compact or default rows, and optional content slots; give every radio in a group the same name and keep the selected value in the owner. Native radios support arrow keys and Space. Used by card-dialog advanced option lists; rendered maintainer acceptance remains pending.',
      },
    },
  },
} satisfies Meta<typeof SelectableRadioRows>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Preview: Story = {
  play: async ({ canvas, userEvent }) => {
    const group = within(canvas.getByRole('group', { name: 'Brightness preset' }));
    const dim = group.getByRole('radio', { name: 'Dim' });
    const night = group.getByRole('radio', { name: 'Night' });
    await expect(dim).toBeChecked();
    await expect(dim).toHaveAccessibleDescription('Half brightness');
    dim.focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(night).toHaveFocus();
    await expect(night).toBeChecked();
    await expect(dim).not.toBeChecked();
    await userEvent.keyboard(' ');
    await expect(night).toBeChecked();
    await userEvent.click(group.getByText('Bright'));
    await expect(group.getByRole('radio', { name: 'Bright' })).toBeChecked();
    await expect(night).not.toBeChecked();
  },
};
export const Compact: Story = { ...Preview, args: { size: 'compact' } };
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas, userEvent }) => {
    for (const radio of canvas.getAllByRole('radio')) await expect(radio).toBeDisabled();
    await userEvent.click(canvas.getByText('Bright'));
    await expect(canvas.getByRole('radio', { name: 'Dim' })).toBeChecked();
  },
};
export const LongLabels: Story = { args: { longLabels: true } };
export const Light: Story = { ...Compact, globals: { theme: 'light' } };
export const Glass: Story = { ...Compact, globals: { theme: 'glass' } };
export const Black: Story = { ...Compact, globals: { theme: 'black' } };
export const Mobile: Story = {
  ...Compact,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

export const Tinted: Story = {
  ...Compact,
  args: { size: 'compact', radioColor: '#60a5fa' },
};
