import { Button } from '@navet/app/components/primitives';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { AddEntityDialogPrimitive } from './primitive';

const demoLibraryCards = [
  {
    id: 'light.living_room',
    title: 'Living Room Main Light',
    subtitle: 'light.living_room_main',
    room: 'Living Room',
    meta: 'Living Room',
    kind: 'device' as const,
  },
  {
    id: 'sensor.kitchen_temperature',
    title: 'Kitchen Temperature',
    subtitle: 'sensor.kitchen_temperature',
    room: 'Kitchen',
    meta: 'Kitchen',
    kind: 'device' as const,
  },
  {
    id: 'fan.hallway',
    title: 'Hallway Fan',
    subtitle: 'fan.hallway',
    room: 'Hallway',
    meta: 'Fan',
    kind: 'device' as const,
  },
  {
    id: 'widget.quick_note',
    title: 'Quick Note',
    subtitle: 'Widget',
    room: 'Living Room',
    meta: 'Custom',
    kind: 'widget' as const,
  },
];

const meta = {
  title: 'Pages/Dashboard/Add Entity Dialog',
  component: AddEntityDialogPrimitive,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    open: true,
    onClose: () => {},
    onAddCard: () => {},
    onAddLibraryCard: () => {},
    currentRoom: 'Living Room',
    libraryCards: demoLibraryCards,
    showCardsTab: true,
  },
} satisfies Meta<typeof AddEntityDialogPrimitive>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const PhoneCoverSheet: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole('dialog', { name: 'Add Card' });
    const header = dialog.querySelector('[data-add-card-header]') as HTMLElement;
    const headerContent = within(header);
    await expect(dialog).toHaveClass(
      'max-sm:!h-[80dvh]',
      'max-sm:!rounded-t-[30px]',
      'max-sm:!rounded-b-none',
      'max-sm:!bottom-0'
    );
    await expect(header).toHaveClass(
      'px-4',
      'py-3',
      'max-sm:pt-2',
      'max-sm:pr-4',
      'sm:px-5',
      'sm:py-4'
    );
    await expect(header.className).not.toContain('safe-area-inset-top');
    await expect(header).not.toHaveClass('flex');
    await expect(getComputedStyle(headerContent.getByText('Add Card')).fontSize).toBe('18px');
    await expect(headerContent.getByRole('button', { name: 'All cards' })).toHaveClass('text-xs');
    await expect(headerContent.getByText('All cards')).toHaveClass('font-normal');
    await expect(headerContent.getByRole('button', { name: 'Custom cards' })).toHaveClass(
      'text-xs'
    );
    await expect(headerContent.getByText('Custom cards')).toHaveClass('font-normal');
    await expect(getComputedStyle(page.getByPlaceholderText('Search entities')).fontSize).toBe(
      '14px'
    );
    await userEvent.click(page.getByRole('button', { name: 'Filter' }));
    await expect(page.getByRole('menuitemradio', { name: 'All cards' })).toBeInTheDocument();
    await userEvent.click(page.getByRole('menuitemradio', { name: 'Kitchen' }));
    await expect(page.getByRole('button', { name: 'Filter: Kitchen' })).toBeInTheDocument();
    const addButton = page.getByRole('button', { name: 'Add: Kitchen Temperature' });
    const entityList = addButton.closest('[data-dashboard-library-list]');
    await expect(entityList).toHaveClass('rounded-[24px]', 'border');
    await expect(addButton).toHaveClass('h-[30px]', 'rounded-full');
    await userEvent.click(headerContent.getByRole('button', { name: 'Custom cards' }));
    await expect(dialog.querySelector('[data-custom-card-list]')).toHaveClass(
      'rounded-[24px]',
      'border'
    );
    await userEvent.click(page.getByRole('button', { name: /Action/ }));
    const backButton = page.getByRole('button', { name: 'Back' });
    const addWidgetButton = page.getByRole('button', { name: 'Add Widget' });
    await expect(backButton.parentElement).toHaveClass('!flex-nowrap', '!justify-between');
    await expect(backButton).toHaveClass('h-10');
    await expect(addWidgetButton).toHaveClass('h-10');
    await expect(backButton.getBoundingClientRect().height).toBe(
      addWidgetButton.getBoundingClientRect().height
    );
    await expect(backButton).not.toHaveClass('w-full');
    await expect(addWidgetButton).not.toHaveClass('w-full');
    await expect(
      page.getByRole('button', { name: 'Drag dialog to fullscreen or close' })
    ).toBeInTheDocument();
  },
  globals: {
    viewport: {
      value: 'mobile1',
      isRotated: false,
    },
  },
};

