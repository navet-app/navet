import { getCardReadableTextTokens } from '@navet/app/components/shared/theme/card-readable-text-tokens';
import { I18nProvider } from '@navet/app/i18n/i18n-provider';
import { homeAssistantStore } from '@navet/app/stores/home-assistant-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { useThemeStore } from '@navet/app/stores/theme-store';
import { coverEntityFactory } from '@navet/app/test/fixtures/home-assistant/entities/cover';
import { resetAppStores } from '@navet/app/test/store-reset';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoverCard } from '../index';

const { closeCoverMock, openCoverMock, setCoverPositionMock, stopCoverMock, toastErrorMock } =
  vi.hoisted(() => ({
    closeCoverMock: vi.fn().mockResolvedValue(undefined),
    openCoverMock: vi.fn().mockResolvedValue(undefined),
    setCoverPositionMock: vi.fn().mockResolvedValue(undefined),
    stopCoverMock: vi.fn().mockResolvedValue(undefined),
    toastErrorMock: vi.fn(),
  }));

vi.mock('@navet/app/services/integration-security-feature.service', () => ({
  integrationSecurityFeatureService: {
    closeCover: closeCoverMock,
    openCover: openCoverMock,
    setCoverPosition: setCoverPositionMock,
    stopCover: stopCoverMock,
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
  },
}));

const COVER_FEATURE_OPEN = 1;
const COVER_FEATURE_CLOSE = 2;
const COVER_FEATURE_SET_POSITION = 4;
const COVER_FEATURE_STOP = 8;
const COVER_FEATURE_OPEN_TILT = 16;
const COVER_FEATURE_CLOSE_TILT = 32;
const COVER_FEATURE_STOP_TILT = 64;
const COVER_FEATURE_SET_TILT_POSITION = 128;
const ALL_COVER_FEATURES =
  COVER_FEATURE_OPEN | COVER_FEATURE_CLOSE | COVER_FEATURE_SET_POSITION | COVER_FEATURE_STOP;
const ALL_TILT_COVER_FEATURES =
  COVER_FEATURE_OPEN_TILT |
  COVER_FEATURE_CLOSE_TILT |
  COVER_FEATURE_STOP_TILT |
  COVER_FEATURE_SET_TILT_POSITION;

function renderCoverCard(props: Partial<ComponentProps<typeof CoverCard>> = {}) {
  return render(
    <I18nProvider>
      <CoverCard
        id="cover.living_room_blind"
        name="Living Room Blind"
        room="Living Room"
        initialPosition={50}
        hasPosition
        supportedFeatures={ALL_COVER_FEATURES}
        size="large"
        isEditMode={false}
        onSizeChange={vi.fn()}
        {...props}
      />
    </I18nProvider>
  );
}

function createCoverEntity(position: number | null, state = 'open') {
  const entity = coverEntityFactory({
    current_position: position === null ? undefined : position,
    supported_features: ALL_COVER_FEATURES,
  });
  entity.entity_id = 'cover.living_room_blind';
  entity.state = state;
  if (position === null) {
    delete (entity.attributes as Record<string, unknown>).current_position;
  }
  return entity;
}

function setLiveCoverPosition(position: number, state = 'open') {
  homeAssistantStore.setState({
    entities: {
      'cover.living_room_blind': createCoverEntity(position, state),
    },
  });
}

function setLiveCoverStateWithoutPosition(state: string) {
  homeAssistantStore.setState({
    entities: {
      'cover.living_room_blind': createCoverEntity(null, state),
    },
  });
}

function setLiveCoverTiltPosition(position: number, state = 'open') {
  homeAssistantStore.setState({
    entities: {
      'cover.living_room_blind': {
        ...createCoverEntity(null, state),
        attributes: {
          current_tilt_position: position,
          supported_features: ALL_TILT_COVER_FEATURES,
        },
      },
    },
  });
}

