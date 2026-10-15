import { loadChoreBackup } from '@navet/app/services/chore-workspace.service';
import { renderWithProviders } from '@navet/app/test/render';
import { createChoreInterchangeDocument } from '@navet/core/chore-interchange';
import { createEmptyChoreWorkspace } from '@navet/core/chores';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChoreWorkspaceStore } from '../chore-workspace-store';
import { ChoreDataRecovery } from './chore-data-recovery';

vi.mock('@navet/app/services/chore-workspace.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@navet/app/services/chore-workspace.service')>()),
  loadChoreBackup: vi.fn(),
}));

const backup = createChoreInterchangeDocument({
  workspace: createEmptyChoreWorkspace(),
  events: [],
});
async function selectBackup() {
  fireEvent.change(screen.getByLabelText('Import backup', { selector: 'input' }), {
    target: { files: [{ text: async () => JSON.stringify(backup) }] },
  });
  await screen.findByRole('alertdialog');
}

describe('ChoreDataRecovery', () => {
  beforeEach(() => useChoreWorkspaceStore.getState().reset());

  it('downloads a configuration without loading full history, while keeping full backup available', async () => {
    const workspace = createEmptyChoreWorkspace();
    workspace.activity = [
      {
        id: 'history',
        commandId: 'history',
        type: 'workspace_materialized',
        timestamp: '2026-10-15T08:00:00Z',
      },
    ];
    useChoreWorkspaceStore.setState({ data: workspace });
    const fullBackup = createChoreInterchangeDocument({ workspace, events: workspace.activity });
    vi.mocked(loadChoreBackup).mockResolvedValue({
      available: true,
      unauthorized: false,
      value: fullBackup,
    });
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return 'blob:chores-export';
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const filenames: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      filenames.push(this.download);
    });
    renderWithProviders(
      <ChoreDataRecovery managerActorId="manager" participants={[]} onImportComplete={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export chores' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Chore configuration exported.');
    expect(loadChoreBackup).not.toHaveBeenCalled();
    const configuration = JSON.parse(await blobs[0].text());
    expect(configuration.workspace.activity).toEqual([]);
    expect(configuration.events).toEqual([]);
    expect(filenames[0]).toMatch(/^navet-chores-configuration-.*\.json$/);
    fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    await waitFor(() => expect(blobs).toHaveLength(2));
    expect(JSON.parse(await blobs[1].text())).toEqual(fullBackup);
    expect(filenames[1]).toMatch(/^navet-chores-\d{4}-\d{2}-\d{2}\.json$/);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(workspace.activity).toHaveLength(1);
  });

  it('disables configuration export without a workspace and reports download errors', async () => {
    const view = renderWithProviders(
      <ChoreDataRecovery managerActorId="manager" participants={[]} onImportComplete={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Export chores' })).toBeDisabled();
    view.unmount();
    useChoreWorkspaceStore.setState({ data: createEmptyChoreWorkspace() });
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('Download failed');
    });
    renderWithProviders(
      <ChoreDataRecovery managerActorId="manager" participants={[]} onImportComplete={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export chores' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The chore configuration could not be exported. Try again.'
    );
  });

  it.each(['merge', 'replace'] as const)(
    'retains a failed %s for retry and completes once',
    async (mode) => {
      const restoreBackup = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      useChoreWorkspaceStore.setState({ restoreBackup });
      const complete = vi.fn();
      renderWithProviders(
        <ChoreDataRecovery managerActorId="manager" participants={[]} onImportComplete={complete} />
      );
      await selectBackup();
      const name = mode === 'merge' ? 'Merge' : 'Replace';
      fireEvent.click(screen.getByRole('button', { name }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Try Merge or Replace again');
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(complete).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name }));
      await waitFor(() => expect(complete).toHaveBeenCalledOnce());
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(restoreBackup).toHaveBeenNthCalledWith(2, {
        actorParticipantId: 'manager',
        document: backup,
        mode,
      });
    }
  );

  it('retains a rejected restore and Cancel clears it', async () => {
    useChoreWorkspaceStore.setState({
      restoreBackup: vi.fn().mockRejectedValue(new Error('offline')),
    });
    renderWithProviders(
      <ChoreDataRecovery managerActorId="manager" participants={[]} onImportComplete={vi.fn()} />
    );
    await selectBackup();
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await selectBackup();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('blocks duplicate restores and cancellation while saving', async () => {
    let finish!: (saved: boolean) => void;
    const restoreBackup = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        })
    );
    useChoreWorkspaceStore.setState({ restoreBackup });
    const complete = vi.fn();
    renderWithProviders(
      <ChoreDataRecovery managerActorId="manager" participants={[]} onImportComplete={complete} />
    );
    await selectBackup();
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(restoreBackup).toHaveBeenCalledOnce();
    finish(true);
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
  });
});
