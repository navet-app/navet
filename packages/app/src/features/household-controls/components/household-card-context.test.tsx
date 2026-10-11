import { dispatchEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import { renderWithProviders } from '@navet/app/test/render';
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

describe('household card settings and identity context', () => {
  it.each(cards.slice(2))(
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