export const WidgetsOnly: Story = {
  args: {
    showCardsTab: false,
  },
};

/** Entity pickers reuse Home's library recipe, with custom-card authoring omitted. */
export const EntityLibrary: Story = {
  args: {
    libraryOnly: true,
    title: 'Add entity',
    description: 'Choose connected entities for this dashboard.',
  },
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('dialog', { name: 'Add entity' });
    await expect(page.queryByRole('button', { name: /Custom cards/ })).not.toBeInTheDocument();
    await userEvent.type(page.getByPlaceholderText('Search entities'), 'Kitchen');
    await expect(
      page.getByRole('button', { name: 'Add: Kitchen Temperature' })
    ).toBeInTheDocument();
    await userEvent.click(page.getByRole('button', { name: 'Add: Kitchen Temperature' }));
    await expect(
      page.queryByRole('button', { name: 'Add: Kitchen Temperature' })
    ).not.toBeInTheDocument();
  },
};

export const EntityLibraryPhone: Story = {
  args: EntityLibrary.args,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole('dialog', { name: 'Add entity' });
    await expect(dialog).toHaveClass('max-sm:!h-[80dvh]', 'max-sm:!bottom-0');
    await userEvent.click(page.getByRole('button', { name: 'Filter' }));
    await userEvent.click(page.getByRole('menuitemradio', { name: 'Kitchen' }));
    await expect(
      page.getByRole('button', { name: 'Add: Kitchen Temperature' })
    ).toBeInTheDocument();
    await expect(page.queryByRole('button', { name: 'Add: Hallway Fan' })).not.toBeInTheDocument();
  },
};

export const EnergyLibrary: Story = {
  globals: { viewport: { value: 'desktop1080p', isRotated: false } },
  args: {
    showCardsTab: false,
    currentRoom: 'Energy',
    libraryCards: [],
    allowedTemplateIds: ['energy-now', 'energy-metric'],
  },
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole('dialog', { name: 'Add Card' });
    const sidebar = within(dialog).getByRole('navigation', { name: 'Add Card' });
    await waitFor(() =>
      expect(within(sidebar).getByRole('button', { name: /Custom cards/ })).toBeVisible()
    );
    await expect(page.getByText('Energy Now')).toBeVisible();
    await userEvent.click(page.getByText('Energy Metric'));
    await expect(await page.findByRole('button', { name: /Add widget/i })).toBeVisible();
  },
};

/** Reuses EntityLibrary's search, row actions and responsive workspace for recovery. */
export const RestoreEntities: Story = {
  args: {
    libraryOnly: true,
    currentRoom: 'All',
    title: 'Restore entities',
    description: 'Find a hidden entity to restore, or restore all hidden entities.',
    actionLabel: 'Restore',
    libraryEmptyText: 'No hidden entities to restore.',
    footer: <Button variant="secondary">Restore all</Button>,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Reference: pages-dashboard-add-entity-dialog--entity-library. Entity visibility reuses its picker and adds a secondary Restore all footer action. Rendered maintainer acceptance is pending.',
      },
    },
  },
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('dialog', { name: 'Restore entities' });
    await userEvent.type(page.getByPlaceholderText('Search entities'), 'Kitchen');
    await userEvent.click(page.getByRole('button', { name: 'Restore: Kitchen Temperature' }));
    await expect(
      page.queryByRole('button', { name: 'Restore: Kitchen Temperature' })
    ).not.toBeInTheDocument();
    await expect(page.getByRole('button', { name: 'Restore all' })).toBeInTheDocument();
  },
};

export const RestoreEntitiesPhone: Story = {
  ...RestoreEntities,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
