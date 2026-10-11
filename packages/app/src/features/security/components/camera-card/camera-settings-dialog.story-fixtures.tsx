import { Button } from '@navet/app/components/primitives/button';
import type { PlatformEntitySnapshot } from '@navet/app/platform/provider-feature-models';
import { SettingsDialogStoryFrame } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { CameraSettingsDialog, type SiblingEntity } from './camera-settings-dialog';

function siblingEntity(
  entityId: string,
  state: string,
  attributes: Record<string, unknown>
): PlatformEntitySnapshot {
  return {
    entityId,
    state,
    attributes,
  };
}

const siblingEntities: SiblingEntity[] = [
  {
    id: 'switch.camera_motion_detection',
    entity: siblingEntity('switch.camera_motion_detection', 'on', {
      friendly_name: 'Motion Detection',
    }),
  },
  {
    id: 'select.camera_ir_mode',
    entity: siblingEntity('select.camera_ir_mode', 'auto', {
      friendly_name: 'IR Mode',
      options: ['off', 'auto', 'on'],
    }),
  },
  {
    id: 'number.camera_brightness',
    entity: siblingEntity('number.camera_brightness', '55', {
      friendly_name: 'Image Brightness',
      min: 0,
      max: 100,
      step: 1,
    }),
  },
];

function CameraSettingsDialogStory(
  args: Omit<ComponentProps<typeof CameraSettingsDialog>, 'isOpen' | 'onOpenChange'>
) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <SettingsDialogStoryFrame parentCardClassName="bg-[linear-gradient(180deg,rgba(59,130,246,0.2),rgba(15,23,42,0.28))]">
      <div className="relative flex items-start justify-center p-6">
        <Button variant="secondary" onClick={() => setIsOpen(true)}>
          Open camera dialog
        </Button>
      </div>
      <CameraSettingsDialog {...args} isOpen={isOpen} onOpenChange={setIsOpen} />
    </SettingsDialogStoryFrame>
  );
}

const meta = {
  component: CameraSettingsDialogStory,
  render: (args) => <CameraSettingsDialogStory {...args} />,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    entityId: 'camera.front_door',
    name: 'Front Door Camera',
    siblingEntities,
    cameraViewMode: 'live',
    cameraStreamPreference: 'auto',
    cameraWebRtcStreamSource: 'provider',
    cameraDirectStreamUrl: '',
    cameraDirectStreamUrlError: false,
    cameraFitMode: 'cover',
    fullscreenHiddenAccessoryIds: [],
    supportedStreamPreferences: ['web_rtc', 'mse', 'hls', 'mjpeg'],
    supportsStreaming: true,
    hasSnapshot: true,
    lowPowerMode: false,
    onCameraViewModeChange: () => undefined,
    onCameraStreamPreferenceChange: () => undefined,
    onCameraWebRtcStreamSourceChange: () => undefined,
    onCameraDirectStreamUrlChange: () => undefined,
    onCameraFitModeChange: () => undefined,
    onFullscreenAccessoryVisibilityChange: () => undefined,
  },
} satisfies Meta<typeof CameraSettingsDialogStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ProviderMse: Story = {
  args: {
    cameraWebRtcStreamSource: 'provider',
    cameraStreamPreference: 'mse',
  },
};

export const LongCameraName: Story = {
  args: {
    name: 'AXIS P3407-VE Dome Camera',
  },
};

export const DirectStream: Story = {
  args: {
    cameraWebRtcStreamSource: 'direct',
    cameraDirectStreamUrl: 'http://homeassistant.local:1984/stream.html?src=front_door',
  },
};

export const SnapshotOnlyWithDirectStream: Story = {
  args: {
    cameraViewMode: 'snapshot',
    supportedStreamPreferences: [],
    supportsStreaming: false,
    cameraWebRtcStreamSource: 'direct',
    cameraDirectStreamUrl: 'http://homeassistant.local:1984/stream.html?src=garage',
  },
};
