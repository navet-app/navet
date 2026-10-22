import { Button } from '@navet/app/components/primitives/button';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { GripVertical, MoreHorizontal, Pencil } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { FolderTabHandle } from './folder-tab-handle';

function HandleExample({
  size = 'default',
  longTitle = false,
}: {
  size?: 'default' | 'compact';
  longTitle?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="w-full max-w-sm space-y-2">
      <FolderTabHandle
        size={size}
        title={
          longTitle ? 'Weather forecasts for all of the household’s favorite places' : 'Weather'
        }
        handle={
          <Button
            variant="ghost"
            size="compact"
            iconOnly
            label="Reorder Weather"
            className="shrink-0 touch-none cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </Button>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="compact"
              iconOnly
              label="Edit Weather"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="compact" iconOnly label="More actions: Weather">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </>
        }
      />
      {editing ? <p role="status">Editing Weather</p> : null}
    </div>
  );
}

const meta = {
  title: 'Components/Patterns/Folder Tab Handle',
  component: FolderTabHandle,
  args: { title: 'Weather', handle: null },
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Shared folder tab and baseline for editor groups. The default matches sectioned bento columns; compact reduces tab padding and radius for companion panels. Both preserve 36px drag and action targets. Callers supply translated labels and drag behavior. Rendered acceptance is pending maintainer review.',
      },
    },
  },
} satisfies Meta<typeof FolderTabHandle>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <HandleExample /> };
export const Compact: Story = {
  render: () => <HandleExample size="compact" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const handle = canvas.getByRole('button', { name: 'Reorder Weather' });
    await expect(handle.getBoundingClientRect().width).toBeGreaterThanOrEqual(36);
    await expect(handle.getBoundingClientRect().height).toBeGreaterThanOrEqual(36);
    await userEvent.click(handle);
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Edit Weather' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByRole('status')).toHaveTextContent('Editing Weather');
  },
};
export const CompactLongTitle: Story = {
  render: () => <HandleExample size="compact" longTitle />,
  play: async ({ canvasElement }) => {
    const handle = within(canvasElement).getByRole('button', { name: 'More actions: Weather' });
    await expect(handle).toBeVisible();
    const row = canvasElement.querySelector('[data-folder-tab]')?.parentElement;
    if (!row) throw new Error('Missing folder tab row');
    await expect(row.scrollWidth - row.clientWidth).toBeLessThanOrEqual(1);
  },
};
