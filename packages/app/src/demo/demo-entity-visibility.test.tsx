import { useDashboardEntitiesStore } from '@navet/app/features/dashboard/stores/dashboard-entities-store';
import RestoreEntitiesDialog from '@navet/app/features/settings/components/restore-entities-dialog';
import {
  getPreviewRuntimeScenario,
  installPreviewRuntime,
  resetPreviewRuntime,
} from '@navet/app/preview/runtime';
import { renderWithProviders } from '@navet/app/test/render';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_HIDDEN_ENTITY_IDS, installDemoEntityVisibility } from './demo-entity-visibility';

let restoreVisibility: (() => void) | undefined;
afterEach(() => {
  cleanup();
  restoreVisibility?.();
  restoreVisibility = undefined;
  resetPreviewRuntime();
});

describe('demo entity recovery', () => {
  it('starts with real hidden sample entities and lets visitors restore one or all', async () => {
    const scenario = getPreviewRuntimeScenario('demo');
    expect(
      DEMO_HIDDEN_ENTITY_IDS.every((id) =>
        scenario.entities.some((entity) => entity.canonicalId === id)
      )
    ).toBe(true);
    installPreviewRuntime(scenario);
    restoreVisibility = installDemoEntityVisibility();
    const onClose = vi.fn();
    renderWithProviders(<RestoreEntitiesDialog onClose={onClose} />);
    expect(
      await screen.findByRole('button', { name: 'Restore: weather.home' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore: Guest mode' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Restore: Living Room Temperature' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore: weather.home' }));
    expect(useDashboardEntitiesStore.getState().hiddenEntityIds).toHaveLength(2);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Restore all' }));
    expect(useDashboardEntitiesStore.getState().hiddenEntityIds).toEqual([]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('restores prior visibility on exit and reseeds on the next demo visit', () => {
    const previous = useDashboardEntitiesStore.getState();
    restoreVisibility = installDemoEntityVisibility();
    useDashboardEntitiesStore.getState().showAllEntities();
    restoreVisibility();
    expect(useDashboardEntitiesStore.getState().hiddenEntityIds).toEqual(previous.hiddenEntityIds);
    expect(useDashboardEntitiesStore.getState().shownSensorEntityIds).toEqual(
      previous.shownSensorEntityIds
    );
    expect(useDashboardEntitiesStore.getState().explicitlyShownEntityIds).toEqual(
      previous.explicitlyShownEntityIds
    );
    restoreVisibility = installDemoEntityVisibility();
    expect(useDashboardEntitiesStore.getState().hiddenEntityIds).toEqual(DEMO_HIDDEN_ENTITY_IDS);
  });
});
