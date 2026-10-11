import { integrationStore } from '@navet/app/stores/integration-store';
import { EntityCardStoryFrame } from '@navet/app/storybook/story-frames';
import type { NavetEntity } from '@navet/core/types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentProps, useEffect } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { HelperCard } from './helper-card';

function WritableHelperCardStory(args: ComponentProps<typeof HelperCard>) {
  useEffect(() => {
    const previous = integrationStore.getState();
    const entity: NavetEntity = {
      id: args.id,
      canonicalId: args.id,
      providerId: 'home_assistant',
      externalId: args.id.split(':').at(-1) ?? args.id,
      type: 'helper',
      name: args.name,
      primaryState: args.helper.value,
      availability: 'available',
      attributes: { ...args.helper },
      capabilities: [
        args.helper.helperType === 'number'
          ? 'number_value'
          : args.helper.helperType === 'select'
            ? 'select_option'
            : args.helper.helperType === 'text'
              ? 'text_value'
              : 'datetime_value',
      ],
    };
    integrationStore.setState({
      providerEntitiesByProviderId: {
        ...previous.providerEntitiesByProviderId,
        home_assistant: {
          ...previous.providerEntitiesByProviderId.home_assistant,
          [args.id]: entity,
        },
      },
    });
    return () =>
      integrationStore.setState({
        providerEntitiesByProviderId: previous.providerEntitiesByProviderId,
      });
  }, [args.id, args.name, args.helper]);
  return (
    <EntityCardStoryFrame size={args.size}>
      <HelperCard {...args} />
    </EntityCardStoryFrame>
  );
}
const meta = {
  title: 'Cards/Entity/Writable Helper',
  component: WritableHelperCardStory,
  tags: ['autodocs'],
  args: {
    id: 'home_assistant:input_number.target',
    name: 'Target temperature',
    room: 'Kitchen',
    providerId: 'home_assistant',
    size: 'small',
    isEditMode: false,
    helper: {
      helperType: 'number',
      value: 21.5,
      writable: true,
      min: 15,
      max: 30,
      step: 0.5,
      unit: '°C',
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Extends Cards/Entity/Helper with live values and existing controls-first dialog primitives. The story installs a normalized runtime entity. The keyboard interaction story exercises a disconnected write and retry; no backend connection is required.',
      },
    },
  },
} satisfies Meta<typeof WritableHelperCardStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Numeric: Story = {};
export const Tiny: Story = {
  args: { size: 'tiny' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Kitchen')).toBeVisible();
    const trigger = canvas.getByRole('button', { name: 'Target temperature, 21.5 °C' });
    await expect(canvas.queryByText('21.5', { exact: true })).not.toBeInTheDocument();
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await expect(
      within(document.body).getByRole('spinbutton', { name: 'Target temperature' })
    ).toHaveValue(21.5);
  },
};
export const Medium: Story = { args: { size: 'medium' } };
export const Selector: Story = {
  args: {
    name: 'House mode',
    helper: {
      helperType: 'select',
      value: 'Home',
      writable: true,
      options: ['Home', 'Away', 'Guests'],
    },
  },
};
export const Text: Story = {
  args: {
    name: 'Household note',
    helper: {
      helperType: 'text',
      value: 'Please close the garage door before leaving for work',
      writable: true,
      minLength: 0,
      maxLength: 255,
      mode: 'text',
    },
  },
};
export const DateTime: Story = {
  args: {
    name: 'Heating schedule',
    helper: { helperType: 'datetime', value: '2026-10-11 07:30:00', writable: true },
  },
};

export const KeyboardWriteFailure: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Kitchen')).toBeVisible();
    const trigger = canvas.getByRole('button', { name: 'Target temperature' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const dialog = within(document.body).getByRole('dialog');
    const controls = within(dialog);
    const field = controls.getByRole('spinbutton', { name: 'Target temperature' });
    await waitFor(() => expect(field).toBeEnabled());
    await userEvent.clear(field);
    await userEvent.type(field, '22.5');
    const root = document.documentElement;
    const runtime = root.dataset.navetPreviewRuntime;
    const storybook = root.dataset.navetStorybook;
    delete root.dataset.navetPreviewRuntime;
    delete root.dataset.navetStorybook;
    try {
      await userEvent.click(controls.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(controls.getByRole('alert')).toHaveTextContent(
          'Unable to update the value. Try again.'
        )
      );
      await expect(field).toHaveValue(22.5);
      await expect(controls.getByRole('button', { name: 'Save' })).toBeEnabled();
    } finally {
      if (runtime === undefined) delete root.dataset.navetPreviewRuntime;
      else root.dataset.navetPreviewRuntime = runtime;
      if (storybook === undefined) delete root.dataset.navetStorybook;
      else root.dataset.navetStorybook = storybook;
    }
  },
};
