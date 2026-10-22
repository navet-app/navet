import { integrationStore } from '@navet/app/stores/integration-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import type { NavetEntity } from '@navet/core/types';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LockCard } from '../lock-card';

const { lockEntityMock, toastErrorMock, unlockEntityMock } = vi.hoisted(() => ({
  lockEntityMock: vi.fn().mockResolvedValue(undefined),
  toastErrorMock: vi.fn(),
  unlockEntityMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@navet/app/services/integration-security-feature.service', () => ({
  integrationSecurityFeatureService: {
    lockEntity: lockEntityMock,
    unlockEntity: unlockEntityMock,
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
  },
}));

const id = 'home_assistant:lock.front_door';

function renderLockCard(dialogOpen = false) {
  return renderWithProviders(
    <LockCard
      id={id}
      name="Front Door"
      initialState
      size="small"
      isEditMode={false}
      dialog={dialogOpen ? { isOpen: true, onOpenChange: () => {} } : undefined}
    />
  );
}

function setLockEntity(state: 'locked' | 'unlocked') {
  const entity: NavetEntity = {
    id,
    canonicalId: id,
    externalId: 'lock.front_door',
    providerId: 'home_assistant',
    name: 'Front Door',
    type: 'lock',
    primaryState: state,
    availability: 'available',
    capabilities: ['lock'],
    attributes: { value: state, locked: state === 'locked' },
  };
  integrationStore.setState({
    providerEntitiesByCanonicalId: { [id]: entity },
    providerEntitiesByProviderId: { home_assistant: { [id]: entity } },
  });
}

describe('LockCard', () => {
  beforeEach(async () => {
    await resetAppStores();
    integrationStore.setState((state) => ({
      providerRuntime: {
        ...state.providerRuntime,
        home_assistant: { ...state.providerRuntime.home_assistant, connected: true },
      },
    }));
    setLockEntity('locked');
    lockEntityMock.mockReset();
    lockEntityMock.mockResolvedValue(undefined);
    toastErrorMock.mockReset();
    unlockEntityMock.mockReset();
    unlockEntityMock.mockResolvedValue(undefined);
  });

  it('shows a loading state until the provider entity echoes the unlock', async () => {
    setLockEntity('locked');
    renderLockCard();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Slide to unlock' }), { key: ' ' });

    await waitFor(() => expect(unlockEntityMock).toHaveBeenCalledWith(id));
    expect(screen.getByText('Unlocking...')).toBeInTheDocument();
    expect(screen.queryByText('Unlocked')).not.toBeInTheDocument();

    act(() => setLockEntity('unlocked'));

    expect(screen.getByText('Unlocked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Slide to lock' })).toBeInTheDocument();
  });

  it('shows the target locked state while waiting for the lock echo', async () => {
    setLockEntity('unlocked');
    renderLockCard();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Slide to lock' }), { key: ' ' });

    await waitFor(() => expect(lockEntityMock).toHaveBeenCalledWith(id));
    expect(screen.getByText('Locking...')).toBeInTheDocument();
    expect(screen.queryByText('Unlocked')).not.toBeInTheDocument();

    act(() => setLockEntity('locked'));

    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Slide to unlock' })).toBeInTheDocument();
  });

  it('restores the previous state when the lock service fails', async () => {
    unlockEntityMock.mockRejectedValue(new Error('Unable to update lock'));
    renderLockCard();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Slide to unlock' }), { key: ' ' });

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Unable to update lock'));
    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Slide to unlock' })).toBeInTheDocument();
  });
  it('disables actions in an open native dialog after the provider disconnects', () => {
    renderLockCard(true);
    act(() =>
      integrationStore.setState((state) => ({
        providerRuntime: {
          ...state.providerRuntime,
          home_assistant: { ...state.providerRuntime.home_assistant, connected: false },
        },
      }))
    );
    const action = screen.getByRole('button', { name: 'Slide to unlock' });
    expect(action).toBeDisabled();
    fireEvent.keyDown(action, { key: ' ' });
    expect(unlockEntityMock).not.toHaveBeenCalled();
  });
});
