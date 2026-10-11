import { integrationStore } from '@navet/app/stores/integration-store';
import { renderWithProviders } from '@navet/app/test/render';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  available: vi.fn(),
  reload: vi.fn(),
  success: vi.fn(),
}));
vi.mock('@navet/app/services/integration-admin.service', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@navet/app/services/integration-admin.service')>();
  return {
    ...original,
    integrationAdminService: {
      ...original.integrationAdminService,
      canReloadEntityIntegration: mocks.available,
      reloadEntityIntegration: mocks.reload,
    },
  };
});
vi.mock('sonner', () => ({ toast: { success: mocks.success } }));

import { CardDialogOverflowMenu } from './card-dialog-overflow-menu';

// Keep: confirms recovery is intentional, single-flight, retryable and keyboard accessible.
describe('entity dialog integration recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.available.mockReturnValue(true);
    mocks.reload.mockResolvedValue(undefined);
  });

  function renderMenu(
    theme: 'glass' | 'dark' | 'light' | 'black' = 'dark',
    entityId: string | undefined = 'home_assistant:light.kitchen'
  ) {
    return renderWithProviders(
      <CardDialogOverflowMenu
        theme={theme}
        entityId={entityId}
        sections={[]}
        onSectionChange={vi.fn()}
      />
    );
  }

  async function openConfirmation() {
    const trigger = screen.getByRole('button', { name: 'More actions' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reload integration' }));
    await screen.findByRole('alertdialog', { name: 'Reload integration?' });
    return trigger;
  }

  it.each(['glass', 'dark', 'light', 'black'] as const)(
    'confirms the integration-wide effect and cancels without a request in %s',
    async (theme) => {
      renderMenu(theme);
      const trigger = await openConfirmation();
      expect(
        screen.getByText('Other entities from this integration may briefly become unavailable.')
      ).toBeVisible();
      const cancel = screen.getByRole('button', { name: 'Cancel' });
      await waitFor(() => expect(cancel).toHaveFocus());
      fireEvent.click(cancel);
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(mocks.reload).not.toHaveBeenCalled();
      await waitFor(() => expect(trigger).toHaveFocus());
    }
  );

  it('sends one request while pending and reports completion without claiming recovery', async () => {
    let complete!: () => void;
    mocks.reload.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        })
    );
    renderMenu();
    await openConfirmation();
    const action = screen.getByRole('button', { name: 'Reload integration' });
    fireEvent.click(action);
    fireEvent.click(action);
    expect(screen.getByRole('button', { name: 'Reloading integration…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(mocks.reload).toHaveBeenCalledExactlyOnceWith('home_assistant:light.kitchen');
    await act(async () => complete());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mocks.success).toHaveBeenCalledWith('Integration reloaded.');
  });

  it('keeps confirmation open after failure and allows a manual retry', async () => {
    mocks.reload.mockRejectedValueOnce(new Error('disconnected'));
    renderMenu();
    await openConfirmation();
    fireEvent.click(screen.getByRole('button', { name: 'Reload integration' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('administrator access');
    expect(screen.getByRole('alertdialog')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reload integration' }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(mocks.reload).toHaveBeenCalledTimes(2);
  });

  it('hides unsupported recovery and reacts when availability changes', async () => {
    mocks.available.mockReturnValue(false);
    renderMenu();
    fireEvent.keyDown(screen.getByRole('button', { name: 'More actions' }), { key: 'Enter' });
    expect(screen.queryByRole('menuitem', { name: 'Reload integration' })).not.toBeInTheDocument();
    await act(async () => {
      mocks.available.mockReturnValue(true);
      integrationStore.setState({});
    });
    expect(await screen.findByRole('menuitem', { name: 'Reload integration' })).toBeVisible();
  });

  it('disables confirmation if session permissions are revoked before execution', async () => {
    renderMenu();
    await openConfirmation();
    await act(async () => {
      mocks.available.mockReturnValue(false);
      integrationStore.setState({});
    });
    expect(screen.getByRole('button', { name: 'Reload integration' })).toBeDisabled();
    expect(mocks.reload).not.toHaveBeenCalled();
  });
});
