import cameraSampleImageAvif from '@assets/reference/media/camera-sample.avif';
import cameraSampleImageWebp from '@assets/reference/media/camera-sample.webp';
import { CameraCard } from '@navet/app/features/security';
import { createPreviewStoryScenario } from '@navet/app/preview/runtime';
import { type CameraViewMode, useSettingsStore } from '@navet/app/stores/settings-store';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import { EntityCardStoryFrame, noopCardSizeChange } from '@navet/app/storybook/story-frames';
import type { NavetEntity } from '@navet/core/types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';
import { useEffect } from 'react';
import { expect } from 'storybook/test';
import dialogMeta, * as dialogStories from './camera-settings-dialog.story-fixtures';

type CameraCardStoryArgs = Omit<ComponentProps<typeof CameraCard>, 'onSizeChange'> & {
  cameraViewMode?: CameraViewMode;
};

const sampleCameraSources = [
  { srcSet: cameraSampleImageAvif, type: 'image/avif' },
  { srcSet: cameraSampleImageWebp, type: 'image/webp' },
] as const;

function createMotionDetectedCameraScenario() {
  const scenario = createPreviewStoryScenario();
  const externalId = 'binary_sensor.front_door_motion';
  const changedAt = new Date().toISOString();
  const motionEntity: NavetEntity = {
    id: `home_assistant:${externalId}`,
    canonicalId: `home_assistant:${externalId}`,
    providerId: 'home_assistant',
    externalId,
    type: 'sensor',
    name: 'Front Door Motion',
    room: 'Outside',
    primaryState: 'on',
    availability: 'available',
    attributes: {
      value: 'on',
      securityKind: 'motion',
      securitySeverity: 'warning',
      deviceId: 'device-outside-camera',
      room: 'Outside',
    },
    capabilities: ['numeric_sensor'],
    lastUpdated: changedAt,
  };

  return {
    ...scenario,
    id: 'camera-motion-detected',
    entities: [...scenario.entities, motionEntity],
    homeAssistant: {
      ...scenario.homeAssistant,
      entities: {
        ...(scenario.homeAssistant.entities ?? {}),
        [externalId]: {
          entity_id: externalId,
          state: 'on',
          attributes: {
            friendly_name: motionEntity.name,
            ...motionEntity.attributes,
          },
          last_changed: changedAt,
          last_updated: changedAt,
          context: { id: 'story-motion', parent_id: null, user_id: null },
        },
      },
      entityRegistry: [
        ...scenario.homeAssistant.entityRegistry,
        {
          entity_id: externalId,
          device_id: 'device-outside-camera',
          area_id: 'outside',
        },
      ],
    },
  };
}

function CameraCardStory({ cameraViewMode = 'snapshot', ...args }: CameraCardStoryArgs) {
  useEffect(() => {
    useSettingsStore.getState().updateCameraViewMode(args.id, cameraViewMode);
  }, [args.id, cameraViewMode]);

  return (
    <EntityCardStoryFrame size={args.size ?? 'medium'}>
      <CameraCard {...args} onSizeChange={noopCardSizeChange} />
    </EntityCardStoryFrame>
  );
}

const meta = {
  title: 'Cards/Entity/Camera',
  component: CameraCardStory,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['medium', 'large', 'extra-large'],
    },
  },
  args: {
    id: 'camera.front_door',
    name: 'Front Door Cam',
    room: 'Entrance',
    entityPicture: cameraSampleImageWebp,
    entityPictureSources: sampleCameraSources,
    supportedFeatures: 2,
    isStreamCapable: true,
    cameraViewMode: 'snapshot',
    size: 'medium',
    isEditMode: false,
  },
  parameters: { docs: { description: {} } },
} satisfies Meta<typeof CameraCardStory>;

const richComponentDocsDescription = getStoryDocsDescription(meta.title);

meta.parameters = {
  ...meta.parameters,
  docs: {
    ...meta.parameters?.docs,
    description: {
      ...meta.parameters?.docs?.description,
      component: richComponentDocsDescription,
    },
  },
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Medium: Story = {
  args: {
    size: 'medium',
  },
};

export const Large: Story = {
  args: {
    size: 'large',
  },
};

export const ExtraLarge: Story = {
  args: {
    size: 'extra-large',
  },
};

export const LiveStream: Story = {
  args: {
    entityPicture: cameraSampleImageWebp,
    entityPictureSources: sampleCameraSources,
    cameraViewMode: 'live',
    isStreamCapable: true,
  },
};

export const AutoSnapshot: Story = {
  args: {
    entityPicture: cameraSampleImageWebp,
    entityPictureSources: sampleCameraSources,
    cameraViewMode: 'auto',
    isStreamCapable: true,
  },
};

export const MotionDetected: Story = {
  args: {
    cameraViewMode: 'snapshot',
  },
  parameters: {
    previewRuntime: {
      scenario: createMotionDetectedCameraScenario(),
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.findByText('Motion')).resolves.toBeVisible();
  },
};

export const SnapshotOnly: Story = {
  args: {
    id: 'camera.l10s_ultra_gen_2_map',
    name: 'L10s Ultra Gen 2 Current Map',
    room: 'Utility',
    supportedFeatures: 0,
    isStreamCapable: false,
    cameraViewMode: 'snapshot',
  },
};

export const StreamFallback: Story = {
  args: {
    id: 'camera.garage',
    name: 'Garage Cam',
    room: 'Garage',
    entityPicture: cameraSampleImageWebp,
    entityPictureSources: sampleCameraSources,
    cameraViewMode: 'live',
    isStreamCapable: false,
  },
};

export const Unavailable: Story = {
  args: {
    id: 'camera.garden',
    name: 'Garden Cam',
    room: 'Garden',
    entityPicture: undefined,
  },
};

export const LongCameraName: Story = {
  args: {
    id: 'camera.south_driveway',
    name: 'South Driveway and Package Drop Camera',
    room: 'Front garden',
    cameraViewMode: 'snapshot',
  },
};

export const Docs: Story = {
  parameters: {
    docsOnly: true,
  },
};

export const Dialog: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.Default,
  args: { ...dialogMeta.args, ...dialogStories.Default.args },
};

export const DialogProviderMse: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.ProviderMse,
  args: { ...dialogMeta.args, ...dialogStories.ProviderMse.args },
};

export const DialogLongCameraName: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.LongCameraName,
  args: { ...dialogMeta.args, ...dialogStories.LongCameraName.args },
};

export const DialogDirectStream: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.DirectStream,
  args: { ...dialogMeta.args, ...dialogStories.DirectStream.args },
};

export const DialogSnapshotOnlyWithDirectStream: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.SnapshotOnlyWithDirectStream,
  args: { ...dialogMeta.args, ...dialogStories.SnapshotOnlyWithDirectStream.args },
};
