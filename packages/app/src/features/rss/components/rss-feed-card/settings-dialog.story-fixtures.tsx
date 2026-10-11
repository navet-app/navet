import { Button } from '@navet/app/components/primitives/button';
import { useTheme } from '@navet/app/hooks';
import { SettingsDialogStoryFrame } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, within } from 'storybook/test';
import { RSSFeedSettingsDialog } from './settings-dialog';
import type { RSSProvider } from './types';

function RSSFeedSettingsDialogStory({ empty = false }: { empty?: boolean }) {
  const { theme } = useTheme();
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>(['bbc-world']);
  const [articleCount, setArticleCount] = useState(6);
  const [tintColor, setTintColor] = useState<string | undefined>('#06b6d4');
  const [isOpen, setIsOpen] = useState(false);
  const [roomValue, setRoomValue] = useState('living-room');

  const providers: RSSProvider[] = [
    {
      id: 'bbc-world',
      name: 'BBC World',
      type: 'url',
      feedUrl: 'https://feeds.bbci.co.uk/news/rss.xml',
    },
  ];

  return (
    <SettingsDialogStoryFrame parentCardClassName="bg-[linear-gradient(180deg,rgba(6,182,212,0.22),rgba(15,23,42,0.3))]">
      <div className="relative flex items-start justify-center p-6">
        <Button variant="secondary" onClick={() => setIsOpen(true)}>
          Open RSS feed dialog
        </Button>
      </div>
      <RSSFeedSettingsDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Daily Feed"
        roomValue={roomValue}
        roomLabel={roomValue === 'living-room' ? 'Living Room' : 'Kitchen'}
        roomOptions={[
          { value: 'living-room', label: 'Living Room' },
          { value: 'kitchen', label: 'Kitchen' },
        ]}
        theme={theme}
        primaryColorValue="#06b6d4"
        providers={empty ? [] : providers}
        selectedProviderIds={selectedProviderIds}
        onSelectedProviderIdsChange={setSelectedProviderIds}
        onAddProvider={() => true}
        onRemoveProvider={() => {}}
        articleCount={articleCount}
        onArticleCountChange={setArticleCount}
        onRoomChange={setRoomValue}
        tintColor={tintColor}
        onTintColorChange={setTintColor}
      />
    </SettingsDialogStoryFrame>
  );
}

const meta = {
  component: RSSFeedSettingsDialogStory,
  render: () => <RSSFeedSettingsDialogStory />,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof RSSFeedSettingsDialogStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OverflowNavigation: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open RSS feed dialog' }));
    const dialog = within(await within(document.body).findByRole('dialog'));
    await expect(dialog.getByRole('checkbox', { name: /BBC World/ })).toBeVisible();
    await expect(dialog.queryByRole('button', { name: 'Add feed' })).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: 'More actions' }));
    await userEvent.click(within(document.body).getByRole('menuitem', { name: 'Add feed' }));
    await expect(dialog.getByRole('textbox', { name: /name/i })).toBeVisible();
    await userEvent.click(dialog.getByRole('button', { name: 'Back to controls' }));
    await expect(dialog.getByRole('checkbox', { name: /BBC World/ })).toBeVisible();
    await userEvent.click(dialog.getByRole('button', { name: 'More actions' }));
    await userEvent.click(within(document.body).getByRole('menuitem', { name: 'Customize' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Open RSS feed dialog' }));
    await expect(
      within(await within(document.body).findByRole('dialog')).getByRole('checkbox', {
        name: /BBC World/,
      })
    ).toBeVisible();
  },
};
export const MobileOverflowNavigation: Story = {
  ...OverflowNavigation,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
export const EmptyFeedSetup: Story = {
  render: () => <RSSFeedSettingsDialogStory empty />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open RSS feed dialog' }));
    const dialog = within(await within(document.body).findByRole('dialog'));
    await expect(dialog.getByRole('textbox', { name: /name/i })).toBeVisible();
    await expect(
      dialog.queryByRole('button', { name: 'Back to controls' })
    ).not.toBeInTheDocument();
  },
};
