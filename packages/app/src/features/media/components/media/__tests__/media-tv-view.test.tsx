import { renderWithProviders } from '@navet/app/test/render';
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MediaTvView } from '../media-tv-view';

const defaultProps = {
  size: 'small' as const,
  playerName: 'Living Room TV',
  source: 'HDMI 1',
  sourceList: ['HDMI 1', 'Apple TV'],
  isOn: true,
  isPlaying: false,
  volume: 24,
  isMuted: false,
  theme: 'glass' as const,
  remoteAvailable: true,
  canSetVolume: true,
  canMuteVolume: true,
  canSelectSource: true,
  onTogglePlay: vi.fn(),
  onToggleMute: vi.fn(),
  onVolumeChange: vi.fn(),
  onVolumeInteractionStart: vi.fn(),
  onVolumeInteractionEnd: vi.fn(),
  onSelectSource: vi.fn(),
  onRemoteCommand: vi.fn(),
  onOpenDialog: vi.fn(),
};

describe('MediaTvView', () => {
  it.each(['medium', 'medium-vertical', 'large'] as const)(
    'adjusts volume and channels independently from the %s card columns',
    (size) => {
      const onVolumeChange = vi.fn();
      const onRemoteCommand = vi.fn();
      const onToggleMute = vi.fn();
      renderWithProviders(
        <MediaTvView
          {...defaultProps}
          size={size}
          onVolumeChange={onVolumeChange}
          onRemoteCommand={onRemoteCommand}
          onToggleMute={onToggleMute}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Volume up' }));
      expect(onVolumeChange).toHaveBeenLastCalledWith(34);
      fireEvent.click(screen.getByRole('button', { name: 'Volume down' }));
      expect(onVolumeChange).toHaveBeenLastCalledWith(14);

      const channelUp = screen.getByRole('button', { name: 'Channel up' });
      expect(channelUp).toHaveTextContent('CH+');
      fireEvent.click(channelUp);
      expect(onRemoteCommand).toHaveBeenLastCalledWith('channelUp');
      fireEvent.click(screen.getByRole('button', { name: 'Channel down' }));
      expect(onRemoteCommand).toHaveBeenLastCalledWith('channelDown');
      fireEvent.click(screen.getByRole('button', { name: 'Mute volume' }));
      expect(onToggleMute).toHaveBeenCalledOnce();
    }
  );

  it('reserves the navigation pad footprint for long medium-card names', () => {
    const playerName = 'Samsung The Frame 65 QE65LS03AAUXXC';
    const { container, rerender } = renderWithProviders(
      <MediaTvView {...defaultProps} size="medium" playerName={playerName} />
    );

    const reservedHeader = container.querySelector('.pr-28');
    expect(reservedHeader).toHaveTextContent(playerName);
    expect(reservedHeader?.nextElementSibling).toHaveClass('relative', 'flex', 'min-h-0');

    rerender(
      <MediaTvView
        {...defaultProps}
        size="medium"
        playerName={playerName}
        remoteAvailable={false}
      />
    );
    expect(screen.getByText(playerName).closest('.pr-28')).toBeNull();
  });

  it('switches small-card controls while keeping settings available', () => {
    const onOpenDialog = vi.fn();
    const onToggleMute = vi.fn();
    renderWithProviders(
      <MediaTvView {...defaultProps} onOpenDialog={onOpenDialog} onToggleMute={onToggleMute} />
    );
    const volumeToggle = screen.getByRole('button', { name: 'Volume controls' });
    const settings = screen.getByRole('button', { name: 'More actions' });
    expect(volumeToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Volume up' })).not.toBeInTheDocument();
    for (const name of ['Menu', 'Home', 'Back', 'Resume playback', 'Show navigation pad']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    fireEvent.click(volumeToggle);
    expect(screen.queryByRole('button', { name: 'Volume controls' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Channel controls' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volume up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volume down' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mute volume' }));
    expect(onToggleMute).toHaveBeenCalledOnce();
    expect(settings).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Channel controls' }));
    expect(screen.queryByRole('button', { name: 'Volume controls' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Channel controls' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Volume up' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Channel up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Channel down' })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole('button', { name: 'Volume controls' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Channel controls' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Channel up' })).not.toBeInTheDocument();
    fireEvent.click(settings);
    expect(onOpenDialog).toHaveBeenCalledOnce();
  });

  it('returns small-card controls to the toggles after three seconds of inactivity', () => {
    vi.useFakeTimers();
    try {
      renderWithProviders(<MediaTvView {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'Volume controls' }));
      act(() => vi.advanceTimersByTime(2500));
      fireEvent.click(screen.getByRole('button', { name: 'Volume up' }));
      act(() => vi.advanceTimersByTime(2999));
      expect(screen.getByRole('button', { name: 'Volume up' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Channel controls' })).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1));
      expect(screen.getByRole('button', { name: 'Volume controls' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Channel controls' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Volume up' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides unsupported remote, volume, and source controls', () => {
    renderWithProviders(
      <MediaTvView
        {...defaultProps}
        remoteAvailable={false}
        canSetVolume={false}
        canMuteVolume={false}
        canSelectSource={false}
      />
    );

    expect(screen.queryByRole('button', { name: 'Volume down' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Volume up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mute volume' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Channel down' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Channel up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show navigation pad' })).not.toBeInTheDocument();
    expect(screen.queryByText('HDMI 1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('renders source badges inside the TV input source selector menu', async () => {
    renderWithProviders(
      <MediaTvView
        {...defaultProps}
        size="medium"
        source="Apple TV"
        sourceList={['Apple TV', 'Netflix']}
      />
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: /apple tv/i }));

    expect((await screen.findAllByText('Apple TV')).length).toBeGreaterThan(1);
    expect(screen.getByText('Netflix')).toBeInTheDocument();
  });

  it('uses a visible fallback source badge for unknown sources in light theme', () => {
    const { container } = renderWithProviders(
      <MediaTvView
        {...defaultProps}
        theme="light"
        size="medium"
        source="Samsung TV Plus"
        sourceList={['Samsung TV Plus']}
      />
    );

    const badge = container.querySelector('button[aria-haspopup="menu"] span[aria-hidden="true"]');
    expect(badge?.className).toContain('bg-white');
    expect(badge?.className).toContain('border-slate-300/90');
    expect(badge?.className).toContain('text-slate-700');
  });
});
