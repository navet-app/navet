import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import { integrationStore } from '@navet/app/stores/integration-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import type { NavetEntity } from '@navet/core/types';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { Sliders } from 'lucide-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityHelperControls, selectRelatedHelpers } from './entity-helper-controls';

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock('@navet/app/commands', () => ({ dispatchEntityCommand: dispatch }));
const parent: NavetEntity = {
  id: 'home_assistant:light.kitchen',
  canonicalId: 'home_assistant:light.kitchen',
  providerId: 'home_assistant',
  externalId: 'light.kitchen',
  type: 'light',
  name: 'Kitchen',
  primaryState: 'on',
  availability: 'available',
  attributes: { deviceId: 'shared-device' },
  capabilities: ['toggle'],
};
const helper: NavetEntity = {
  ...parent,
  id: 'home_assistant:number.delay',
  canonicalId: 'home_assistant:number.delay',
  externalId: 'number.delay',
  type: 'helper',
  name: 'Delay',
  primaryState: 5,
  attributes: {
    deviceId: 'shared-device',
    helperType: 'number',
    value: 5,
    min: 0,
    max: 10,
    step: 1,
    writable: true,
  },
  capabilities: ['number_value'],
};

describe('parent helper controls', () => {
  beforeEach(async () => {
    await resetAppStores();
    dispatch.mockReset().mockResolvedValue({ accepted: true, requiresEventConfirmation: false });
  });
  it('requires a device relationship within the same provider and excludes the parent', () => {
    const otherProvider: NavetEntity = {
      ...helper,
      providerId: 'openhab',
      canonicalId: 'openhab:delay',
    };
    const lone = {
      ...helper,
      canonicalId: 'home_assistant:number.lone',
      attributes: { ...helper.attributes, deviceId: undefined },
    };
    expect(selectRelatedHelpers(parent, { parent, helper, otherProvider, lone })).toEqual([helper]);
    expect(selectRelatedHelpers({ ...parent, attributes: {} }, { helper })).toEqual([]);
    expect(selectRelatedHelpers(helper, { helper })).toEqual([]);
  });
  it('expands the helper editor, retains its draft on collapse, and routes Save to its owner', async () => {
    integrationStore.setState({
      providerEntitiesByProviderId: {
        home_assistant: { [parent.canonicalId]: parent, [helper.canonicalId]: helper },
      },
    });
    renderWithProviders(<EntityHelperControls entityId={parent.canonicalId} />);
    const row = screen.getByRole('button', { name: 'Delay' });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(row);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } });
    fireEvent.click(row);
    fireEvent.click(row);
    expect(screen.getByRole('spinbutton')).toHaveValue(7);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        { type: 'set_number_value', entityId: helper.canonicalId, value: 7 },
        'home_assistant'
      )
    );
  });
  it('keeps helpers in the parent controls and excludes helpers already represented by the dialog', () => {
    integrationStore.setState({
      providerEntitiesByProviderId: {
        home_assistant: { [parent.canonicalId]: parent, [helper.canonicalId]: helper },
      },
    });
    const { unmount } = renderWithProviders(
      <BaseCardDialog
        isOpen
        onOpenChange={() => undefined}
        title="Kitchen"
        entityId={parent.canonicalId}
        theme="dark"
        tabs={[
          {
            key: 'controls',
            label: 'Controls',
            icon: Sliders,
            content: <p>Main light controls</p>,
          },
        ]}
      />
    );
    expect(screen.getByText('Main light controls')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delay' })).toBeInTheDocument();
    unmount();
    renderWithProviders(
      <EntityHelperControls entityId={parent.canonicalId} excludeEntityIds={[helper.externalId]} />
    );
    expect(screen.queryByRole('button', { name: 'Delay' })).not.toBeInTheDocument();
  });

  it('blocks duplicate boolean writes until live confirmation', async () => {
    dispatch.mockResolvedValue({ accepted: true, requiresEventConfirmation: true });
    const boolean: NavetEntity = {
      ...helper,
      name: 'Night mode',
      primaryState: 'off',
      attributes: { deviceId: 'shared-device' },
      capabilities: ['toggle'],
    };
    integrationStore.setState({
      providerEntitiesByProviderId: {
        home_assistant: { [parent.canonicalId]: parent, [boolean.canonicalId]: boolean },
      },
    });
    renderWithProviders(<EntityHelperControls entityId={parent.canonicalId} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Night mode' }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        { type: 'turn_on', entityId: boolean.canonicalId },
        'home_assistant'
      )
    );
    expect(screen.getByRole('switch', { name: 'Night mode' })).toBeDisabled();
    fireEvent.click(screen.getByRole('switch', { name: 'Night mode' }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    act(() =>
      integrationStore.setState({
        providerEntitiesByProviderId: {
          home_assistant: {
            [parent.canonicalId]: parent,
            [boolean.canonicalId]: { ...boolean, primaryState: 'on' },
          },
        },
      })
    );
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Night mode' })).not.toBeDisabled()
    );
    expect(screen.getByRole('switch', { name: 'Night mode' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('disables an unavailable helper and masks password text in the collapsed row', () => {
    const password: NavetEntity = {
      ...helper,
      name: 'Password',
      attributes: {
        deviceId: 'shared-device',
        helperType: 'text',
        value: 'secret',
        minLength: 0,
        maxLength: 40,
        mode: 'password',
        writable: true,
      },
      capabilities: ['text_value'],
    };
    integrationStore.setState({
      providerEntitiesByProviderId: {
        home_assistant: { [parent.canonicalId]: parent, [password.canonicalId]: password },
      },
    });
    const { unmount } = renderWithProviders(<EntityHelperControls entityId={parent.canonicalId} />);
    expect(screen.getByText('••••')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    unmount();
    integrationStore.setState({
      providerEntitiesByProviderId: {
        home_assistant: {
          [parent.canonicalId]: parent,
          [helper.canonicalId]: { ...helper, availability: 'unavailable' },
        },
      },
    });
    renderWithProviders(<EntityHelperControls entityId={parent.canonicalId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delay' }));
    expect(screen.getByRole('spinbutton')).toBeDisabled();
  });
});
