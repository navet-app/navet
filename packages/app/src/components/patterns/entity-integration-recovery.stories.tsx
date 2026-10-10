import { Button } from '@navet/app/components/primitives/button';
import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { renderCard } from '@navet/app/features/dashboard/utils/card-renderer';
import { useTheme } from '@navet/app/hooks';
import {
  createPreviewLightEntity,
  createPreviewStoryScenario,
  replacePreviewEntity,
} from '@navet/app/preview/runtime';
import { integrationAdminService } from '@navet/app/services/integration-admin.service';
import { EntityCardStoryFrame } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Sliders } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

const ENTITY_ID = 'home_assistant:light.kitchen';

function RecoveryStory() {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open unavailable entity</Button>
      <BaseCardDialog
        isOpen={open}
        onOpenChange={setOpen}
        title="Kitchen light"
        entityId={ENTITY_ID}
        theme={theme}
        tabs={[{ key: 'controls', label: 'Controls', icon: Sliders, content: <p>Unavailable</p> }]}
      />
    </>
  );
}

const meta = {
  title: 'Components/Patterns/Entity Integration Recovery',
  component: RecoveryStory,
  parameters: {
    docs: {
      description: {
        component:
          'Manual recovery from an unavailable entity’s More actions menu. Reuses components-primitives-cards-basecarddialog--default and components-primitives-alert-dialog--default. Provider-neutral service fixtures replace backend calls; no live integration is reloaded. Review confirmation, pending, failure and unsupported states on phone and desktop in all four themes.',
      },
    },
  },
  beforeEach: () => {
    const originalAvailable = integrationAdminService.canReloadEntityIntegration;
    const originalReload = integrationAdminService.reloadEntityIntegration;
    integrationAdminService.canReloadEntityIntegration = (id) => id === ENTITY_ID;
    integrationAdminService.reloadEntityIntegration = async () => undefined;
    return () => {
      integrationAdminService.canReloadEntityIntegration = originalAvailable;
      integrationAdminService.reloadEntityIntegration = originalReload;
    };
  },
} satisfies Meta<typeof RecoveryStory>;
export default meta;
type Story = StoryObj<typeof meta>;

async function openConfirmation(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(page.getByRole('button', { name: 'Open unavailable entity' }));
  await userEvent.click(
    page
      .getAllByRole('button', { name: 'More actions' })
      .find((button) => button.getBoundingClientRect().width > 0) ??
      page.getAllByRole('button', { name: 'More actions' })[0]
  );
  await userEvent.click(await page.findByRole('menuitem', { name: 'Reload integration' }));
  await expect(await page.findByRole('alertdialog', { name: 'Reload integration?' })).toBeVisible();
  return page;
}

export const Confirmation: Story = {
  play: async ({ canvasElement }) => {
    await openConfirmation(canvasElement);
  },
};

export const Pending: Story = {
  play: async ({ canvasElement }) => {
    integrationAdminService.reloadEntityIntegration = () => new Promise<void>(() => {});
    const page = await openConfirmation(canvasElement);
    await userEvent.click(page.getByRole('button', { name: 'Reload integration' }));
    await expect(page.getByRole('button', { name: 'Reloading integration…' })).toBeDisabled();
  },
};

export const Failure: Story = {
  play: async ({ canvasElement }) => {
    integrationAdminService.reloadEntityIntegration = async () => {
      throw new Error('Connection lost');
    };
    const page = await openConfirmation(canvasElement);
    await userEvent.click(page.getByRole('button', { name: 'Reload integration' }));
    await expect(await page.findByRole('alert')).toHaveTextContent('administrator access');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reload integration' })).toBeEnabled();
  },
};

export const Unsupported: Story = {
  play: async ({ canvasElement }) => {
    integrationAdminService.canReloadEntityIntegration = () => false;
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Open unavailable entity' }));
    const trigger = page
      .getAllByRole('button', { name: 'More actions' })
      .find((button) => button.getBoundingClientRect().width > 0);
    if (!trigger) throw new Error('Missing visible More actions control');
    await userEvent.click(trigger);
    await expect(
      page.queryByRole('menuitem', { name: 'Reload integration' })
    ).not.toBeInTheDocument();
  },
};

function UnavailableCardStory({ size }: { size: CardSize }) {
  return (
    <EntityCardStoryFrame size={size}>
      {renderCard({
        device: { id: ENTITY_ID, name: 'Kitchen light', type: 'lights', state: 'unavailable' },
        size,
        handleSizeChange: () => undefined,
        isEditMode: false,
      })}
    </EntityCardStoryFrame>
  );
}

export const UnavailableCard: Story = {
  render: () => <UnavailableCardStory size="small" />,
  parameters: {
    previewRuntime: {
      scenario: replacePreviewEntity(createPreviewStoryScenario(), {
        ...createPreviewLightEntity('light.kitchen'),
        primaryState: 'unavailable',
        availability: 'unavailable',
        attributes: { value: 'unavailable' },
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByText('Unavailable')).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await page.findByRole('menuitem', { name: 'Reload integration' }));
    await expect(
      await page.findByRole('alertdialog', { name: 'Reload integration?' })
    ).toBeVisible();
  },
};

export const UnavailableTinyCard: Story = {
  ...UnavailableCard,
  render: () => <UnavailableCardStory size="tiny" />,
};
