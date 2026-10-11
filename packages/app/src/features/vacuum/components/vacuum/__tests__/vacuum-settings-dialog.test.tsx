import { renderWithProviders } from '@navet/app/test/render';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VacuumSettingsDialog } from '../vacuum-settings-dialog';

const { entityRoomSelectorMock } = vi.hoisted(() => ({
  entityRoomSelectorMock: vi.fn((_props?: unknown) => <div>Kitchen</div>),
}));

vi.mock('@navet/app/components/shared/entity-room-selector', () => ({
  EntityRoomSelector: (props: unknown) => entityRoomSelectorMock(props),
}));

describe('VacuumSettingsDialog', () => {
  it('passes the assigned room as the eyebrow fallback room name', () => {
    entityRoomSelectorMock.mockClear();

    renderWithProviders(
      <VacuumSettingsDialog
        entityId="vacuum.roborock"
        isOpen
        onClose={vi.fn()}
        onStartCleaning={vi.fn()}
        onPauseCleaning={vi.fn()}
        onReturnHome={vi.fn()}
        name="Robot"
        room="Kitchen"
        theme="dark"
        accentColorValue="#06b6d4"
        currentStatus="idle"
        supportsFanSpeed={false}
      />
    );

    fireEvent.keyDown(screen.getAllByRole('button', { name: 'More actions' })[0], { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit room' }));
    expect(entityRoomSelectorMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        entityId: 'vacuum.roborock',
        fallbackRoomName: 'Kitchen',
      })
    );
  });

  it('uses the shared mobile cover sheet so long content can scroll', () => {
    renderWithProviders(
      <VacuumSettingsDialog
        entityId="vacuum.roborock"
        isOpen
        onClose={vi.fn()}
        onStartCleaning={vi.fn()}
        onPauseCleaning={vi.fn()}
        onReturnHome={vi.fn()}
        name="Robot"
        room="Kitchen"
        theme="dark"
        accentColorValue="#06b6d4"
        currentStatus="idle"
        supportsFanSpeed={false}
        capabilities={{
          canStart: true,
          canPause: true,
          canStop: false,
          canReturnHome: true,
          canLocate: false,
          canCleanSpot: false,
          canSetFanSpeed: false,
          currentFanSpeed: undefined,
          fanSpeedOptions: [],
          canCycleFanSpeed: false,
          canShowMap: true,
          canCleanByArea: true,
          canOrderAreaCleaning: false,
          availableCleaningAreas: Array.from({ length: 12 }, (_, index) => ({
            id: `room-${index}`,
            label: `Room ${index + 1}`,
          })),
        }}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass(
      'max-sm:!flex',
      'max-sm:!flex-col',
      'max-h-[85vh]',
      'max-sm:!h-auto',
      'max-sm:!rounded-t-[30px]',
      'max-sm:[&_[data-cover-sheet-inline-dismiss]]:!hidden'
    );
    expect(
      screen.getByRole('button', { name: 'Drag dialog to fullscreen or close' })
    ).toBeInTheDocument();
    const dismissButton = dialog.querySelector('[data-mobile-cover-sheet-dismiss]');
    expect(dismissButton?.parentElement).toHaveClass('absolute', 'top-3', 'right-3', 'z-30');
    expect(dialog.querySelector('[data-card-dialog-header]')).toHaveClass(
      'px-4',
      'py-3',
      'max-sm:pt-2',
      'max-sm:pr-4',
      'pb-0'
    );
    expect(dialog.querySelector('[dir="ltr"]')).not.toBeNull();
  });

  it('renders the footer as part of the scrollable dialog body', () => {
    renderWithProviders(
      <VacuumSettingsDialog
        entityId="vacuum.roborock"
        isOpen
        onClose={vi.fn()}
        onStartCleaning={vi.fn()}
        onPauseCleaning={vi.fn()}
        onReturnHome={vi.fn()}
        name="Robot"
        room="Kitchen"
        theme="dark"
        accentColorValue="#06b6d4"
        currentStatus="idle"
        supportsFanSpeed={false}
        capabilities={{
          canStart: true,
          canPause: true,
          canStop: false,
          canReturnHome: true,
          canLocate: false,
          canCleanSpot: false,
          canSetFanSpeed: false,
          currentFanSpeed: undefined,
          fanSpeedOptions: [],
          canCycleFanSpeed: false,
          canShowMap: true,
          canCleanByArea: true,
          canOrderAreaCleaning: false,
          availableCleaningAreas: Array.from({ length: 12 }, (_, index) => ({
            id: `room-${index}`,
            label: `Room ${index + 1}`,
          })),
        }}
      />
    );

    const startButton = screen.getByRole('button', { name: 'Start Cleaning' });
    const doneButton = screen.getByRole('button', { name: 'Done' });
    const scrollRoot = screen.getByRole('dialog').querySelector('[dir="ltr"]');

    expect(scrollRoot?.contains(startButton)).toBe(true);
    expect(scrollRoot?.contains(doneButton)).toBe(true);
    expect(doneButton.closest('.mt-6.flex.justify-end')?.childElementCount).toBe(1);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('renders the map tab only when map support is available', () => {
    const { rerender } = renderWithProviders(
      <VacuumSettingsDialog
        entityId="vacuum.roborock"
        isOpen
        onClose={vi.fn()}
        onStartCleaning={vi.fn()}
        onStartAreaCleaning={vi.fn()}
        onPauseCleaning={vi.fn()}
        onReturnHome={vi.fn()}
        name="Robot"
        room=""
        theme="dark"
        accentColorValue="#06b6d4"
        currentStatus="idle"
        supportsFanSpeed={false}
        capabilities={{
          canStart: true,
          canPause: true,
          canStop: false,
          canReturnHome: true,
          canLocate: false,
          canCleanSpot: false,
          canSetFanSpeed: false,
          currentFanSpeed: undefined,
          fanSpeedOptions: [],
          canCycleFanSpeed: false,
          canShowMap: true,
          canCleanByArea: true,
          canOrderAreaCleaning: false,
          availableCleaningAreas: [{ id: 'kitchen', label: 'Kitchen' }],
        }}
      />
    );

    fireEvent.keyDown(screen.getAllByRole('button', { name: 'More actions' })[0], { key: 'Enter' });
    expect(screen.getByRole('menuitem', { name: 'Map' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    rerender(
      <VacuumSettingsDialog
        entityId="vacuum.roborock"
        isOpen
        onClose={vi.fn()}
        onStartCleaning={vi.fn()}
        onStartAreaCleaning={vi.fn()}
        onPauseCleaning={vi.fn()}
        onReturnHome={vi.fn()}
        name="Robot"
        room=""
        theme="dark"
        accentColorValue="#06b6d4"
        currentStatus="idle"
        supportsFanSpeed={false}
        capabilities={{
          canStart: true,
          canPause: true,
          canStop: false,
          canReturnHome: true,
          canLocate: false,
          canCleanSpot: false,
          canSetFanSpeed: false,
          currentFanSpeed: undefined,
          fanSpeedOptions: [],
          canCycleFanSpeed: false,
          canShowMap: false,
          canCleanByArea: false,
          canOrderAreaCleaning: false,
          availableCleaningAreas: [],
        }}
      />
    );

    fireEvent.keyDown(screen.getAllByRole('button', { name: 'More actions' })[0], { key: 'Enter' });
    expect(screen.queryByRole('menuitem', { name: 'Map' })).not.toBeInTheDocument();
  });

  it('selects areas in the map tab and starts area cleaning from controls', () => {
    const onStartAreaCleaning = vi.fn();

    renderWithProviders(
      <VacuumSettingsDialog
        entityId="vacuum.roborock"
        isOpen
        onClose={vi.fn()}
        onStartCleaning={vi.fn()}
        onStartAreaCleaning={onStartAreaCleaning}
        onPauseCleaning={vi.fn()}
        onReturnHome={vi.fn()}
        name="Robot"
        room=""
        theme="dark"
        accentColorValue="#06b6d4"
        currentStatus="idle"
        capabilities={{
          canStart: true,
          canPause: true,
          canStop: false,
          canReturnHome: true,
          canLocate: false,
          canCleanSpot: false,
          canSetFanSpeed: false,
          currentFanSpeed: undefined,
          fanSpeedOptions: [],
          canCycleFanSpeed: false,
          canShowMap: true,
          canCleanByArea: true,
          canOrderAreaCleaning: false,
          availableCleaningAreas: [
            { id: 'kitchen', label: 'Kitchen' },
            { id: 'hallway', label: 'Hallway' },
          ],
        }}
      />
    );

    fireEvent.keyDown(screen.getAllByRole('button', { name: 'More actions' })[0], { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Map' }));
    fireEvent.click(screen.getByRole('button', { name: /^Kitchen/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Hallway/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Cleaning' }));

    expect(onStartAreaCleaning).toHaveBeenCalledWith(['kitchen', 'hallway']);
    expect(screen.getAllByText('Hallway').length).toBeGreaterThan(0);
  });

  it('shows area reorder affordances only when ordered cleaning is supported', () => {
    const { rerender } = renderWithProviders(
      <VacuumSettingsDialog
        entityId="vacuum.roborock"
        isOpen
        onClose={vi.fn()}
        onStartCleaning={vi.fn()}
        onStartAreaCleaning={vi.fn()}
        onPauseCleaning={vi.fn()}
        onReturnHome={vi.fn()}
        name="Robot"
        room=""
        theme="dark"
        accentColorValue="#06b6d4"
        currentStatus="idle"
        capabilities={{
          canStart: true,
          canPause: true,
          canStop: false,
          canReturnHome: true,
          canLocate: false,
          canCleanSpot: false,
          canSetFanSpeed: false,
          currentFanSpeed: undefined,
          fanSpeedOptions: [],
          canCycleFanSpeed: false,
          canShowMap: true,
          canCleanByArea: true,
          canOrderAreaCleaning: true,
          availableCleaningAreas: [
            { id: 'kitchen', label: 'Kitchen' },
            { id: 'hallway', label: 'Hallway' },
          ],
        }}
      />
    );

    fireEvent.keyDown(screen.getAllByRole('button', { name: 'More actions' })[0], { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Map' }));
    fireEvent.click(screen.getByRole('button', { name: /^Kitchen/ }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByText('Stop 1')).toBeInTheDocument();

    rerender(
      <VacuumSettingsDialog
        entityId="vacuum.roborock"
        isOpen
        onClose={vi.fn()}
        onStartCleaning={vi.fn()}
        onStartAreaCleaning={vi.fn()}
        onPauseCleaning={vi.fn()}
        onReturnHome={vi.fn()}
        name="Robot"
        room=""
        theme="dark"
        accentColorValue="#06b6d4"
        currentStatus="idle"
        capabilities={{
          canStart: true,
          canPause: true,
          canStop: false,
          canReturnHome: true,
          canLocate: false,
          canCleanSpot: false,
          canSetFanSpeed: false,
          currentFanSpeed: undefined,
          fanSpeedOptions: [],
          canCycleFanSpeed: false,
          canShowMap: true,
          canCleanByArea: true,
          canOrderAreaCleaning: false,
          availableCleaningAreas: [
            { id: 'kitchen', label: 'Kitchen' },
            { id: 'hallway', label: 'Hallway' },
          ],
        }}
      />
    );

    expect(screen.queryByText('Stop 1')).not.toBeInTheDocument();
  });

  it('does not add a nested scroll region to the selected areas section', () => {
    const { container } = renderWithProviders(
      <VacuumSettingsDialog
        entityId="vacuum.roborock"
        isOpen
        onClose={vi.fn()}
        onStartCleaning={vi.fn()}
        onStartAreaCleaning={vi.fn()}
        onPauseCleaning={vi.fn()}
        onReturnHome={vi.fn()}
        name="Robot"
        room="Kitchen"
        theme="dark"
        accentColorValue="#06b6d4"
        currentStatus="idle"
        supportsFanSpeed={false}
        capabilities={{
          canStart: true,
          canPause: true,
          canStop: false,
          canReturnHome: true,
          canLocate: false,
          canCleanSpot: false,
          canSetFanSpeed: false,
          currentFanSpeed: undefined,
          fanSpeedOptions: [],
          canCycleFanSpeed: false,
          canShowMap: true,
          canCleanByArea: true,
          canOrderAreaCleaning: true,
          availableCleaningAreas: [
            { id: 'kitchen', label: 'Kitchen' },
            { id: 'hallway', label: 'Hallway' },
          ],
        }}
      />
    );

    fireEvent.keyDown(screen.getAllByRole('button', { name: 'More actions' })[0], { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Map' }));
    fireEvent.click(screen.getByRole('button', { name: /^Kitchen/ }));

    expect(screen.getByText('Stop 1')).toBeInTheDocument();
    expect(container.querySelector('.max-h-28.overflow-auto')).toBeNull();
  });

  it('keeps the selected map tab active during live dialog rerenders', () => {
    const { rerender } = renderWithProviders(
      <VacuumSettingsDialog
        entityId="vacuum.roborock"
        isOpen
        onClose={vi.fn()}
        onStartCleaning={vi.fn()}
        onStartAreaCleaning={vi.fn()}
        onPauseCleaning={vi.fn()}
        onReturnHome={vi.fn()}
        name="Robot"
        room=""
        theme="dark"
        accentColorValue="#06b6d4"
        currentStatus="idle"
        fanSpeed="quiet"
        fanSpeeds={['quiet', 'balanced', 'turbo']}
        capabilities={{
          canStart: true,
          canPause: true,
          canStop: false,
          canReturnHome: true,
          canLocate: false,
          canCleanSpot: false,
          canSetFanSpeed: true,
          currentFanSpeed: 'quiet',
          fanSpeedOptions: ['quiet', 'balanced', 'turbo'],
          canCycleFanSpeed: false,
          canShowMap: true,
          canCleanByArea: true,
          canOrderAreaCleaning: false,
          availableCleaningAreas: [{ id: 'kitchen', label: 'Kitchen' }],
        }}
      />
    );

    fireEvent.keyDown(screen.getAllByRole('button', { name: 'More actions' })[0], { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Map' }));
    expect(
      within(screen.getByRole('region', { name: 'Map' })).getByRole('button', { name: /^Kitchen/ })
    ).toBeInTheDocument();

    rerender(
      <VacuumSettingsDialog
        entityId="vacuum.roborock"
        isOpen
        onClose={vi.fn()}
        onStartCleaning={vi.fn()}
        onStartAreaCleaning={vi.fn()}
        onPauseCleaning={vi.fn()}
        onReturnHome={vi.fn()}
        name="Robot"
        room=""
        theme="dark"
        accentColorValue="#06b6d4"
        currentStatus="cleaning"
        fanSpeed="turbo"
        fanSpeeds={['quiet', 'balanced', 'turbo']}
        capabilities={{
          canStart: true,
          canPause: true,
          canStop: false,
          canReturnHome: true,
          canLocate: false,
          canCleanSpot: false,
          canSetFanSpeed: true,
          currentFanSpeed: 'turbo',
          fanSpeedOptions: ['quiet', 'balanced', 'turbo'],
          canCycleFanSpeed: false,
          canShowMap: true,
          canCleanByArea: true,
          canOrderAreaCleaning: false,
          availableCleaningAreas: [{ id: 'kitchen', label: 'Kitchen' }],
        }}
      />
    );

    expect(
      within(screen.getByRole('region', { name: 'Map' })).getByRole('button', { name: /^Kitchen/ })
    ).toBeInTheDocument();
  });

  it('dispatches fan-speed changes immediately when a speed is selected', async () => {
    const onSetFanSpeed = vi.fn();

    renderWithProviders(
      <VacuumSettingsDialog
        entityId="vacuum.roborock"
        isOpen
        onClose={vi.fn()}
        onStartCleaning={vi.fn()}
        onPauseCleaning={vi.fn()}
        onReturnHome={vi.fn()}
        onSetFanSpeed={onSetFanSpeed}
        name="Robot"
        room=""
        theme="dark"
        accentColorValue="#06b6d4"
        currentStatus="idle"
        fanSpeed="quiet"
        fanSpeeds={['quiet', 'balanced', 'turbo']}
        supportsFanSpeed
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fan Speed' }));
    fireEvent.click(screen.getByRole('radio', { name: 'balanced' }));

    expect(onSetFanSpeed).toHaveBeenCalledWith('balanced');
    expect(screen.getByRole('radio', { name: 'balanced' })).not.toBeChecked();
  });

  it('reflects live fan-speed updates back into the selected state', () => {
    const { rerender } = renderWithProviders(
      <VacuumSettingsDialog
        entityId="vacuum.roborock"
        isOpen
        onClose={vi.fn()}
        onStartCleaning={vi.fn()}
        onPauseCleaning={vi.fn()}
        onReturnHome={vi.fn()}
        onSetFanSpeed={vi.fn()}
        name="Robot"
        room=""
        theme="dark"
        accentColorValue="#06b6d4"
        currentStatus="idle"
        fanSpeed="quiet"
        fanSpeeds={['quiet', 'balanced', 'turbo']}
        supportsFanSpeed
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fan Speed' }));
    expect(screen.getByRole('radio', { name: 'quiet' })).toBeChecked();

    rerender(
      <VacuumSettingsDialog
        entityId="vacuum.roborock"
        isOpen
        onClose={vi.fn()}
        onStartCleaning={vi.fn()}
        onPauseCleaning={vi.fn()}
        onReturnHome={vi.fn()}
        onSetFanSpeed={vi.fn()}
        name="Robot"
        room=""
        theme="dark"
        accentColorValue="#06b6d4"
        currentStatus="idle"
        fanSpeed="turbo"
        fanSpeeds={['quiet', 'balanced', 'turbo']}
        supportsFanSpeed
      />
    );

    expect(screen.getByRole('radio', { name: 'turbo' })).toBeChecked();
  });

  it('hides the return-to-dock action when the vacuum does not support it', () => {
    renderWithProviders(
      <VacuumSettingsDialog
        entityId="vacuum.basic"
        isOpen
        onClose={vi.fn()}
        onStartCleaning={vi.fn()}
        onReturnHome={vi.fn()}
        name="Basic Vacuum"
        room=""
        theme="dark"
        accentColorValue="#06b6d4"
        currentStatus="idle"
        supportsFanSpeed={false}
        capabilities={{
          canStart: true,
          canPause: false,
          canStop: false,
          canReturnHome: false,
          canLocate: false,
          canCleanSpot: false,
          canSetFanSpeed: false,
          currentFanSpeed: undefined,
          fanSpeedOptions: [],
          canCycleFanSpeed: false,
          canShowMap: false,
          canCleanByArea: false,
          canOrderAreaCleaning: false,
          availableCleaningAreas: [],
        }}
      />
    );

    expect(screen.queryByRole('button', { name: 'Run Return to Dock' })).not.toBeInTheDocument();
  });

  it('hides the controls tab when the vacuum has no dialog controls', () => {
    renderWithProviders(
      <VacuumSettingsDialog
        entityId="vacuum.minimal"
        isOpen
        onClose={vi.fn()}
        onStartCleaning={vi.fn()}
        onReturnHome={vi.fn()}
        name="Minimal Vacuum"
        room=""
        theme="dark"
        accentColorValue="#06b6d4"
        currentStatus="idle"
        supportsFanSpeed={false}
        capabilities={{
          canStart: true,
          canPause: false,
          canStop: false,
          canReturnHome: false,
          canLocate: false,
          canCleanSpot: false,
          canSetFanSpeed: false,
          currentFanSpeed: undefined,
          fanSpeedOptions: [],
          canCycleFanSpeed: false,
          canShowMap: false,
          canCleanByArea: false,
          canOrderAreaCleaning: false,
          availableCleaningAreas: [],
        }}
      />
    );

    expect(screen.queryByRole('button', { name: 'Controls' })).not.toBeInTheDocument();
  });

  it('keeps the fan editor mounted while collapsed and prevents changes while updating', () => {
    const onSetFanSpeed = vi.fn();
    renderWithProviders(
      <VacuumSettingsDialog
        {...advancedDialogProps}
        onSetFanSpeed={onSetFanSpeed}
        isUpdatingFanSpeed
      />
    );
    const disclosure = screen.getByRole('button', { name: 'Fan Speed' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('radio', { name: 'Turbo' })).not.toBeInTheDocument();
    fireEvent.click(disclosure);
    expect(screen.getByRole('radio', { name: 'Turbo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Turbo' }));
    expect(onSetFanSpeed).not.toHaveBeenCalled();
    fireEvent.click(disclosure);
    expect(screen.getByRole('radio', { name: 'Turbo', hidden: true })).toBeInTheDocument();
  });

  it('routes push actions and hides pause and stop after cleaning ends', () => {
    const onPauseCleaning = vi.fn();
    const onStopCleaning = vi.fn();
    const onReturnHome = vi.fn();
    const onLocate = vi.fn();
    const onCleanSpot = vi.fn();
    const props = {
      ...advancedDialogProps,
      onPauseCleaning,
      onStopCleaning,
      onReturnHome,
      onLocate,
      onCleanSpot,
    };
    const { rerender } = renderWithProviders(<VacuumSettingsDialog {...props} />);
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
    expect(screen.queryByText('More Actions')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run Pause cleaning' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run Stop cleaning' }));
    expect(onPauseCleaning).toHaveBeenCalledOnce();
    expect(onStopCleaning).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Run Return to Dock' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run Locate vacuum' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run Spot clean' }));
    expect(onReturnHome).toHaveBeenCalledOnce();
    expect(onLocate).toHaveBeenCalledOnce();
    expect(onCleanSpot).toHaveBeenCalledOnce();
    rerender(<VacuumSettingsDialog {...props} currentStatus="docked" />);
    expect(screen.queryByRole('button', { name: 'Run Pause cleaning' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run Stop cleaning' })).not.toBeInTheDocument();
  });

  it('disables device commands if the vacuum becomes unavailable while the dialog is open', () => {
    const { rerender } = renderWithProviders(<VacuumSettingsDialog {...advancedDialogProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fan Speed' }));
    rerender(<VacuumSettingsDialog {...advancedDialogProps} disabled />);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    for (const label of [
      'Run Pause cleaning',
      'Run Stop cleaning',
      'Run Return to Dock',
      'Run Locate vacuum',
      'Run Spot clean',
      'Start Cleaning',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
    }
    expect(screen.getByRole('radio', { name: 'Turbo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  });

  it('starts cleaning beside the live status and stays open until Done is pressed', () => {
    const onStartCleaning = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <VacuumSettingsDialog
        {...advancedDialogProps}
        currentStatus="docked"
        onStartCleaning={onStartCleaning}
        onClose={onClose}
      />
    );
    const startButton = screen.getByRole('button', { name: 'Start Cleaning' });
    expect(startButton).toHaveTextContent('Start Cleaning');
    expect(startButton.parentElement).toHaveTextContent('Docked');
    fireEvent.click(startButton);
    expect(onStartCleaning).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

const advancedDialogProps = {
  entityId: 'vacuum.roborock',
  isOpen: true,
  onClose: vi.fn(),
  onStartCleaning: vi.fn(),
  onPauseCleaning: vi.fn(),
  onStopCleaning: vi.fn(),
  onReturnHome: vi.fn(),
  onSetFanSpeed: vi.fn(),
  onLocate: vi.fn(),
  onCleanSpot: vi.fn(),
  name: 'Robot',
  room: 'Kitchen',
  theme: 'dark' as const,
  accentColorValue: '#06b6d4',
  currentStatus: 'cleaning' as const,
  fanSpeed: 'Balanced',
  fanSpeeds: ['Quiet', 'Balanced', 'Turbo'],
  capabilities: {
    canStart: true,
    canPause: true,
    canStop: true,
    canReturnHome: true,
    canLocate: true,
    canCleanSpot: true,
    canSetFanSpeed: true,
    fanSpeedOptions: ['Quiet', 'Balanced', 'Turbo'],
    canCycleFanSpeed: true,
    canShowMap: false,
    canCleanByArea: false,
    canOrderAreaCleaning: false,
    availableCleaningAreas: [],
  },
};
