import type { PlatformCameraPlaybackModel } from '@navet/app/platform/provider-feature-models';
import { setMediaQueryMatch } from '@navet/app/test/browser-mocks';
import { cameraEntityFixtures } from '@navet/app/test/fixtures/home-assistant/entities/camera';
import { renderWithProviders } from '@navet/app/test/render';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraLiveViewer } from '../camera-live-viewer';

const { autoLoadStreamPlayerMock, dispatchEntityCommandMock, getCameraPlaybackPlanMock } =
  vi.hoisted(() => ({
    autoLoadStreamPlayerMock: { current: false },
    dispatchEntityCommandMock: vi.fn().mockResolvedValue({ accepted: true }),
    getCameraPlaybackPlanMock: vi.fn(),
  }));

vi.mock('@navet/app/commands', () => ({
  dispatchEntityCommand: dispatchEntityCommandMock,
}));

vi.mock('../camera-stream-player', async () => {
  const { useEffect } = await vi.importActual<typeof import('react')>('react');

  return {
    CameraStreamPlayer: ({
      entityId,
      kind,
      fitMode,
      onLoad,
    }: {
      entityId: string;
      kind: string;
      fitMode: string;
      onLoad: () => void;
    }) => {
      useEffect(() => {
        if (autoLoadStreamPlayerMock.current) {
          onLoad();
        }
      }, [kind]);

      return (
        <div data-testid="camera-stream-player" data-fit-mode={fitMode}>
          {`${entityId}:${kind}`}
        </div>
      );
    },
  };
});

vi.mock('@navet/app/services/integration-camera-runtime.service', () => ({
  getCameraPlaybackPlan: getCameraPlaybackPlanMock,
}));

const defaultProps = {
  isOpen: true,
  onOpenChange: vi.fn(),
  entityId: 'home_assistant:camera.front_door',
  name: 'Front Door',
  room: 'Entrance',
  cameraState: 'streaming' as const,
  snapshotUrl: String(cameraEntityFixtures.relativeUrl.attributes.entity_picture),
  cameraViewMode: 'auto' as const,
  preferredTransport: 'auto' as const,
  isStreamCapable: true,
  motionDetectionEnabled: true,
  initialStreamResource: null,
  onRefresh: vi.fn(),
  onOpenSettings: vi.fn(),
  onCameraViewModeChange: vi.fn(),
  onPreferredTransportChange: vi.fn(),
  onCameraFitModeChange: vi.fn(),
};

beforeEach(() => {
  setMediaQueryMatch('(max-width: 639px)', false);
  setMediaQueryMatch('(orientation: portrait)', false);
  autoLoadStreamPlayerMock.current = false;
  dispatchEntityCommandMock.mockClear();
});

