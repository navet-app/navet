import beachFriendsAvif from '@assets/reference/photo-frame/beach-friends.avif';
import beachFriendsWebp from '@assets/reference/photo-frame/beach-friends.webp';
import cityCafeAvif from '@assets/reference/photo-frame/city-cafe.avif';
import cityCafeWebp from '@assets/reference/photo-frame/city-cafe.webp';
import countryWalkAvif from '@assets/reference/photo-frame/country-walk.avif';
import countryWalkWebp from '@assets/reference/photo-frame/country-walk.webp';
import desertFriendsAvif from '@assets/reference/photo-frame/desert-friends.avif';
import desertFriendsWebp from '@assets/reference/photo-frame/desert-friends.webp';
import nightOutAvif from '@assets/reference/photo-frame/night-out.avif';
import nightOutWebp from '@assets/reference/photo-frame/night-out.webp';
import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { getCardSizeOverlayStyle } from '@navet/app/components/shared/card-size-selector';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PhotoFrameImage } from './widgets/photo-frame-image';
import dialogMeta, * as dialogStories from './widgets/photo-frame-settings-dialog.story-fixtures';
import { PhotoFrameWidget } from './widgets/photo-frame-widget';

type PhotoStoryArgs = {
  size: CardSize;
  shuffleEnabled: boolean;
};

function createStoryPhotoFrameImage(webp: string, avif: string): PhotoFrameImage {
  return {
    src: webp,
    sources: [
      {
        srcSet: avif,
        type: 'image/avif',
      },
      {
        srcSet: webp,
        type: 'image/webp',
      },
    ],
  };
}

const STORY_PHOTO_FRAME_IMAGES: readonly PhotoFrameImage[] = [
  createStoryPhotoFrameImage(countryWalkWebp, countryWalkAvif),
  createStoryPhotoFrameImage(nightOutWebp, nightOutAvif),
  createStoryPhotoFrameImage(desertFriendsWebp, desertFriendsAvif),
  createStoryPhotoFrameImage(cityCafeWebp, cityCafeAvif),
  createStoryPhotoFrameImage(beachFriendsWebp, beachFriendsAvif),
];

function PhotoStoryPreview({ size, shuffleEnabled }: PhotoStoryArgs) {
  return (
    <div style={getCardSizeOverlayStyle(size)}>
      <PhotoFrameWidget
        size={size}
        photoImages={STORY_PHOTO_FRAME_IMAGES}
        shuffleEnabled={shuffleEnabled}
      />
    </div>
  );
}

function PhotoEmptyStatePreview({ size }: Pick<PhotoStoryArgs, 'size'>) {
  return (
    <div style={getCardSizeOverlayStyle(size)}>
      <PhotoFrameWidget
        size={size}
        sourceMode="urls"
        photoUrls={[]}
        photoImages={[]}
        shuffleEnabled={false}
        onUpdateUrls={() => undefined}
        onSourceModeChange={() => undefined}
        onMediaSourceIdChange={() => undefined}
      />
    </div>
  );
}

const meta = {
  title: 'Cards/Custom/Photo',
  component: PhotoStoryPreview,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['small', 'medium', 'large', 'extra-large'],
    },
    shuffleEnabled: {
      control: 'boolean',
    },
  },
  parameters: { docs: { description: {} } },
} satisfies Meta<PhotoStoryArgs>;

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

type Story = StoryObj<PhotoStoryArgs>;

export const Playground: Story = {
  args: {
    size: 'large',
    shuffleEnabled: true,
  },
};

export const Small: Story = {
  args: {
    size: 'small',
    shuffleEnabled: true,
  },
};

export const Medium: Story = {
  args: {
    size: 'medium',
    shuffleEnabled: true,
  },
};

export const Large: Story = {
  args: {
    size: 'large',
    shuffleEnabled: true,
  },
};

export const ExtraLarge: Story = {
  args: {
    size: 'extra-large',
    shuffleEnabled: true,
  },
};

export const EmptyState: Story = {
  render: (args) => <PhotoEmptyStatePreview size={args.size} />,
  args: {
    size: 'large',
    shuffleEnabled: false,
  },
};

export const Dialog: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.Default,
};

export const DialogMobile: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.Mobile,
};
