import { Button } from '@navet/app/components/primitives/button';
import { PHOTO_FRAME_DEMO_URLS } from '@navet/app/demo/photo-frame-demo-images';
import { SettingsDialogStoryFrame } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, within } from 'storybook/test';
import { PhotoFrameSettingsDialog } from './photo-frame-settings-dialog';
import type { PhotoFrameSourceMode } from './photo-frame-types';

function PhotoFrameSettingsDialogStory() {
  const [isOpen, setIsOpen] = useState(false);
  const [roomValue, setRoomValue] = useState('__home__');
  const [sourceMode, setSourceMode] = useState<PhotoFrameSourceMode>('urls');
  const [photoUrls, setPhotoUrls] = useState([...PHOTO_FRAME_DEMO_URLS.slice(0, 2)]);
  const [mediaSourceId, setMediaSourceId] = useState('media-source://media_source/local/photos');
  const [shuffleEnabled, setShuffleEnabled] = useState(true);
  const [tintColor, setTintColor] = useState<string | undefined>('#f97316');

  return (
    <SettingsDialogStoryFrame parentCardClassName="bg-[linear-gradient(180deg,rgba(249,115,22,0.18),rgba(15,23,42,0.28))]">
      <div className="relative flex items-start justify-center p-6">
        <Button variant="secondary" onClick={() => setIsOpen(true)}>
          Open photo dialog
        </Button>
      </div>
      <PhotoFrameSettingsDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        roomValue={roomValue}
        roomLabel={roomValue === '__home__' ? 'Home' : roomValue}
        roomOptions={[
          { label: 'Home', value: '__home__' },
          { label: 'Bedroom', value: 'Bedroom' },
          { label: 'Living Room', value: 'Living Room' },
        ]}
        onRoomChange={setRoomValue}
        sourceMode={sourceMode}
        onSourceModeChange={setSourceMode}
        photoUrls={photoUrls}
        onUpdateUrls={setPhotoUrls}
        mediaSourceId={mediaSourceId}
        onMediaSourceIdChange={setMediaSourceId}
        shuffleEnabled={shuffleEnabled}
        onShuffleEnabledChange={setShuffleEnabled}
        tintColor={tintColor}
        onTintColorChange={setTintColor}
      />
    </SettingsDialogStoryFrame>
  );
}

const meta = {
  component: PhotoFrameSettingsDialogStory,
  render: () => <PhotoFrameSettingsDialogStory />,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PhotoFrameSettingsDialogStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open photo dialog' }));
    const dialog = within(await within(document.body).findByRole('dialog'));
    await expect(dialog.getByRole('button', { name: 'Add URL' })).toBeVisible();
    await expect(dialog.queryByRole('button', { name: 'Customize' })).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: 'More actions' }));
    await userEvent.click(within(document.body).getByRole('menuitem', { name: 'Customize' }));
    await expect(dialog.getByRole('button', { name: 'Back to controls' })).toBeVisible();
    await userEvent.click(dialog.getByRole('button', { name: 'Back to controls' }));
    await expect(dialog.getByRole('button', { name: 'Add URL' })).toBeVisible();
  },
};
export const Mobile: Story = {
  ...Default,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
