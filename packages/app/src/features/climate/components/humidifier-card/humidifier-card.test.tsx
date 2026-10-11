import { useThemeStore } from '@navet/app/stores/theme-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HumidifierCard } from '.';

const { dispatchEntityCommandMock, invokeIntegrationNativeActionMock } = vi.hoisted(() => ({
  dispatchEntityCommandMock: vi.fn(async () => ({
    accepted: true,
    requiresEventConfirmation: true,
  })),
  invokeIntegrationNativeActionMock: vi.fn(async () => undefined),
}));

vi.mock('@navet/app/commands', () => ({
  dispatchEntityCommand: dispatchEntityCommandMock,
}));

vi.mock('@navet/app/services/integration-native-action.service', () => ({
  invokeIntegrationNativeAction: invokeIntegrationNativeActionMock,
}));

describe('HumidifierCard', () => {
  beforeEach(async () => {
    await resetAppStores();
    vi.clearAllMocks();
  });

  it('renders presets and sends humidifier-specific mode and humidity services', () => {
    renderWithProviders(
      <HumidifierCard
        id="humidifier.basement"
        name="Basement Dehumidifier"
        room="Basement"
        entityType="Dehumidifier"
        deviceClass="dehumidifier"
        initialState
        initialTargetHumidity={46}
        minHumidity={35}
        maxHumidity={70}
        targetHumidityStep={5}
        initialMode="auto"
        availableModes={['auto', 'sleep']}
        size="small"
        onSizeChange={vi.fn()}
        isEditMode={false}
      />
    );

    expect(screen.getByRole('slider', { name: 'Target humidity' })).toHaveAttribute(
      'aria-valuenow',
      '46'
    );
    expect(screen.getByText('46%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Sleep' }));
    expect(invokeIntegrationNativeActionMock).toHaveBeenCalledWith({
      providerId: undefined,
      entityId: 'humidifier.basement',
      domain: 'humidifier',
      service: 'set_mode',
      serviceData: { mode: 'sleep' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Increase target humidity' }));
    expect(invokeIntegrationNativeActionMock).toHaveBeenCalledWith({
      providerId: undefined,
      entityId: 'humidifier.basement',
      domain: 'humidifier',
      service: 'set_humidity',
      serviceData: { humidity: 51 },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Open settings for Basement Dehumidifier' })
    );
    expect(screen.getAllByText('Dehumidifier').length).toBeGreaterThan(0);
    expect(screen.getByRole('dialog')).toHaveClass('from-teal-950');
    expect(screen.getByRole('slider', { name: 'Target humidity' })).toHaveAttribute(
      'aria-valuenow',
      '51'
    );
    expect(screen.getAllByText('Drying to 51%').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Customize' })).not.toBeInTheDocument();
    expect(screen.queryByText('Card color')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Basement Dehumidifier' }));
    expect(dispatchEntityCommandMock).toHaveBeenCalledWith(
      {
        type: 'turn_off',
        entityId: 'humidifier.basement',
      },
      undefined
    );
  });

  it('uses the same solid dark inactive surface family as other climate cards', () => {
    useThemeStore.getState().setTheme('dark');

    renderWithProviders(
      <HumidifierCard
        id="humidifier.bedroom"
        name="Bedroom Humidifier"
        room="Bedroom"
        entityType="Humidifier"
        deviceClass="humidifier"
        initialState={false}
        initialTargetHumidity={46}
        minHumidity={30}
        maxHumidity={70}
        targetHumidityStep={1}
        initialMode="auto"
        availableModes={['auto', 'eco', 'sleep']}
        size="medium"
        onSizeChange={vi.fn()}
        isEditMode={false}
      />
    );

    const card = screen
      .getByRole('button', { name: 'Bedroom Humidifier' })
      .closest('[data-effective-effects-quality]');

    expect(card).toHaveClass('from-zinc-800', 'to-zinc-900');
    expect(card).not.toHaveClass('from-white/[0.08]', 'via-white/[0.03]');
  });
});
