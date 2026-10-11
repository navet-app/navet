import { integrationStore } from '@navet/app/stores/integration-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import type { NavetEntity } from '@navet/core/types';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CounterCard } from './counter-card';

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock('@navet/app/commands', () => ({ dispatchEntityCommand: dispatch }));
const id = 'home_assistant:counter.visits';
const entity: NavetEntity = {
  id,
  canonicalId: id,
  externalId: 'counter.visits',
  providerId: 'home_assistant',
  name: 'Visits',
  type: 'counter',
  primaryState: 4,
  availability: 'available',
  attributes: { value: 4, min: 0, max: 10, step: 2, initial: 0 },
  capabilities: ['counter_increment', 'counter_decrement', 'counter_reset', 'counter_value'],
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
    <CounterCard
      id={id}
      name="Visits"
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
  ['Increase', 'counter_increment', 6],
  ['Decrease', 'counter_decrement', 2],
  ['Reset', 'counter_reset', 0],
] as const)(
  'routes %s from the card without opening a dialog and waits for live confirmation',
  async (label, type, next) => {
    renderWithProviders(card());
    expect(screen.getByTitle('4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(dispatch).toHaveBeenCalledWith({ type, entityId: id }, 'home_assistant');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
    updateEntity({ primaryState: next, attributes: { ...entity.attributes, value: next } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Increase' })).toBeEnabled());
    expect(screen.getByTitle(String(next))).toBeInTheDocument();
  }
);

it('respects counter bounds, reset no-ops, edit mode and unavailable state', () => {
  updateEntity({ primaryState: 10, attributes: { ...entity.attributes, value: 10 } });
  const view = renderWithProviders(card());
  expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
  updateEntity({ primaryState: 0, attributes: { ...entity.attributes, value: 0 } });
  expect(screen.getByRole('button', { name: 'Decrease' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
  view.rerender(card(true));
  expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
  view.rerender(card());
  updateEntity({ availability: 'unavailable' });
  for (const name of ['Increase', 'Decrease', 'Reset']) {
    expect(screen.getByRole('button', { name })).toBeDisabled();
  }
  expect(dispatch).not.toHaveBeenCalled();
});

it('reports a failed action and allows retrying', async () => {
  dispatch.mockRejectedValueOnce(new Error('offline'));
  renderWithProviders(card());
  fireEvent.click(screen.getByRole('button', { name: 'Increase' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not update');
  fireEvent.click(screen.getByRole('button', { name: 'Increase' }));
  expect(dispatch).toHaveBeenCalledTimes(2);
  await act(async () => {});
});

it('keeps compact actions in the controls dialog', () => {
  renderWithProviders(card(false, 'extra-small'));
  expect(screen.queryByRole('button', { name: 'Increase' })).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Open settings for Visits' })[0]);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Increase' })).toBeEnabled();
});
