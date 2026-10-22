import { useDashboardCollectionStore } from '@navet/app/features/dashboard/dashboards/dashboard-collection-store';
import {
  getPreviewRuntimeScenario,
  installPreviewRuntime,
  resetPreviewRuntime,
} from '@navet/app/preview/runtime';
import { useEditModeStore } from '@navet/app/stores/edit-mode-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderDashboardActions } from '../header-dashboard-actions';
import { useHeaderController } from '../use-header-controller';

function Harness({ onToggle }: { onToggle?: () => void }) {
  const controller = useHeaderController();
  return (
    <HeaderDashboardActions
      controller={controller}
      editActions={onToggle ? { isEditMode: false, onToggleEditMode: onToggle } : undefined}
    />
  );
}

describe('shared dashboard actions', () => {
  it('keeps search collapsed until requested from the shared action row', async () => {
    renderWithProviders(<Harness />);
    expect(screen.queryByPlaceholderText('Search devices')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Search devices' }));
    expect(await screen.findByPlaceholderText('Search devices')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByPlaceholderText('Search devices'), { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Search devices')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search devices' })).toHaveFocus();
  });

  beforeEach(async () => {
    await resetAppStores();
    installPreviewRuntime(getPreviewRuntimeScenario('demo'));
  });
  afterEach(() => resetPreviewRuntime());

  it('groups Customize, notifications and account controls without a separate dashboard title', () => {
    const toggle = vi.fn();
    renderWithProviders(<Harness onToggle={toggle} />);
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open user menu' })).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit dashboard' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    expect(toggle).toHaveBeenCalledOnce();
    expect(useDashboardCollectionStore.getState().companionCustomizationOpen).toBe(false);
  });

  it('uses the active dashboard customization mode when no explicit actions are supplied', () => {
    useEditModeStore.getState().setEditMode(true);
    renderWithProviders(<Harness />);
    expect(screen.getByRole('button', { name: 'Customize' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    expect(useEditModeStore.getState().isEditMode).toBe(false);
  });
});
