import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { useDashboardDragSensors } from '../hooks/use-dashboard-drag-state';
import { DashboardCardItem } from './dashboard-card-item';
import { DashboardEditActions, DashboardResizeTrigger } from './dashboard-edit-actions';
import { HomeCardSlot } from './home-dashboard-overview-card-slot';

function SortableEditDockStory() {
  const [size, setSize] = useState<CardSize>('small');
  const [removed, setRemoved] = useState(false);
  const [dragged, setDragged] = useState(false);
  const sensors = useDashboardDragSensors();
  const cardId = 'switch.desk_power';

  return (
    <div className="space-y-4 p-8">
      <p className="text-sm text-white">
        Size: {size}. Dragged: {dragged ? 'yes' : 'no'}.
      </p>
      <DndContext sensors={sensors} onDragEnd={() => setDragged(true)}>
        <SortableContext items={[`home-card-${cardId}`]}>
          <DashboardEditActions isEditMode onRemoveFromLayout={() => setRemoved(true)}>
            {removed ? (
              <p className="text-white">Card removed</p>
            ) : (
              <div className="h-52 w-80">
                <HomeCardSlot
                  sortable
                  cardId={cardId}
                  cardLabel="Desk power"
                  isPreviewHidden={false}
                  className=""
                  content={
                    <DashboardCardItem
                      id={cardId}
                      device={{
                        id: cardId,
                        name: 'Desk power',
                        room: 'Office',
                        type: 'switches',
                        state: false,
                        size,
                      }}
                      size={size}
                      isEditMode
                      handleSizeChange={(_, nextSize) => setSize(nextSize)}
                      onRemoveFromLayout={() => setRemoved(true)}
                    />
                  }
                />
              </div>
            )}
          </DashboardEditActions>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function DashboardEditActionsStory() {
  const [size, setSize] = useState<'small' | 'medium' | 'large'>('medium');

  return (
    <div className="p-8">
      <DashboardEditActions
        isEditMode
        onDeleteCard={() => {}}
        onRemoveFromLayout={() => {}}
        onRemoveEntity={() => {}}
      >
        <div className="relative h-52 w-80 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
          <h3 className="text-sm font-semibold text-white">Editable Card</h3>
          <p className="mt-2 text-xs text-white/60">Overlay controls in edit mode</p>

          <div className="absolute right-3 top-3">
            <DashboardResizeTrigger
              cardSize={size}
              allowedSizes={['small', 'medium', 'large']}
              onSizeChange={(next) => setSize(next as 'small' | 'medium' | 'large')}
            />
          </div>

          <button
            type="button"
            data-dashboard-edit-action="delete-card"
            data-card-id="demo-card"
            className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-xl border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </DashboardEditActions>
    </div>
  );
}

const meta = {
  title: 'Components/Shared/Dashboard Edit Actions',
  component: DashboardEditActionsStory,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof DashboardEditActionsStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SortableEditDock: Story = {
  render: () => <SortableEditDockStory />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dragSurface = canvasElement.querySelector<HTMLElement>('[data-card-drag-surface="true"]');
    await waitFor(() => expect(canvasElement.querySelector('[inert] button')).not.toBeNull());
    await expect(
      page.getByRole('button', { name: 'Toggle Desk power' }).closest('[inert]')
    ).not.toBeNull();
    await expect(dragSurface).not.toBeNull();
    dragSurface?.focus();
    await userEvent.keyboard('  ');
    await expect(page.getByText(/Dragged: yes/)).toBeInTheDocument();

    await userEvent.click(page.getByRole('button', { name: 'Resize card' }));
    await userEvent.click(await page.findByRole('button', { name: 'Tiny (0.5 × 0.5)' }));
    await expect(page.getByText(/Size: tiny/)).toBeInTheDocument();
    await userEvent.click(page.getByRole('button', { name: 'More actions' }));
    await userEvent.click(
      await page.findByRole('button', { name: 'Open settings for Desk power' })
    );
    await userEvent.click(await page.findByRole('button', { name: 'Close' }, { timeout: 5000 }));
    await userEvent.click(page.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await page.findByRole('button', { name: 'Remove from home' }));
    await expect(page.getByText('Card removed')).toBeInTheDocument();
  },
};