describe('CameraLiveViewer', () => {
  it('uses a centered landscape frame in portrait instead of filling the viewport', async () => {
    setMediaQueryMatch('(orientation: portrait)', true);
    getCameraPlaybackPlanMock.mockResolvedValue({
      cameraState: 'streaming',
      snapshotResource: null,
      supportsSnapshot: false,
      liveTransports: [],
      fallbackTransports: [],
      selectedTransport: null,
      selectedStreamResource: null,
      supportsStreaming: false,
      isSnapshotFallback: false,
      shouldStartWithSnapshot: false,
      motionDetectionEnabled: true,
      refreshPolicy: { retryDelaysMs: [1_000] },
    });

    await act(async () => {
      renderWithProviders(<CameraLiveViewer {...defaultProps} />);
    });

    const dialog = screen.getByRole('dialog', { name: 'Front Door' });
    expect(dialog).toHaveClass(
      '!top-1/2',
      '!left-1/2',
      '!h-auto',
      '!-translate-x-1/2',
      '!-translate-y-1/2'
    );
    expect(dialog).not.toHaveClass('h-full');
    const footer = screen.getByTestId('camera-viewer-bottom-controls');
    expect(footer).toHaveClass('py-3');
    expect(footer.className).not.toContain('safe-area-inset-bottom');
    expect(screen.getByTestId('camera-viewer-media')).toHaveClass(
      'aspect-video',
      'w-full',
      'flex-none'
    );
    expect(screen.getByTestId('camera-viewer-top-controls')).toHaveClass(
      'relative',
      'border-b',
      'bg-zinc-950/95'
    );
    expect(screen.getByTestId('camera-viewer-bottom-controls')).toHaveClass(
      'relative',
      'border-t',
      'bg-zinc-950/95'
    );
    expect(
      screen.queryByRole('button', { name: 'Drag dialog to fullscreen or close' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Focused camera viewer' })).toBeInTheDocument();
  });

  it('avoids a duplicate coversheet inset while keeping native fullscreen controls safe', async () => {
    let fullscreenElement: Element | null = null;
    const fullscreenElementDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'fullscreenElement'
    );
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    const requestFullscreen = vi.fn().mockImplementation(async function (this: HTMLElement) {
      fullscreenElement = this;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    getCameraPlaybackPlanMock.mockResolvedValue({
      cameraState: 'streaming',
      snapshotResource: null,
      supportsSnapshot: false,
      liveTransports: [],
      fallbackTransports: [],
      selectedTransport: null,
      selectedStreamResource: null,
      supportsStreaming: false,
      isSnapshotFallback: false,
      shouldStartWithSnapshot: false,
      motionDetectionEnabled: true,
      refreshPolicy: { retryDelaysMs: [1_000] },
    });

    try {
      renderWithProviders(<CameraLiveViewer {...defaultProps} />);
      const topControls = screen.getByTestId('camera-viewer-top-controls');
      expect(topControls).toHaveClass('py-3');
      expect(topControls.className).not.toContain('safe-area-inset-top');

      fireEvent.click(screen.getByRole('button', { name: 'Open Focused camera viewer' }));
      await waitFor(() => expect(requestFullscreen).toHaveBeenCalledTimes(1));
      expect(topControls.className).toContain('safe-area-inset-top');
      expect(topControls).not.toHaveClass('py-3');
    } finally {
      delete (HTMLElement.prototype as { requestFullscreen?: () => Promise<void> })
        .requestFullscreen;
      if (fullscreenElementDescriptor) {
        Object.defineProperty(document, 'fullscreenElement', fullscreenElementDescriptor);
      } else {
        delete (document as { fullscreenElement?: Element | null }).fullscreenElement;
      }
    }
  });

  it.each(['safari', 'standard'] as const)(
    'opens the playing video in native fullscreen using the %s API',
    async (api) => {
      getCameraPlaybackPlanMock.mockResolvedValue({
        cameraState: 'streaming',
        snapshotResource: null,
        selectedTransport: null,
        selectedStreamResource: null,
        supportsStreaming: false,
        refreshPolicy: { retryDelaysMs: [1_000] },
      });
      await act(async () => {
        renderWithProviders(<CameraLiveViewer {...defaultProps} />);
      });
      const video = document.createElement('video');
      const enterVideoFullscreen = vi.fn().mockResolvedValue(undefined);
      Object.assign(
        video,
        api === 'safari'
          ? { webkitEnterFullscreen: enterVideoFullscreen }
          : { requestFullscreen: enterVideoFullscreen }
      );
      const media = screen.getByTestId('camera-viewer-media');
      media.appendChild(video);
      const enterDialogFullscreen = vi.fn().mockResolvedValue(undefined);
      Object.assign(media.parentElement ?? {}, { requestFullscreen: enterDialogFullscreen });
      fireEvent.click(screen.getByRole('button', { name: 'Open Focused camera viewer' }));
      // Invoke the native API in the click, before awaiting another fullscreen request.
      expect(enterVideoFullscreen).toHaveBeenCalledTimes(1);
      expect(enterDialogFullscreen).not.toHaveBeenCalled();
    }
  );

  it('groups camera controls in one More actions cover sheet on phones', async () => {
    setMediaQueryMatch('(max-width: 639px)', true);
    getCameraPlaybackPlanMock.mockResolvedValue({
      cameraState: 'streaming',
      snapshotResource: null,
      supportsSnapshot: false,
      liveTransports: [],
      fallbackTransports: [],
      selectedTransport: null,
      selectedStreamResource: null,
      supportsStreaming: false,
      isSnapshotFallback: false,
      shouldStartWithSnapshot: false,
      motionDetectionEnabled: true,
      refreshPolicy: { retryDelaysMs: [1_000] },
    });

    renderWithProviders(
      <CameraLiveViewer
        {...defaultProps}
        accessoryEntities={[
          {
            id: 'home_assistant:light.front_door_ir',
            entity: {
              entityId: 'light.front_door_ir',
              state: 'on',
              attributes: { friendly_name: 'Front Door IR light', brightness: 255 },
            },
          },
        ]}
      />
    );

    const moreActions = screen.getByRole('button', { name: 'More actions' });
    expect(moreActions).not.toHaveTextContent('More actions');
    expect(moreActions).toHaveClass('h-9', 'w-9', 'pointer-events-auto');
    await act(async () => fireEvent.click(moreActions));

    expect(screen.getByRole('dialog', { name: 'More actions' })).toBeInTheDocument();
    const sheetHeader = document.querySelector('[data-sheet-surface-header]');
    expect(sheetHeader).toHaveClass('border-b');
    expect(sheetHeader?.parentElement).not.toHaveClass('px-4');
    expect(screen.getAllByRole('button', { name: 'Close dialog' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'IR light: On' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Camera view: Auto' })).not.toBeInTheDocument();
  });

  it('shows camera accessory information and controls in fullscreen', async () => {
    getCameraPlaybackPlanMock.mockResolvedValue({
      cameraState: 'streaming',
      snapshotResource: null,
      supportsSnapshot: false,
      liveTransports: [],
      fallbackTransports: [],
      selectedTransport: null,
      selectedStreamResource: null,
      supportsStreaming: false,
      isSnapshotFallback: false,
      shouldStartWithSnapshot: false,
      motionDetectionEnabled: true,
      refreshPolicy: { retryDelaysMs: [1_000] },
    });

    renderWithProviders(
      <CameraLiveViewer
        {...defaultProps}
        motionDetected
        accessoryEntities={[
          {
            id: 'home_assistant:binary_sensor.front_door_scenario',
            entity: {
              entityId: 'binary_sensor.front_door_scenario',
              state: 'off',
              attributes: { friendly_name: 'Object analytics scenario 1', device_class: 'motion' },
            },
          },
          {
            id: 'home_assistant:light.front_door_ir',
            entity: {
              entityId: 'light.front_door_ir',
              state: 'on',
              attributes: { friendly_name: 'Front Door IR light', brightness: 255 },
            },
          },
          {
            id: 'home_assistant:binary_sensor.front_door_daynight',
            entity: {
              entityId: 'binary_sensor.front_door_daynight',
              state: 'off',
              attributes: { friendly_name: 'Front Door DayNight', device_class: 'light' },
            },
          },
          {
            id: 'home_assistant:binary_sensor.front_door_vmd',
            entity: {
              entityId: 'binary_sensor.front_door_vmd',
              state: 'unavailable',
              attributes: { friendly_name: 'Front Door VMD 0', device_class: 'motion' },
            },
          },
          {
            id: 'home_assistant:scene.front_door_night',
            entity: {
              entityId: 'scene.front_door_night',
              state: '2026-08-19T20:00:00.000Z',
              attributes: { friendly_name: 'Night scene' },
            },
          },
        ]}
      />
    );

    expect(screen.getByText('Motion')).toBeInTheDocument();
    expect(screen.getByText('Day Night')).toBeInTheDocument();
    expect(screen.queryByText('Object analytics scenario 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Front Door VMD 0')).not.toBeInTheDocument();

    const lightControl = screen.getByRole('button', { name: 'IR light: On' });
    expect(lightControl).toHaveClass('h-10');
    expect(lightControl).toHaveTextContent('IR light');
    fireEvent.click(lightControl);
    expect(screen.getAllByText('IR light')).toHaveLength(2);
    expect(screen.getByText('100%')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'IR light: On' })[1] as HTMLElement);
    });
    expect(dispatchEntityCommandMock).toHaveBeenCalledWith({
      type: 'turn_off',
      entityId: 'home_assistant:light.front_door_ir',
    });

    expect(screen.getByRole('slider', { name: 'IR light Brightness' })).toHaveAttribute(
      'aria-valuenow',
      '100'
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Night scene: Activate' }));
    });
    expect(dispatchEntityCommandMock).toHaveBeenCalledWith({
      type: 'turn_on',
      entityId: 'home_assistant:scene.front_door_night',
    });
  });

  it('lets the viewer switch camera view modes', async () => {
    const onCameraViewModeChange = vi.fn();
    getCameraPlaybackPlanMock.mockResolvedValue({
      cameraState: 'streaming',
      snapshotResource: {
        id: 'camera.front_door:snapshot',
        kind: 'image',
        cacheKey: 'camera.front_door:snapshot',
        authStrategy: 'none',
        url: String(cameraEntityFixtures.relativeUrl.attributes.entity_picture),
      },
      supportsSnapshot: true,
      liveTransports: ['web_rtc'],
      fallbackTransports: [],
      selectedTransport: 'web_rtc',
      selectedStreamResource: null,
      supportsStreaming: true,
      isSnapshotFallback: false,
      shouldStartWithSnapshot: false,
      motionDetectionEnabled: true,
      refreshPolicy: { retryDelaysMs: [1_000, 3_000, 7_000] },
    });

    renderWithProviders(
      <CameraLiveViewer {...defaultProps} onCameraViewModeChange={onCameraViewModeChange} />
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Camera view: Auto' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Snapshot' }));

    expect(onCameraViewModeChange).toHaveBeenCalledWith('snapshot');
    await waitFor(() => expect(getCameraPlaybackPlanMock).toHaveBeenCalled());
  });

  it('keeps every supported view mode in the fullscreen dropdown', async () => {
    getCameraPlaybackPlanMock.mockResolvedValue({
      cameraState: 'streaming',
      snapshotResource: {
        id: 'camera.front_door:snapshot',
        kind: 'image',
        cacheKey: 'camera.front_door:snapshot',
        authStrategy: 'none',
        url: String(cameraEntityFixtures.relativeUrl.attributes.entity_picture),
      },
      supportsSnapshot: true,
      liveTransports: ['web_rtc'],
      fallbackTransports: [],
      selectedTransport: null,
      selectedStreamResource: null,
      supportsStreaming: false,
      isSnapshotFallback: false,
      shouldStartWithSnapshot: true,
      motionDetectionEnabled: true,
      refreshPolicy: { snapshotRefreshMs: 30_000, retryDelaysMs: [1_000, 3_000, 7_000] },
    });

    renderWithProviders(<CameraLiveViewer {...defaultProps} cameraViewMode="snapshot" />);

    const viewModeTrigger = await screen.findByRole('button', {
      name: 'Camera view: Snapshot',
    });
    fireEvent.pointerDown(viewModeTrigger);

    expect(screen.getByRole('menuitemradio', { name: 'Auto' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'Live' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'Snapshot' })).toBeInTheDocument();
  });

  it('lets the viewer change among provider-supported stream transports', async () => {
    const onPreferredTransportChange = vi.fn();
    getCameraPlaybackPlanMock.mockResolvedValue({
      cameraState: 'streaming',
      snapshotResource: null,
      supportsSnapshot: false,
      supportedTransports: ['web_rtc', 'mse', 'hls'],
      liveTransports: ['web_rtc', 'mse', 'hls'],
      fallbackTransports: [],
      selectedTransport: 'web_rtc',
      selectedStreamResource: null,
      supportsStreaming: true,
      isSnapshotFallback: false,
      shouldStartWithSnapshot: false,
      motionDetectionEnabled: true,
      refreshPolicy: { retryDelaysMs: [1_000, 3_000, 7_000] },
    });

    renderWithProviders(
      <CameraLiveViewer {...defaultProps} onPreferredTransportChange={onPreferredTransportChange} />
    );

    const streamTrigger = await screen.findByRole('button', { name: 'Live stream: Auto' });
    fireEvent.pointerDown(streamTrigger);

    expect(screen.getByRole('menuitemradio', { name: 'Auto' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'WebRTC' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'MSE' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'HLS' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio', { name: 'MJPEG' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'MSE' }));
    expect(onPreferredTransportChange).toHaveBeenCalledWith('mse');
  });

  it('renders an unavailable fallback when the camera is unavailable', async () => {
    getCameraPlaybackPlanMock.mockResolvedValue({
      cameraState: 'unavailable',
      snapshotResource: null,
      supportsSnapshot: false,
      liveTransports: [],
      fallbackTransports: [],
      selectedTransport: null,
      selectedStreamResource: null,
      supportsStreaming: false,
      isSnapshotFallback: false,
      shouldStartWithSnapshot: false,
      motionDetectionEnabled: null,
      refreshPolicy: { retryDelaysMs: [1_000, 3_000, 7_000] },
    });

    renderWithProviders(
      <CameraLiveViewer {...defaultProps} cameraState="unavailable" snapshotUrl={undefined} />
    );

    expect(await screen.findAllByText('Unavailable')).toHaveLength(2);
    expect(screen.queryByTestId('camera-stream-player')).not.toBeInTheDocument();
  });

  it('shows snapshot fallback messaging when streaming falls back to a still image', async () => {
    getCameraPlaybackPlanMock.mockResolvedValue({
      cameraState: 'streaming',
      snapshotResource: {
        id: 'camera.front_door:snapshot',
        kind: 'image',
        cacheKey: 'camera.front_door:snapshot',
        authStrategy: 'same_origin',
        url: String(cameraEntityFixtures.relativeUrl.attributes.entity_picture),
      },
      supportsSnapshot: true,
      liveTransports: [],
      fallbackTransports: [],
      selectedTransport: null,
      selectedStreamResource: null,
      supportsStreaming: false,
      isSnapshotFallback: true,
      shouldStartWithSnapshot: true,
      motionDetectionEnabled: true,
      refreshPolicy: { snapshotRefreshMs: 30_000, retryDelaysMs: [1_000, 3_000, 7_000] },
    });

    const onRefresh = vi.fn();
    renderWithProviders(
      <CameraLiveViewer {...defaultProps} cameraViewMode="live" onRefresh={onRefresh} />
    );

    expect(await screen.findAllByText('Snapshot fallback')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Front Door' })).toHaveAttribute(
      'src',
      String(cameraEntityFixtures.relativeUrl.attributes.entity_picture)
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh camera snapshot' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders the live stream player for Home Assistant native playback and wires viewer actions', async () => {
    const onOpenSettings = vi.fn();
    const onOpenChange = vi.fn();

    getCameraPlaybackPlanMock.mockResolvedValue({
      cameraState: 'streaming',
      snapshotResource: {
        id: 'camera.front_door:snapshot',
        kind: 'image',
        cacheKey: 'camera.front_door:snapshot',
        authStrategy: 'bearer',
        url: String(cameraEntityFixtures.relativeUrl.attributes.entity_picture),
      },
      supportsSnapshot: true,
      liveTransports: ['hls'],
      fallbackTransports: [],
      selectedTransport: 'hls',
      selectedStreamResource: {
        id: 'camera.front_door:hls',
        kind: 'hls_stream',
        cacheKey: 'camera.front_door:hls',
        authStrategy: 'bearer',
        url: '/api/hls/camera.front_door/master.m3u8',
      },
      supportsStreaming: true,
      isSnapshotFallback: false,
      shouldStartWithSnapshot: false,
      motionDetectionEnabled: true,
      refreshPolicy: { retryDelaysMs: [1_000, 3_000, 7_000] },
    });

    renderWithProviders(
      <CameraLiveViewer
        {...defaultProps}
        initialStreamResource={{
          id: 'camera.front_door:hls',
          kind: 'hls_stream',
          cacheKey: 'camera.front_door:hls',
          authStrategy: 'bearer',
          url: '/api/hls/camera.front_door/master.m3u8',
        }}
        name="Backyard perimeter camera with an intentionally long descriptive name"
        onOpenSettings={onOpenSettings}
        onOpenChange={onOpenChange}
      />
    );

    expect(await screen.findByTestId('camera-stream-player')).toHaveTextContent(
      'home_assistant:camera.front_door:hls'
    );
    expect(screen.getByTestId('camera-stream-player')).toHaveAttribute('data-fit-mode', 'contain');
    expect(screen.getByText('HLS')).toBeInTheDocument();
    const topControls = screen.getByTestId('camera-viewer-top-controls');
    const bottomControls = screen.getByTestId('camera-viewer-bottom-controls');
    expect(topControls).toHaveClass('z-20');
    expect(bottomControls).toHaveClass('z-20');
    expect(screen.getByRole('button', { name: 'Camera view: Auto' }).parentElement).toHaveClass(
      'ml-auto'
    );
    expect(screen.getByTestId('camera-viewer-header-layout')).toHaveClass('flex', 'justify-end');
    const viewerIdentity = screen.getByTestId('camera-viewer-eyebrow');
    expect(screen.getByTestId('camera-viewer-name')).toHaveClass('truncate');
    expect(screen.getByTestId('camera-viewer-name')).toHaveTextContent(
      'Backyard perimeter camera with an intentionally long descriptive name'
    );
    expect(viewerIdentity).toHaveTextContent('EntranceHLSLoading camera feed');
    expect(viewerIdentity).toHaveClass('whitespace-nowrap');
    expect(topControls).not.toContainElement(viewerIdentity);
    expect(bottomControls).toContainElement(viewerIdentity);
    expect(document.querySelector('h2:not(.sr-only)')).not.toBeInTheDocument();
    expect(screen.queryByTestId('camera-viewer-status')).not.toBeInTheDocument();
    expect(screen.getByTestId('camera-viewer-live-status')).toHaveClass(
      'inline-flex',
      'shrink-0',
      'whitespace-nowrap'
    );
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('h-9', 'w-9');
    expect(
      screen.queryByRole('button', { name: 'Refresh camera snapshot' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Camera settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('reuses an already-playing card stream without mounting a second player', async () => {
    const retainedStreamHost = document.createElement('div');
    const retainedFrame = document.createElement('div');
    retainedFrame.dataset.testid = 'retained-camera-stream';
    retainedFrame.textContent = 'retained HLS stream';
    retainedStreamHost.appendChild(retainedFrame);
    getCameraPlaybackPlanMock.mockResolvedValue({
      cameraState: 'streaming',
      snapshotResource: null,
      supportsSnapshot: false,
      supportedTransports: ['hls'],
      liveTransports: ['hls'],
      fallbackTransports: [],
      selectedTransport: 'hls',
      selectedStreamResource: {
        id: 'camera.front_door:hls',
        kind: 'hls_stream',
        cacheKey: 'camera.front_door:hls',
        authStrategy: 'bearer',
        url: '/api/hls/camera.front_door/master.m3u8',
      },
      supportsStreaming: true,
      isSnapshotFallback: false,
      shouldStartWithSnapshot: false,
      motionDetectionEnabled: true,
      refreshPolicy: { retryDelaysMs: [1_000, 3_000, 7_000] },
    });

    renderWithProviders(
      <CameraLiveViewer
        {...defaultProps}
        initialStreamResource={{
          id: 'camera.front_door:hls',
          kind: 'hls_stream',
          cacheKey: 'camera.front_door:hls',
          authStrategy: 'bearer',
          url: '/api/hls/camera.front_door/master.m3u8',
        }}
        initialStreamTransport="hls"
        initialStreamReady
        retainedStreamHost={retainedStreamHost}
      />
    );

    expect(await screen.findByTestId('retained-camera-stream')).toBe(retainedFrame);
    expect(screen.queryByTestId('camera-stream-player')).not.toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('treats an active selected stream as live even when the camera state is idle', async () => {
    getCameraPlaybackPlanMock.mockResolvedValue({
      cameraState: 'idle',
      snapshotResource: {
        id: 'camera.front_door:snapshot',
        kind: 'image',
        cacheKey: 'camera.front_door:snapshot',
        authStrategy: 'bearer',
        url: String(cameraEntityFixtures.relativeUrl.attributes.entity_picture),
      },
      supportsSnapshot: true,
      liveTransports: ['web_rtc'],
      fallbackTransports: [],
      selectedTransport: 'web_rtc',
      selectedStreamResource: null,
      supportsStreaming: true,
      isSnapshotFallback: false,
      shouldStartWithSnapshot: false,
      motionDetectionEnabled: true,
      refreshPolicy: { retryDelaysMs: [1_000, 3_000, 7_000] },
    });

    renderWithProviders(<CameraLiveViewer {...defaultProps} cameraState="idle" />);

    expect(await screen.findByTestId('camera-stream-player')).toHaveTextContent(
      'home_assistant:camera.front_door:web_rtc'
    );
    expect(screen.getByText('Loading camera feed')).toBeInTheDocument();
    expect(screen.queryByText('On')).not.toBeInTheDocument();
  });

  it('does not overwrite readiness reported while a selected stream mounts', async () => {
    autoLoadStreamPlayerMock.current = true;
    getCameraPlaybackPlanMock.mockResolvedValue({
      cameraState: 'streaming',
      snapshotResource: null,
      supportsSnapshot: false,
      supportedTransports: ['web_rtc'],
      liveTransports: ['web_rtc'],
      fallbackTransports: [],
      selectedTransport: 'web_rtc',
      selectedStreamResource: {
        id: 'camera.front_door:web_rtc',
        kind: 'webrtc_stream',
        cacheKey: 'camera.front_door:web_rtc',
        authStrategy: 'same_origin',
        url: '/api/camera_stream',
      },
      supportsStreaming: true,
      isSnapshotFallback: false,
      shouldStartWithSnapshot: false,
      motionDetectionEnabled: true,
      refreshPolicy: { retryDelaysMs: [1_000, 3_000, 7_000] },
    });

    renderWithProviders(
      <CameraLiveViewer {...defaultProps} cameraViewMode="live" preferredTransport="web_rtc" />
    );

    expect(await screen.findByText('Live')).toBeInTheDocument();
    expect(screen.queryByText('Loading camera feed')).not.toBeInTheDocument();
  });

  it('passes the selected feed sizing mode to the fullscreen stream player', async () => {
    getCameraPlaybackPlanMock.mockResolvedValue({
      cameraState: 'streaming',
      snapshotResource: {
        id: 'camera.front_door:snapshot',
        kind: 'image',
        cacheKey: 'camera.front_door:snapshot',
        authStrategy: 'bearer',
        url: String(cameraEntityFixtures.relativeUrl.attributes.entity_picture),
      },
      supportsSnapshot: true,
      liveTransports: ['web_rtc'],
      fallbackTransports: [],
      selectedTransport: 'web_rtc',
      selectedStreamResource: {
        id: 'camera.front_door:direct',
        kind: 'webrtc_stream',
        cacheKey: 'camera.front_door:direct',
        authStrategy: 'none',
        url: 'http://192.168.68.71:1984/stream.html?src=camera_bedroom',
      },
      supportsStreaming: true,
      isSnapshotFallback: false,
      shouldStartWithSnapshot: false,
      motionDetectionEnabled: true,
      refreshPolicy: { retryDelaysMs: [1_000, 3_000, 7_000] },
    });

    renderWithProviders(<CameraLiveViewer {...defaultProps} cameraFitMode="cover" />);

    expect(await screen.findByTestId('camera-stream-player')).toHaveAttribute(
      'data-fit-mode',
      'cover'
    );
  });

  it('lets the viewer change feed sizing from the fullscreen dropdown', async () => {
    const onCameraFitModeChange = vi.fn();
    getCameraPlaybackPlanMock.mockResolvedValue({
      cameraState: 'streaming',
      snapshotResource: {
        id: 'camera.front_door:snapshot',
        kind: 'image',
        cacheKey: 'camera.front_door:snapshot',
        authStrategy: 'none',
        url: String(cameraEntityFixtures.relativeUrl.attributes.entity_picture),
      },
      supportsSnapshot: true,
      liveTransports: ['web_rtc'],
      fallbackTransports: [],
      selectedTransport: 'web_rtc',
      selectedStreamResource: null,
      supportsStreaming: true,
      isSnapshotFallback: false,
      shouldStartWithSnapshot: false,
      motionDetectionEnabled: true,
      refreshPolicy: { retryDelaysMs: [1_000, 3_000, 7_000] },
    });

    renderWithProviders(
      <CameraLiveViewer
        {...defaultProps}
        cameraFitMode="contain"
        onCameraFitModeChange={onCameraFitModeChange}
      />
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Feed sizing: Fit' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Cover' }));

    expect(onCameraFitModeChange).toHaveBeenCalledWith('cover');
  });

  it('uses neutral readiness copy for a cross-origin direct iframe', async () => {
    getCameraPlaybackPlanMock.mockResolvedValue({
      cameraState: 'streaming',
      snapshotResource: {
        id: 'camera.front_door:snapshot',
        kind: 'image',
        cacheKey: 'camera.front_door:snapshot',
        authStrategy: 'bearer',
        url: String(cameraEntityFixtures.relativeUrl.attributes.entity_picture),
      },
      supportsSnapshot: true,
      liveTransports: ['web_rtc'],
      fallbackTransports: [],
      selectedTransport: 'web_rtc',
      selectedStreamResource: {
        id: 'camera.front_door:direct',
        kind: 'webrtc_stream',
        cacheKey: 'camera.front_door:direct',
        authStrategy: 'none',
        url: 'http://192.168.68.71:1984/stream.html?src=camera_bedroom',
        metadata: {
          source: 'direct_stream_url',
        },
      },
      supportsStreaming: true,
      isSnapshotFallback: false,
      shouldStartWithSnapshot: false,
      motionDetectionEnabled: true,
      refreshPolicy: { retryDelaysMs: [1_000, 3_000, 7_000] },
    });

    renderWithProviders(
      <CameraLiveViewer
        {...defaultProps}
        cameraViewMode="live"
        webRtcStreamSource="direct"
        directStreamUrl="http://192.168.68.71:1984/stream.html?src=camera_bedroom"
      />
    );

    expect(await screen.findAllByText('Direct stream')).toHaveLength(2);
    expect(screen.queryByText('Loading camera feed')).not.toBeInTheDocument();
    expect(screen.getAllByText('Live')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Camera view: Live' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Live stream: Auto' })).not.toBeInTheDocument();
  });

  it('renders the provider fallback from one plan when a saved transport is unsupported', async () => {
    getCameraPlaybackPlanMock.mockClear();
    const hlsPlan: PlatformCameraPlaybackModel = {
      cameraState: 'streaming',
      snapshotResource: {
        id: 'camera.front_door:snapshot',
        kind: 'image',
        cacheKey: 'camera.front_door:snapshot',
        authStrategy: 'same_origin',
        url: String(cameraEntityFixtures.relativeUrl.attributes.entity_picture),
      },
      supportsSnapshot: true,
      supportedTransports: ['hls'],
      liveTransports: ['hls'],
      fallbackTransports: [],
      selectedTransport: 'hls',
      selectedStreamResource: {
        id: 'camera.front_door:hls',
        kind: 'hls_stream',
        cacheKey: 'camera.front_door:hls',
        authStrategy: 'same_origin',
        url: '/api/hls/camera.front_door/master.m3u8',
      },
      supportsStreaming: true,
      isSnapshotFallback: false,
      shouldStartWithSnapshot: false,
      motionDetectionEnabled: true,
      refreshPolicy: { retryDelaysMs: [1_000, 3_000, 7_000] },
    };
    getCameraPlaybackPlanMock.mockResolvedValue(hlsPlan);

    renderWithProviders(
      <CameraLiveViewer {...defaultProps} preferredTransport="web_rtc" cameraViewMode="live" />
    );

    expect(await screen.findByTestId('camera-stream-player')).toHaveTextContent(
      'home_assistant:camera.front_door:hls'
    );
    expect(getCameraPlaybackPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredTransport: 'web_rtc',
        webRtcStreamSource: 'provider',
      })
    );
    expect(getCameraPlaybackPlanMock).toHaveBeenCalledTimes(1);
  });
});