describe('CoverCard', () => {
  beforeEach(async () => {
    await resetAppStores();
    homeAssistantStore.setState({ entities: null });
    closeCoverMock.mockReset();
    closeCoverMock.mockResolvedValue(undefined);
    openCoverMock.mockReset();
    openCoverMock.mockResolvedValue(undefined);
    setCoverPositionMock.mockReset();
    setCoverPositionMock.mockResolvedValue(undefined);
    stopCoverMock.mockReset();
    stopCoverMock.mockResolvedValue(undefined);
    toastErrorMock.mockReset();
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
  });

  // Keep: these cases verify visible state and supported actions on real cards.
  it.each([
    { position: 0, tone: 'primary' },
    { position: 30, tone: 'primary' },
    { position: 50, tone: 'primary' },
    { position: 70, tone: 'neutral' },
    { position: 100, tone: 'primary' },
  ] as const)(
    'uses $tone header colors on the reversed fill at $position%',
    ({ position, tone }) => {
      useThemeStore.setState({ theme: 'dark', primaryColor: 'orange', followSystemTheme: false });
      renderCoverCard({ size: 'small', initialPosition: position });
      expect(screen.getByRole('heading', { name: 'Living Room Blind' })).toHaveStyle({
        color: getCardReadableTextTokens({ theme: 'dark', tone, accentColor: '#f97316' })
          .titleColor,
      });
      const icon = screen
        .getByRole('button', { name: 'Toggle Living Room Blind cover' })
        .querySelector('svg');
      if (tone === 'primary') expect(icon?.style.color).not.toBe('');
      else expect(icon?.style.color).toBe('');
    }
  );

  it('renders window covers from their initial and live provider class', async () => {
    renderCoverCard({ initialDeviceClass: 'window', size: 'small' });
    expect(screen.getByText('Living Room Blind')).toBeVisible();
    expect(screen.getByText('Windows')).toBeVisible();
    expect(screen.queryByText('Doors')).not.toBeInTheDocument();
    const entity = createCoverEntity(100);
    entity.attributes.device_class = 'window';
    act(() => homeAssistantStore.setState({ entities: { [entity.entity_id]: entity } }));
    await waitFor(() => expect(screen.getByText('Open')).toBeVisible());
    expect(screen.getByText('Windows')).toBeVisible();
  });

  it.each(['unknown', 'unavailable'] as const)(
    'renders initial %s without a false closed state',
    (state) => {
      renderCoverCard({
        initialState: state,
        initialPosition: 0,
        hasPosition: false,
        size: 'small',
      });
      expect(screen.getByText('Unavailable')).toBeVisible();
      expect(screen.queryByText('Closed')).not.toBeInTheDocument();
      expect(screen.queryByText('0%')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled();
      const cardToggle = screen.getByRole('button', { name: 'Living Room Blind cover' });
      expect(cardToggle).toHaveAttribute('aria-disabled', 'true');
      expect(cardToggle).toHaveAttribute('tabindex', '-1');
      expect(screen.getByRole('button', { name: 'Toggle Living Room Blind cover' })).toBeDisabled();
      fireEvent.keyDown(cardToggle, { key: 'Enter' });
      fireEvent.click(cardToggle);
      expect(openCoverMock).not.toHaveBeenCalled();
      const settings = screen.getByRole('button', {
        name: 'Open settings for Living Room Blind cover',
      });
      expect(settings).toBeEnabled();
      fireEvent.click(settings);
      expect(screen.getByRole('dialog')).toBeVisible();
    }
  );

  it.each(['unknown', 'unavailable'] as const)(
    'reflects live %s and recovers to open',
    async (state) => {
      setLiveCoverStateWithoutPosition(state);
      renderCoverCard({ initialPosition: 0, hasPosition: false, size: 'medium' });
      expect(await screen.findByText('Unavailable')).toBeVisible();
      expect(screen.queryByText('Closed')).not.toBeInTheDocument();
      act(() => setLiveCoverStateWithoutPosition('open'));
      expect(await screen.findByText('Open')).toBeVisible();
      expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Toggle Living Room Blind cover' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Living Room Blind cover' })).toHaveAttribute(
        'aria-disabled',
        'false'
      );
    }
  );

  it('opens with position controls and sends dialog actions to the provider', async () => {
    renderCoverCard({ size: 'medium' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Open settings for Living Room Blind cover' })
    );
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(openCoverMock).toHaveBeenCalled());
    fireEvent.click(dialog.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(stopCoverMock).toHaveBeenCalled());
    fireEvent.click(
      within(dialog.getByRole('group', { name: 'Controls' })).getByRole('button', { name: 'Close' })
    );
    await waitFor(() => expect(closeCoverMock).toHaveBeenCalled());
    fireEvent.click(dialog.getByRole('button', { name: '25%' }));
    await waitFor(() =>
      expect(setCoverPositionMock).toHaveBeenCalledWith('cover.living_room_blind', 25, 'position')
    );
  });

  it('hides unsupported Stop controls and position presets while disabling Close', () => {
    renderCoverCard({ size: 'medium', hasPosition: false, supportedFeatures: COVER_FEATURE_OPEN });
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Open settings for Living Room Blind cover' })
    );
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('button', { name: 'Open' })).toBeEnabled();
    expect(dialog.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
    expect(
      within(dialog.getByRole('group', { name: 'Controls' })).getByRole('button', { name: 'Close' })
    ).toBeDisabled();
    expect(dialog.queryByRole('button', { name: '25%' })).not.toBeInTheDocument();
  });

  it.each(['medium'] as const)(
    'drags the %s handle using its gesture surface height when card bounds differ',
    async (size) => {
      renderCoverCard({ size, initialPosition: 72 });
      const slider = screen.getByRole('slider', { name: 'Living Room Blind cover' });
      const card = slider.closest('[data-cover-card-root="true"]') as HTMLElement;
      vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
        top: 0,
        bottom: 100,
        height: 100,
        left: 0,
        right: 168,
        width: 168,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
        top: -10,
        bottom: 110,
        height: 120,
        left: 0,
        right: 168,
        width: 168,
        x: 0,
        y: -10,
        toJSON: () => ({}),
      });
      const handle = slider.querySelector('[data-cover-position-handle]') as HTMLElement;
      fireEvent.pointerDown(handle, { clientY: 60, pointerId: 1 });
      fireEvent.pointerMove(slider, { clientY: 36, pointerId: 1 });
      expect(setCoverPositionMock).not.toHaveBeenCalled();
      fireEvent.pointerUp(slider, { clientY: 36, pointerId: 1 });
      await waitFor(() =>
        expect(setCoverPositionMock).toHaveBeenCalledWith('cover.living_room_blind', 92, 'position')
      );
      expect(setCoverPositionMock).toHaveBeenCalledTimes(1);
      expect(closeCoverMock).not.toHaveBeenCalled();
    }
  );

  it('calls the provider open cover action', async () => {
    renderCoverCard();

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    await waitFor(() =>
      expect(openCoverMock).toHaveBeenCalledWith('cover.living_room_blind', 'position')
    );
  });

  it('shows live state without percentages for covers without position data', () => {
    act(() => setLiveCoverStateWithoutPosition('open'));
    renderCoverCard({ hasPosition: false, initialPosition: 0 });

    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it.each(['extra-small', 'small', 'medium', 'large'] as const)(
    'uses simple garage controls at %s size',
    (size) => {
      renderCoverCard({ size, initialDeviceClass: 'garage', initialPosition: 100 });
      expect(screen.getByText('Open')).toBeInTheDocument();
      expect(screen.queryByText('100%')).not.toBeInTheDocument();
      expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    }
  );

  it('persists the selected controls through closing and remounting the card', async () => {
    const card = renderCoverCard({ size: 'medium' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Open settings for Living Room Blind cover' })
    );
    fireEvent.keyDown(screen.getAllByRole('button', { name: 'More actions' })[0], { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Customize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simple controls' }));
    expect(
      useSettingsStore.getState().coverControlModes['home_assistant:cover.living_room_blind']
    ).toBe('simple');
    fireEvent.click(screen.getByRole('button', { name: 'Back to controls' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.queryByRole('slider')).not.toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: '25%' })).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(openCoverMock).toHaveBeenCalled());
    card.unmount();
    renderCoverCard({ size: 'medium' });
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('allows position controls for a garage and keeps preferences provider scoped', () => {
    useSettingsStore.getState().updateCoverControlMode('homey:garage', 'simple');
    useSettingsStore.getState().updateCoverControlMode('cover.living_room_blind', 'position');
    renderCoverCard({ size: 'medium', initialDeviceClass: 'garage' });
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect(useSettingsStore.getState().coverControlModes['homey:garage']).toBe('simple');
  });

  it('keeps movement states visible in simple mode', () => {
    act(() => setLiveCoverStateWithoutPosition('opening'));
    renderCoverCard({ size: 'medium', hasPosition: false });
    expect(screen.getByText('Opening...')).toBeInTheDocument();
    act(() => setLiveCoverStateWithoutPosition('closing'));
    expect(screen.getByText('Closing...')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('opens positionless covers from the card', async () => {
    act(() => setLiveCoverStateWithoutPosition('closed'));
    renderCoverCard({ hasPosition: false, initialPosition: 0 });

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    await waitFor(() =>
      expect(openCoverMock).toHaveBeenCalledWith('cover.living_room_blind', 'position')
    );
  });

  it('calls the provider close cover action', async () => {
    renderCoverCard();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(closeCoverMock).toHaveBeenCalledWith('cover.living_room_blind', 'position')
    );
  });

  it('toggles open and close from a card tap', async () => {
    renderCoverCard({ initialPosition: 70 });

    fireEvent.click(screen.getByRole('button', { name: 'Living Room Blind cover' }));

    await waitFor(() =>
      expect(closeCoverMock).toHaveBeenCalledWith('cover.living_room_blind', 'position')
    );
  });

  it('calls the provider stop cover action', async () => {
    renderCoverCard();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    await waitFor(() =>
      expect(stopCoverMock).toHaveBeenCalledWith('cover.living_room_blind', 'position')
    );
  });

  it('calls the provider set cover position action from presets', async () => {
    renderCoverCard();

    fireEvent.click(screen.getByRole('button', { name: '75' }));

    await waitFor(() =>
      expect(setCoverPositionMock).toHaveBeenCalledWith('cover.living_room_blind', 75, 'position')
    );
  });

  it('uses tilt services for tilt-only cover position controls', async () => {
    act(() => setLiveCoverTiltPosition(30));
    renderCoverCard({
      initialPosition: 30,
      initialPositionMode: 'tilt',
      supportedFeatures: ALL_TILT_COVER_FEATURES,
    });

    fireEvent.click(screen.getByRole('button', { name: '75' }));

    await waitFor(() =>
      expect(setCoverPositionMock).toHaveBeenCalledWith('cover.living_room_blind', 75, 'tilt')
    );
  });

  it('uses tilt open and close services for tilt-only covers', async () => {
    act(() => setLiveCoverTiltPosition(0, 'closed'));
    renderCoverCard({
      initialPosition: 0,
      initialPositionMode: 'tilt',
      supportedFeatures: ALL_TILT_COVER_FEATURES,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    await waitFor(() =>
      expect(openCoverMock).toHaveBeenCalledWith('cover.living_room_blind', 'tilt')
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(closeCoverMock).toHaveBeenCalledWith('cover.living_room_blind', 'tilt')
    );
  });

  it('follows live tilt movement while Home Assistant reports intermediate opening positions', async () => {
    act(() => setLiveCoverTiltPosition(0, 'closed'));
    renderCoverCard({
      initialPosition: 0,
      initialPositionMode: 'tilt',
      supportedFeatures: ALL_TILT_COVER_FEATURES,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    await waitFor(() =>
      expect(openCoverMock).toHaveBeenCalledWith('cover.living_room_blind', 'tilt')
    );
    expect(screen.getAllByText('0%').length).toBeGreaterThan(0);

    act(() => setLiveCoverTiltPosition(10, 'opening'));
    expect(screen.getAllByText('10%').length).toBeGreaterThan(0);

    act(() => setLiveCoverTiltPosition(30, 'opening'));
    expect(screen.getAllByText('30%').length).toBeGreaterThan(0);

    act(() => setLiveCoverTiltPosition(100, 'open'));
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
  });

  it('previews upward cover position swipes and commits once on release', async () => {
    renderCoverCard();

    const gestureSurface = screen.getByRole('slider', { name: 'Living Room Blind cover' });
    vi.spyOn(gestureSurface, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 120,
      toJSON: () => ({}),
      top: 0,
      width: 120,
      x: 0,
      y: 0,
    });

    fireEvent.pointerDown(gestureSurface, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(gestureSurface, { clientY: 40, pointerId: 1 });

    expect(setCoverPositionMock).not.toHaveBeenCalled();
    expect(screen.getAllByText('80%').length).toBeGreaterThan(0);

    fireEvent.pointerUp(gestureSurface, { clientY: 40, pointerId: 1 });

    await waitFor(() =>
      expect(setCoverPositionMock).toHaveBeenCalledWith('cover.living_room_blind', 80, 'position')
    );
    expect(setCoverPositionMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the committed cover position optimistic while Home Assistant reports intermediate movement', async () => {
    act(() => setLiveCoverPosition(30));
    renderCoverCard({ initialPosition: 30 });

    const gestureSurface = screen.getByRole('slider', { name: 'Living Room Blind cover' });
    vi.spyOn(gestureSurface, 'getBoundingClientRect').mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 120,
      toJSON: () => ({}),
      top: 0,
      width: 120,
      x: 0,
      y: 0,
    });

    fireEvent.pointerDown(gestureSurface, { clientY: 70, pointerId: 1 });
    fireEvent.pointerMove(gestureSurface, { clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(gestureSurface, { clientY: 30, pointerId: 1 });

    await waitFor(() =>
      expect(setCoverPositionMock).toHaveBeenCalledWith('cover.living_room_blind', 70, 'position')
    );
    expect(screen.getAllByText('70%').length).toBeGreaterThan(0);

    act(() => setLiveCoverPosition(40, 'opening'));
    expect(screen.queryByText('40%')).not.toBeInTheDocument();
    expect(screen.getAllByText('70%').length).toBeGreaterThan(0);

    act(() => setLiveCoverPosition(60, 'opening'));
    expect(screen.queryByText('60%')).not.toBeInTheDocument();
    expect(screen.getAllByText('70%').length).toBeGreaterThan(0);

    act(() => setLiveCoverPosition(70));
    expect(screen.getAllByText('70%').length).toBeGreaterThan(0);
  });

  it('follows live position movement while position-capable covers are closing', async () => {
    act(() => setLiveCoverPosition(70));
    renderCoverCard({ initialPosition: 70 });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(closeCoverMock).toHaveBeenCalledWith('cover.living_room_blind', 'position')
    );
    expect(screen.getAllByText('70%').length).toBeGreaterThan(0);

    act(() => setLiveCoverPosition(40, 'closing'));
    expect(screen.getAllByText('40%').length).toBeGreaterThan(0);

    act(() => setLiveCoverPosition(0, 'closed'));
    expect(screen.getAllByText('0%').length).toBeGreaterThan(0);
  });

  it('commits downward cover position swipes once on release', async () => {
    renderCoverCard();

    const gestureSurface = screen.getByRole('slider', { name: 'Living Room Blind cover' });
    vi.spyOn(gestureSurface, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 120,
      toJSON: () => ({}),
      top: 0,
      width: 120,
      x: 0,
      y: 0,
    });

    fireEvent.pointerDown(gestureSurface, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(gestureSurface, { clientY: 160, pointerId: 1 });

    expect(setCoverPositionMock).not.toHaveBeenCalled();

    fireEvent.pointerUp(gestureSurface, { clientY: 160, pointerId: 1 });

    await waitFor(() =>
      expect(setCoverPositionMock).toHaveBeenCalledWith('cover.living_room_blind', 20, 'position')
    );
    expect(setCoverPositionMock).toHaveBeenCalledTimes(1);
  });

  it('supports position swipes from the compact metric surface', async () => {
    renderCoverCard({ size: 'medium' });

    const gestureSurface = screen.getByRole('slider', { name: 'Living Room Blind cover' });
    vi.spyOn(gestureSurface, 'getBoundingClientRect').mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 120,
      toJSON: () => ({}),
      top: 0,
      width: 120,
      x: 0,
      y: 0,
    });

    fireEvent.pointerDown(gestureSurface, { clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(gestureSurface, { clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(gestureSurface, { clientY: 20, pointerId: 1 });

    await waitFor(() =>
      expect(setCoverPositionMock).toHaveBeenCalledWith('cover.living_room_blind', 80, 'position')
    );
  });

  it('maps compact surface swipes against the card height so the fill follows the pointer', async () => {
    renderCoverCard({ size: 'medium' });

    const gestureSurface = screen.getByRole('slider', { name: 'Living Room Blind cover' });
    const cardRoot = gestureSurface.closest('[data-cover-card-root="true"]') as HTMLElement;
    vi.spyOn(cardRoot, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 160,
      toJSON: () => ({}),
      top: 0,
      width: 160,
      x: 0,
      y: 0,
    });
    vi.spyOn(gestureSurface, 'getBoundingClientRect').mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 120,
      toJSON: () => ({}),
      top: 0,
      width: 120,
      x: 0,
      y: 0,
    });

    fireEvent.pointerDown(gestureSurface, { clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(gestureSurface, { clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(gestureSurface, { clientY: 20, pointerId: 1 });

    await waitFor(() =>
      expect(setCoverPositionMock).toHaveBeenCalledWith('cover.living_room_blind', 90, 'position')
    );
  });

  it('does not trigger the card tap open or close action after a position swipe', async () => {
    renderCoverCard();

    const gestureSurface = screen.getByRole('slider', { name: 'Living Room Blind cover' });
    const cardRoot = gestureSurface.closest('[data-cover-card-root="true"]') as HTMLElement;
    vi.spyOn(gestureSurface, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 160,
      toJSON: () => ({}),
      top: 0,
      width: 160,
      x: 0,
      y: 0,
    });

    fireEvent.pointerDown(gestureSurface, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(gestureSurface, { clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(gestureSurface, { clientY: 40, pointerId: 1 });
    fireEvent.click(cardRoot);

    await waitFor(() =>
      expect(setCoverPositionMock).toHaveBeenCalledWith('cover.living_room_blind', 80, 'position')
    );
    expect(setCoverPositionMock).toHaveBeenCalledTimes(1);
    expect(closeCoverMock).not.toHaveBeenCalled();
  });

  it('toggles the cover when tapping the position gesture surface without dragging', async () => {
    renderCoverCard();

    const gestureSurface = screen.getByRole('slider', { name: 'Living Room Blind cover' });

    fireEvent.pointerDown(gestureSurface, { clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(gestureSurface, { clientY: 100, pointerId: 1 });

    await waitFor(() =>
      expect(closeCoverMock).toHaveBeenCalledWith('cover.living_room_blind', 'position')
    );
    expect(setCoverPositionMock).not.toHaveBeenCalled();
    expect(stopCoverMock).not.toHaveBeenCalled();
  });

  it('does not preview or commit a position change when the position gesture is tapped without dragging', async () => {
    renderCoverCard({ size: 'medium' });

    const gestureSurface = screen.getByRole('slider', { name: 'Living Room Blind cover' });
    const cardRoot = gestureSurface.closest('[data-cover-card-root="true"]') as HTMLElement;
    vi.spyOn(cardRoot, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 160,
      toJSON: () => ({}),
      top: 0,
      width: 160,
      x: 0,
      y: 0,
    });

    fireEvent.pointerDown(gestureSurface, { clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(gestureSurface, { clientY: 100, pointerId: 1 });

    expect(screen.queryByText('90%')).not.toBeInTheDocument();
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
    expect(setCoverPositionMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(closeCoverMock).toHaveBeenCalledWith('cover.living_room_blind', 'position')
    );
  });

  it('does not call set position when a drag returns to the starting position', () => {
    renderCoverCard({ size: 'medium' });

    const gestureSurface = screen.getByRole('slider', { name: 'Living Room Blind cover' });
    const cardRoot = gestureSurface.closest('[data-cover-card-root="true"]') as HTMLElement;
    vi.spyOn(cardRoot, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 160,
      toJSON: () => ({}),
      top: 0,
      width: 160,
      x: 0,
      y: 0,
    });

    fireEvent.pointerDown(gestureSurface, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(gestureSurface, { clientY: 60, pointerId: 1 });
    fireEvent.pointerMove(gestureSurface, { clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(gestureSurface, { clientY: 100, pointerId: 1 });
    fireEvent.click(cardRoot);

    expect(screen.queryByText('70%')).not.toBeInTheDocument();
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
    expect(setCoverPositionMock).not.toHaveBeenCalled();
  });

  it('reverts swipe previews without committing when the gesture is canceled', () => {
    renderCoverCard();

    const gestureSurface = screen.getByRole('slider', { name: 'Living Room Blind cover' });
    vi.spyOn(gestureSurface, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 120,
      toJSON: () => ({}),
      top: 0,
      width: 120,
      x: 0,
      y: 0,
    });

    fireEvent.pointerDown(gestureSurface, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(gestureSurface, { clientY: 40, pointerId: 1 });

    expect(screen.getAllByText('80%').length).toBeGreaterThan(0);

    fireEvent.pointerCancel(gestureSurface, { clientY: 40, pointerId: 1 });

    expect(screen.queryByText('80%')).not.toBeInTheDocument();
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
    expect(setCoverPositionMock).not.toHaveBeenCalled();
  });

  it('disables position presets when set position is unsupported', () => {
    renderCoverCard({
      supportedFeatures: COVER_FEATURE_OPEN | COVER_FEATURE_CLOSE | COVER_FEATURE_STOP,
    });

    expect(screen.getByRole('button', { name: '75' })).toBeDisabled();
  });

  it('disables cover position swipes when set position is unsupported', () => {
    renderCoverCard({
      supportedFeatures: COVER_FEATURE_OPEN | COVER_FEATURE_CLOSE | COVER_FEATURE_STOP,
    });

    const gestureSurface = screen.getByRole('slider', { name: 'Living Room Blind cover' });
    vi.spyOn(gestureSurface, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 120,
      toJSON: () => ({}),
      top: 0,
      width: 120,
      x: 0,
      y: 0,
    });

    fireEvent.pointerDown(gestureSurface, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(gestureSurface, { clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(gestureSurface, { clientY: 40, pointerId: 1 });

    expect(gestureSurface).toHaveAttribute('aria-disabled', 'true');
    expect(setCoverPositionMock).not.toHaveBeenCalled();
  });

  it.each([
    ['Open', 'closed', 'Closed', 'Opening...', openCoverMock],
    ['Close', 'open', 'Open', 'Closing...', closeCoverMock],
  ] as const)(
    'restores simple-mode state after a failed %s command',
    async (action, state, label, pendingLabel, command) => {
      let rejectCommand: (reason: Error) => void = () => {};
      command.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectCommand = reject;
          })
      );
      renderCoverCard({
        size: 'medium',
        initialDeviceClass: 'garage',
        initialState: state,
        initialPosition: state === 'open' ? 100 : 0,
        hasPosition: false,
      });
      fireEvent.click(screen.getByRole('button', { name: action }));
      expect(screen.getByText(pendingLabel)).toBeInTheDocument();
      await act(async () => rejectCommand(new Error('failed')));
      await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('failed'));
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.queryByText(pendingLabel)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Living Room Blind cover' })).toHaveAttribute(
        'aria-pressed',
        state === 'open' ? 'true' : 'false'
      );
    }
  );

  it('keeps newer provider state when an earlier open command fails', async () => {
    let rejectCommand: (reason: Error) => void = () => {};
    openCoverMock.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectCommand = reject;
        })
    );
    act(() => setLiveCoverStateWithoutPosition('closed'));
    renderCoverCard({ size: 'medium', initialDeviceClass: 'garage', hasPosition: false });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    act(() => setLiveCoverStateWithoutPosition('open'));
    await act(async () => rejectCommand(new Error('failed')));
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.queryByText('Opening...')).not.toBeInTheDocument();
  });

  it('shows service action failures through the shared handler', async () => {
    openCoverMock.mockRejectedValue('failed');
    renderCoverCard();

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Unable to update cover'));
  });
});
