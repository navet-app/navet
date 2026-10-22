import { DemoChoreWorkspace } from '@navet/app/demo/demo-chore-workspace';
import { useChoreWorkspaceStore } from '@navet/app/features/chores/chore-workspace-store';
import { ChoreWorkspaceSyncContext } from '@navet/app/features/chores/use-chore-workspace-sync';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanionChores } from './companion-chores';

describe('companion chores', () => {
  beforeEach(async () => {
    await resetAppStores();
    useChoreWorkspaceStore.getState().reset();
  });

  it('shows chore status without completion buttons and keeps the full household view accessible', async () => {
    renderWithProviders(
      <DemoChoreWorkspace>
        <CompanionChores editing={false} />
      </DemoChoreWorkspace>
    );
    expect(await screen.findByText('Unload dishwasher')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark done:/ })).not.toBeInTheDocument();
    expect(useChoreWorkspaceStore.getState().data?.occurrencesById['today-dishwasher'].status).toBe(
      'available'
    );
    expect(screen.getByRole('button', { name: 'Chores' })).toBeEnabled();
  });

  it('disables household navigation during customization', async () => {
    renderWithProviders(
      <DemoChoreWorkspace>
        <CompanionChores editing={true} />
      </DemoChoreWorkspace>
    );
    expect(await screen.findByText('Unload dishwasher')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chores' })).toBeDisabled();
  });

  it('does not expose cached chores after the workspace loses authority', async () => {
    renderWithProviders(
      <DemoChoreWorkspace>
        <CompanionChores editing={false} />
      </DemoChoreWorkspace>
    );
    await screen.findByText('Unload dishwasher');
    act(() => useChoreWorkspaceStore.setState({ status: 'unauthorized' }));
    expect(screen.getByRole('status')).toHaveTextContent('Unavailable');
    expect(screen.queryByText('Unload dishwasher')).not.toBeInTheDocument();
  });

  it('does not load a real household from a preview workspace', () => {
    const load = useChoreWorkspaceStore.getState().load;
    const spy = vi.fn(async () => {});
    useChoreWorkspaceStore.setState({ load: spy });
    const view = renderWithProviders(
      <ChoreWorkspaceSyncContext.Provider value={false}>
        <CompanionChores editing={false} />
      </ChoreWorkspaceSyncContext.Provider>
    );
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Loading household chores');
    view.unmount();
    useChoreWorkspaceStore.setState({ load });
  });
});
