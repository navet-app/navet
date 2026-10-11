import { integrationStore } from '@navet/app/stores/integration-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import type { NavetEntity } from '@navet/core/types';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { TimerCard } from './timer-card';

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock('@navet/app/commands', () => ({ dispatchEntityCommand: dispatch }));
const id = 'home_assistant:timer.tea';
const entity: NavetEntity = {
  id,
  canonicalId: id,
  externalId: 'timer.tea',
  providerId: 'home_assistant',
  name: 'Tea timer',
  type: 'timer',
  primaryState: 'idle',
  availability: 'available',
  attributes: { phase: 'idle', durationSeconds: 300, remainingSeconds: null, finishesAt: null },
  capabilities: ['timer_start', 'timer_pause', 'timer_cancel', 'timer_finish'],
};
function updateEntity(update: Partial<NavetEntity> = {}) {
  act(() =>
    integrationStore.setState({
      providerEntitiesByProviderId: { home_assistant: { [id]: { ...entity, ...update } } },
    })
  );
}
function card(isEditMode = false, size: 'small' | 'extra-small' = 'small') {
  return (
    <TimerCard
      id={id}
      name="Tea timer"
      providerId="home_assistant"
      size={size}
      isEditMode={isEditMode}
    />
  );
}
beforeEach(async () => {
  await resetAppStores();
  dispatch.mockReset();
  dispatch.mockResolvedValue({ accepted: true, requiresEventConfirmation: true });
  updateEntity();
});

it.each([
  ['Start', 'timer_start', 'idle', 'active'],
  ['Resume', 'timer_start', 'paused', 'active'],
  ['Pause', 'timer_pause', 'active', 'paused'],
  ['Cancel timer', 'timer_cancel', 'active', 'idle'],
] as const)(
  'routes %s without opening a dialog and waits for live confirmation',
  async (label, type, phase, next) => {
    updateEntity({ primaryState: phase, attributes: { ...entity.attributes, phase } });
    renderWithProviders(card());
    expect(screen.getByTitle('00:05:00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(dispatch).toHaveBeenCalledWith({ type, entityId: id }, 'home_assistant');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => {});
    expect(screen.getByRole('button', { name: label })).toBeDisabled();
    updateEntity({ primaryState: next, attributes: { ...entity.attributes, phase: next } });
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: next === 'active' ? 'Pause' : next === 'paused' ? 'Resume' : 'Start',
        })
      ).toBeEnabled()
    );
  }
);

it('respects phase, capabilities, edit mode and unavailable state', () => {
  const view = renderWithProviders(card());
  expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel timer' })).toBeDisabled();
  updateEntity({ capabilities: [] });
  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  updateEntity();
  view.rerender(card(true));
  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  fireEvent.click(screen.getAllByRole('button', { name: 'Open settings for Tea timer' })[0]);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  view.rerender(card());
  updateEntity({ availability: 'unavailable' });
  for (const name of ['Start', 'Pause', 'Cancel timer']) {
    expect(screen.getByRole('button', { name })).toBeDisabled();
  }
  expect(dispatch).not.toHaveBeenCalled();
});

it('reports a failed action and allows retrying', async () => {
  dispatch.mockRejectedValueOnce(new Error('offline'));
  renderWithProviders(card());
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not update');
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  expect(dispatch).toHaveBeenCalledTimes(2);
  await act(async () => {});
});

it.each(['extra-small'] as const)('keeps %s actions in the controls dialog', (size) => {
  renderWithProviders(card(false, size));
  expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Open settings for Tea timer' })[0]);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
});
