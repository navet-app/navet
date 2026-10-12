import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import { integrationStore } from '@navet/app/stores/integration-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import type { NavetEntity } from '@navet/core/types';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { Sliders } from 'lucide-react';
import { userEvent } from 'storybook/test';
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
  it('sorts helper names naturally within each availability group', () => {
    const first = { ...helper, name: 'alpha 2', canonicalId: 'home_assistant:number.z' };
    const second = { ...helper, name: 'Alpha 10', canonicalId: 'home_assistant:number.y' };
    const unavailable = {
      ...helper,
      name: 'Beta',
      canonicalId: 'home_assistant:number.a',
      availability: 'unavailable' as const,
    };
    const unknown = {
      ...helper,
      name: 'Alpha',
      canonicalId: 'home_assistant:number.b',
      availability: 'unknown' as const,
    };
    expect(selectRelatedHelpers(parent, { unavailable, second, unknown, helper, first })).toEqual([
      first,
      second,
      helper,
      unknown,
      unavailable,
    ]);
  });
  it('keeps long lists keyboard-reachable and preserves an edited draft while scrolling', async () => {
    const helpers = Array.from(
      { length: 16 },
      (_, index): NavetEntity => ({
        ...helper,
        id: `home_assistant:number.helper_${String(index).padStart(2, '0')}`,
        canonicalId: `home_assistant:number.helper_${String(index).padStart(2, '0')}`,
        externalId: `number.helper_${String(index).padStart(2, '0')}`,
        name: `Helper ${index + 1}`,
      })
    );
    integrationStore.setState({
      providerEntitiesByProviderId: {
        home_assistant: {
          [parent.canonicalId]: parent,
          ...Object.fromEntries(helpers.map((entity) => [entity.canonicalId, entity])),
        },
      },
    });
    renderWithProviders(<EntityHelperControls entityId={parent.canonicalId} />);
    const viewport = screen.getByRole('region');
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 640 },
    });
    expect(viewport).toHaveClass('helper-list-bottom-fade');
    expect(viewport).not.toHaveClass('helper-list-top-fade');
    const buttons = screen.getAllByRole('button', { name: /^Helper \d+$/ });
    expect(buttons).toHaveLength(16);
    viewport.focus();
    await userEvent.tab();
    expect(buttons[0]).toHaveFocus();
    // Sample native Tab order beyond the visible rows without traversing the entire DOM.
    buttons[12].focus();
    await userEvent.tab();
    expect(buttons[13]).toHaveFocus();
    buttons[14].focus();
    await userEvent.tab();
    expect(buttons[15]).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Helper 1' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } });
    fireEvent.scroll(viewport, { target: { scrollTop: 340 } });
    expect(viewport).toHaveClass('helper-list-top-fade');
    expect(viewport).not.toHaveClass('helper-list-bottom-fade');
    expect(screen.getByRole('button', { name: 'Helper 16' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toHaveValue(7);
    fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
    expect(viewport).not.toHaveClass('helper-list-top-fade');
    expect(viewport).toHaveClass('helper-list-bottom-fade');
    expect(screen.getByRole('button', { name: 'Helper 1' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByRole('spinbutton')).toHaveValue(7);
  });

  it('keeps short helper lists in the existing inline layout', () => {
    integrationStore.setState({
      providerEntitiesByProviderId: {
        home_assistant: { [parent.canonicalId]: parent, [helper.canonicalId]: helper },
      },
    });
    renderWithProviders(<EntityHelperControls entityId={parent.canonicalId} />);
    expect(screen.getByRole('button', { name: 'Delay' })).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
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
    const input = screen.getByRole('spinbutton', { name: 'Delay' });
    expect(input.closest('form')?.querySelector('label')).toHaveClass('sr-only');
    expect(screen.getByRole('button', { name: 'Save' }).parentElement).toContainElement(
      screen.getByRole('spinbutton')
    );
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
    expect(screen.queryByRole('heading', { name: 'Controls' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Helpers' })).toBeInTheDocument();
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

  it.each(['press', 'toggle'] as const)(
    'lets a stalled %s command time out and retry without accepting its late response',
    async (capability) => {
      let completeFirst!: (result: {
        accepted: boolean;
        requiresEventConfirmation: boolean;
      }) => void;
      dispatch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            completeFirst = resolve;
          })
      );
      const actionHelper: NavetEntity = {
        ...helper,
        name: 'Related control',
        primaryState: 'off',
        attributes: { deviceId: 'shared-device' },
        capabilities: [capability],
      };
      integrationStore.setState({
        providerEntitiesByProviderId: {
          home_assistant: {
            [parent.canonicalId]: parent,
            [actionHelper.canonicalId]: actionHelper,
          },
        },
      });
      renderWithProviders(<EntityHelperControls entityId={parent.canonicalId} />);
      vi.useFakeTimers();
      try {
        const control = screen.getByRole(capability === 'press' ? 'button' : 'switch', {
          name: /Related control/,
        });
        fireEvent.click(control);
        expect(control).toBeDisabled();
        expect(dispatch).toHaveBeenCalledWith(
          {
            type: capability === 'press' ? 'press' : 'turn_on',
            entityId: actionHelper.canonicalId,
          },
          'home_assistant'
        );
        await act(() => vi.advanceTimersByTimeAsync(10000));
        expect(control).not.toBeDisabled();
        expect(screen.getByRole('alert')).toBeInTheDocument();
        dispatch.mockImplementationOnce(() => new Promise(() => {}));
        fireEvent.click(control);
        expect(dispatch).toHaveBeenCalledTimes(2);
        expect(control).toBeDisabled();
        await act(async () => completeFirst({ accepted: true, requiresEventConfirmation: true }));
        expect(control).toBeDisabled();
        await act(() => vi.advanceTimersByTimeAsync(10000));
        expect(control).not.toBeDisabled();
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it.each(['press', 'toggle'] as const)(
    'shows an unavailable %s helper as a non-interactive reading and restores its control when available',
    (capability) => {
      const actionHelper: NavetEntity = {
        ...helper,
        name: 'Related control',
        availability: 'unavailable',
        attributes: { deviceId: 'shared-device' },
        capabilities: [capability],
      };
      const setHelper = (entity: NavetEntity) =>
        integrationStore.setState({
          providerEntitiesByProviderId: {
            home_assistant: {
              [parent.canonicalId]: parent,
              [entity.canonicalId]: entity,
            },
          },
        });
      setHelper(actionHelper);
      renderWithProviders(<EntityHelperControls entityId={parent.canonicalId} />);
      expect(
        screen.queryByRole(capability === 'press' ? 'button' : 'switch', {
          name: /Related control/,
        })
      ).not.toBeInTheDocument();
      expect(screen.getAllByText('Unavailable')).toHaveLength(1);
      expect(screen.queryByText('Run')).not.toBeInTheDocument();
      const row = screen.getByText('Related control').closest('div');
      expect(row).toContainElement(screen.getByText('Unavailable'));
      expect(row?.querySelector('svg')).toBeNull();
      fireEvent.click(screen.getByText('Related control'));
      expect(dispatch).not.toHaveBeenCalled();
      act(() => setHelper({ ...actionHelper, availability: 'available' }));
      expect(
        screen.getByRole(capability === 'press' ? 'button' : 'switch', { name: /Related control/ })
      ).not.toBeDisabled();
      expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
      if (capability === 'press') expect(screen.getByText('Run')).toBeInTheDocument();
    }
  );

  it('renders an unavailable writable helper without an editor and masks available password text', () => {
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
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delay' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });
});
