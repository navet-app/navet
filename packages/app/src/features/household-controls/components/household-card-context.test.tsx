import { dispatchEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import { integrationStore } from '@navet/app/stores/integration-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import type { NavetEntity } from '@navet/core/types';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CounterCard } from './counter-card';
import { RemoteCard } from './remote-card';
import { TimerCard } from './timer-card';
import { ValveCard } from './valve-card';

const cards = [
  { type: 'timer', Card: TimerCard },
  { type: 'counter', Card: CounterCard },
  { type: 'valve', Card: ValveCard },
  { type: 'remote', Card: RemoteCard },
] as const;

beforeEach(async () => {
  await resetAppStores();
});

describe('household card settings and identity context', () => {
  it.each(cards)(
    'opens the native $type dialog without rendering a card face',
    ({ type, Card }) => {
      const onOpenChange = vi.fn();
      const { container } = renderWithProviders(
        <Card
          id={`home_assistant:${type}.kitchen`}
          name="Kitchen control"
          room="Kitchen"
          providerId="home_assistant"
          size="small"
          isEditMode={false}
          dialog={{ isOpen: true, onOpenChange }}
        />
      );
      const dialog = screen.getByRole('dialog', { name: 'Kitchen control' });
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(container).not.toHaveTextContent('Kitchen control');
      fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    }
  );

  it.each(
    cards.flatMap((card) =>
      (['unknown', 'unavailable'] as const).map((availability) => ({ ...card, availability }))
    )
  )('preserves $availability status and disables $type actions', ({ type, Card, availability }) => {
    const id = `home_assistant:${type}.kitchen`;
    const entity: NavetEntity = {
      id,
      canonicalId: id,
      externalId: `${type}.kitchen`,
      providerId: 'home_assistant',
      name: 'Kitchen control',
      type,
      primaryState: null,
      availability,
      attributes: { phase: 'unknown', value: null, position: null, isOn: null },
      capabilities: ['timer_start', 'counter_increment', 'valve_open', 'toggle'],
    };
    act(() =>
      integrationStore.setState({
        providerEntitiesByProviderId: { home_assistant: { [id]: entity } },
      })
    );
    renderWithProviders(
      <Card
        id={id}
        name="Kitchen control"
        providerId="home_assistant"
        size="small"
        isEditMode={false}
      />
    );
    const label = availability === 'unknown' ? 'Unknown' : 'Unavailable';
    const wrongLabel = availability === 'unknown' ? 'Unavailable' : 'Unknown';
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.queryByText(wrongLabel)).not.toBeInTheDocument();
    if (type === 'remote') {
      expect(screen.getByRole('button', { name: 'Toggle Kitchen control' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Kitchen control' })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
      return;
    }
    const trigger =
      type === 'timer' || type === 'counter'
        ? 'Open settings for Kitchen control'
        : 'Controls for Kitchen control';
    fireEvent.click(screen.getAllByRole('button', { name: trigger })[0]);
    const dialog = within(screen.getByRole('dialog'));
    const actionName = {
      timer: 'Start',
      counter: 'Increase',
      valve: 'Open',
      remote: 'Turn on Kitchen control',
    }[type];
    expect(dialog.getByRole('button', { name: actionName })).toBeDisabled();
    if (availability === 'unknown')
      expect(dialog.queryByText('Unavailable')).not.toBeInTheDocument();
  });

  it.each(cards.filter((card) => card.type === 'valve'))(
    'opens $type Tiny controls from its card surface and preserves the edit-mode guard',
    ({ type, Card }) => {
      const props = {
        id: `home_assistant:${type}.kitchen`,
        name: 'Kitchen control',
        room: 'Kitchen',
        providerId: 'home_assistant' as const,
        size: 'tiny' as const,
      };
      const view = renderWithProviders(<Card {...props} isEditMode />);
      expect(
        screen.queryByRole('button', { name: /Controls for Kitchen control/ })
      ).not.toBeInTheDocument();
      view.rerender(<Card {...props} isEditMode={false} />);
      fireEvent.click(screen.getByRole('button', { name: /Controls for Kitchen control/ }));
      expect(screen.getByRole('dialog', { name: 'Kitchen control' })).toBeInTheDocument();
    }
  );
  it.each(cards)('opens only the matching $type edit-mode settings request', ({ type, Card }) => {
    const id = `home_assistant:${type}.kitchen`;
    renderWithProviders(
      <Card
        id={id}
        name="Kitchen control"
        room="Kitchen"
        providerId="home_assistant"
        size="small"
        isEditMode
      />
    );
    act(() => dispatchEditModeSettingsRequest('home_assistant:other.control'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => dispatchEditModeSettingsRequest(id));
    expect(screen.getByRole('dialog', { name: 'Kitchen control' })).toBeInTheDocument();
  });

  it.each(cards)('ignores $type settings requests outside edit mode', ({ type, Card }) => {
    const id = `home_assistant:${type}.kitchen`;
    renderWithProviders(
      <Card
        id={id}
        name="Kitchen control"
        providerId="home_assistant"
        size="small"
        isEditMode={false}
      />
    );
    act(() => dispatchEditModeSettingsRequest(id));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(cards.slice(0, 2))(
    'distinguishes identically named $type cards by room',
    ({ type, Card }) => {
      renderWithProviders(
        <>
          <Card
            id={`home_assistant:${type}.kitchen`}
            name="Household control"
            room="Kitchen"
            providerId="home_assistant"
            size="small"
            isEditMode={false}
          />
          <Card
            id={`home_assistant:${type}.bedroom`}
            name="Household control"
            room="Bedroom"
            providerId="home_assistant"
            size="small"
            isEditMode={false}
          />
        </>
      );
      expect(screen.getByText('Kitchen')).toBeInTheDocument();
      expect(screen.getByText('Bedroom')).toBeInTheDocument();
    }
  );
});
