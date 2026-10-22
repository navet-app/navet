import { renderWithProviders } from '@navet/app/test/render';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SwitchCard } from '../switch-card';

const dialogState = vi.hoisted(() => ({
  run: vi.fn(),
  isOpen: false,
  openSettings: vi.fn(() => {
    dialogState.isOpen = true;
  }),
}));

vi.mock('../use-switch-card-controller', () => ({
  useSwitchCardController: (props: {
    isEditMode?: boolean;
    size: string;
    name: string;
    id: string;
  }) => ({
    theme: 'dark',
    isOn: true,
    accentColor: '#f97316',
    tintColor: '',
    cardColors: {
      gradient: 'from-orange-500/30 to-orange-300/10',
      border: 'border-orange-400/30',
      glow: 'from-orange-500/25',
    },
    entityType: 'Switch',
    displayName: props.name,
    isScript: props.id.includes('script.'),
    handleToggle: dialogState.run,
    toggleDisabled: props.isEditMode === true,
    hasControlsDialog: true,
    isDialogOpen: dialogState.isOpen,
    setIsDialogOpen: vi.fn(),
    metricSectionTitle: 'Card Metric',
    metricSectionDescription: 'Select metrics',
    metricLimit: 2,
    availableMetrics: [],
    selectedMetricLabels: [],
    getMetricLabel: vi.fn(),
    handleMetricToggle: vi.fn(),
    selectedIcon: 'ToggleLeft',
    setSelectedIcon: vi.fn(),
    siblingEntities: [],
    setTintColor: vi.fn(),
    HeaderIconComponent: null,
    headerIconText: null,
    cardInteraction: {
      cardProps: { role: 'button', 'aria-label': props.name, 'aria-disabled': true, tabIndex: -1 },
      iconButtonProps: { 'aria-label': `toggle ${props.name}`, onClick: vi.fn() },
      settingsButtonProps: {
        'aria-label': `open settings for ${props.name}`,
        onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          dialogState.openSettings();
        },
      },
    },
    isExtraSmall: props.size === 'extra-small',
    showSettingsButton: false,
    selectedMetrics: [],
    formatMetricValue: vi.fn(),
    renderMetricIcon: vi.fn(),
  }),
}));

vi.mock('../switch-settings-dialog', () => ({
  SwitchSettingsDialog: ({
    isOpen,
    name,
    customControls,
  }: {
    isOpen: boolean;
    name: string;
    customControls?: React.ReactNode;
  }) =>
    isOpen ? (
      <div role="dialog">
        {name} settings{customControls}
      </div>
    ) : null,
}));

describe('SwitchCard', () => {
  beforeEach(() => {
    dialogState.isOpen = false;
    dialogState.openSettings.mockClear();
    dialogState.run.mockClear();
  });

  it.each([false, true])(
    'provides a script Run action in its dialog (editing=%s)',
    (isEditMode) => {
      dialogState.isOpen = true;
      renderWithProviders(
        <SwitchCard
          id="script.evening"
          name="Evening"
          size="small"
          isEditMode={isEditMode}
          dialog={{ isOpen: true, onOpenChange: vi.fn() }}
        />
      );
      const run = screen.getByRole('button', { name: 'Run' });
      if (isEditMode) expect(run).toBeDisabled();
      else {
        fireEvent.click(run);
        expect(dialogState.run).toHaveBeenCalledOnce();
      }
    }
  );

  it('does not show an internal settings button on tiny cards in edit mode', () => {
    renderWithProviders(
      <SwitchCard
        id="switch.espresso_machine"
        name="Espresso Machine"
        size="tiny"
        initialState
        isEditMode
      />
    );

    expect(screen.getByRole('button', { name: 'Espresso Machine' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /open settings for espresso machine/i })
    ).not.toBeInTheDocument();
  });

  it('does not show an internal settings button on extra-small cards in edit mode', () => {
    const { rerender } = renderWithProviders(
      <SwitchCard
        id="switch.espresso_machine"
        name="Espresso Machine"
        size="extra-small"
        initialState
        isEditMode
      />
    );

    expect(
      screen.queryByRole('button', { name: /open settings for espresso machine/i })
    ).not.toBeInTheDocument();

    rerender(
      <SwitchCard
        id="switch.espresso_machine"
        name="Espresso Machine"
        size="extra-small"
        initialState
        isEditMode={false}
      />
    );

    expect(
      screen.queryByRole('button', { name: /open settings for espresso machine/i })
    ).not.toBeInTheDocument();
  });

  it('does not show a settings button on tiny cards outside edit mode', () => {
    renderWithProviders(
      <SwitchCard
        id="switch.espresso_machine"
        name="Espresso Machine"
        size="tiny"
        initialState
        isEditMode={false}
      />
    );

    expect(
      screen.queryByRole('button', { name: /open settings for espresso machine/i })
    ).not.toBeInTheDocument();
  });

  it('does not show a settings button on small cards outside edit mode', () => {
    renderWithProviders(
      <SwitchCard
        id="switch.espresso_machine"
        name="Espresso Machine"
        size="small"
        initialState
        isEditMode={false}
      />
    );

    expect(
      screen.queryByRole('button', { name: /open settings for espresso machine/i })
    ).not.toBeInTheDocument();
  });

  it('keeps the edit-mode tiny card non-interactive without exposing an internal settings button', () => {
    renderWithProviders(
      <SwitchCard
        id="switch.espresso_machine"
        name="Espresso Machine"
        size="tiny"
        initialState
        isEditMode
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Espresso Machine' }));

    expect(dialogState.openSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
