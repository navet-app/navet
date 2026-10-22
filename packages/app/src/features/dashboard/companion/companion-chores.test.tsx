import { DemoChoreWorkspace } from '@navet/app/demo/demo-chore-workspace';
import { useChoreWorkspaceStore } from '@navet/app/features/chores/chore-workspace-store';
import { ChoreWorkspaceSyncContext } from '@navet/app/features/chores/use-chore-workspace-sync';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanionChores } from './companion-chores';

describe('companion chores', () => {
  beforeEach(async () => {
    await resetAppStores();
    useChoreWorkspaceStore.getState().reset();
  });

  it('completes a chore in place and removes the navigation link', async () => {
    renderWithProviders(
      <DemoChoreWorkspace>
        <CompanionChores editing={false} />
      </DemoChoreWorkspace>
    );
    expect(await screen.findByText('Unload dishwasher')).toBeInTheDocument();
    expect(useChoreWorkspaceStore.getState().data?.occurrencesById['today-dishwasher'].status).toBe(
      'available'
    );
    expect(screen.queryByRole('button', { name: 'Chores' })).not.toBeInTheDocument();
    const complete = screen.getByRole('button', { name: 'Mark done: Unload dishwasher' });
    fireEvent.click(complete);
    await waitFor(() =>
      expect(
        useChoreWorkspaceStore.getState().data?.occurrencesById['today-dishwasher'].status
      ).toBe('done')
    );
    expect(screen.queryByText('Unload dishwasher')).not.toBeInTheDocument();
  });

  it('disables chore actions during customization and saving', async () => {
    const { rerender } = renderWithProviders(
      <DemoChoreWorkspace>
        <CompanionChores editing={true} />
      </DemoChoreWorkspace>
    );
    expect(await screen.findByText('Unload dishwasher')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark done: Unload dishwasher' })).toBeDisabled();
    rerender(
      <DemoChoreWorkspace>
        <CompanionChores editing={false} />
      </DemoChoreWorkspace>
    );
    expect(screen.getByRole('button', { name: 'Mark done: Unload dishwasher' })).toBeEnabled();
    act(() => useChoreWorkspaceStore.setState({ status: 'saving' }));
    expect(screen.getByRole('button', { name: 'Mark done: Unload dishwasher' })).toBeDisabled();
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
    expect(screen.getByRole('status')).toHaveTextContent('Loading...');
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    view.unmount();
    useChoreWorkspaceStore.setState({ load });
  });
});
