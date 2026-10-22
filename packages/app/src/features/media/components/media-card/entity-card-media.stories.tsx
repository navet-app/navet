import artworksOriginal from '@assets/reference/media/artworks-original.avif';
import { EMPTY_NAVET_MEDIA_CAPABILITIES } from '@navet/app/core/navet-device-state';
import { MediaCard } from '@navet/app/features/media';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import { EntityCardStoryFrame, noopCardSizeChange } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';
import { expect, within } from 'storybook/test';

function MediaCardStory(args: Omit<ComponentProps<typeof MediaCard>, 'onSizeChange'>) {
  return (
    <EntityCardStoryFrame size={args.size ?? 'medium'}>
      <MediaCard {...args} onSizeChange={noopCardSizeChange} />
    </EntityCardStoryFrame>
  );
}

const meta = {
  title: 'Cards/Entity/Media',
  component: MediaCardStory,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['small', 'medium', 'medium-vertical', 'large'],
    },
  },
  args: {
    id: 'media_player.living_room_speaker',
    name: 'Living Room Speaker',
    room: 'Living Room',
    title: 'Smells Like Teen Spirit',
    artist: 'Nirvana',
    entityType: 'Speaker',
    entityPicture: artworksOriginal,
    state: 'playing',
    volume: 42,
    isMuted: false,
    elapsedSeconds: 86,
    durationSeconds: 243,
    positionUpdatedAt: new Date().toISOString(),
    supportsGrouping: true,
    groupMembers: ['Kitchen Speaker'],
    size: 'medium',
    isEditMode: false,
  },
  parameters: { docs: { description: {} } },
} satisfies Meta<typeof MediaCardStory>;

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

export const Speaker: Story = {
  args: {
    size: 'medium',
  },
};

export const SpeakerIdle: Story = {
  args: {
    id: 'media_player.story_idle_speaker',
    name: 'Idle Speaker',
    room: 'Living Room',
    entityPicture: '',
    state: 'idle',
    title: 'Living Room',
    artist: 'Ready to play',
    elapsedSeconds: 0,
    durationSeconds: 0,
    positionUpdatedAt: undefined,
    size: 'medium',
  },
};

export const SpeakerDialog: Story = {
  args: {
    size: 'medium',
  },
  play: async ({ canvas, userEvent, step }) => {
    await step('opens the media details dialog', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /open media details/i }));
      // Dialog is lazy-loaded inside Suspense; wait for chunk + Radix portal mount.
      const dialog = await within(document.body).findByRole('dialog', {}, { timeout: 5000 });
      await expect(dialog).toBeInTheDocument();
      const inDialog = within(dialog);
      await expect(
        inDialog.getByRole('img', { name: /smells like teen spirit/i })
      ).toBeInTheDocument();
      await expect(inDialog.getByRole('button', { name: /pause playback/i })).toBeInTheDocument();
    });
  },
};

export const UnsupportedPlaybackOptions: Story = {
  ...SpeakerDialog,
  args: {
    ...SpeakerDialog.args,
    id: 'media_player.story_unsupportedplaybackoptions',
    mediaCapabilities: {
      ...EMPTY_NAVET_MEDIA_CAPABILITIES,
      canPlay: true,
      canPause: true,
      canShuffle: false,
      canRepeat: false,
    },
  },
  play: async (context) => {
    await SpeakerDialog.play?.(context);
    const dialog = within(document.body).getByRole('dialog');
    const controls = within(dialog);
    await expect(
      Boolean(controls.queryByRole('button', { name: /shuffle|linear playback/i }))
    ).toBe(false);
    await expect(Boolean(controls.queryByRole('button', { name: /repeat off/i }))).toBe(false);
  },
};

export const ShuffleOnly: Story = {
  ...SpeakerDialog,
  args: {
    ...SpeakerDialog.args,
    id: 'media_player.story_shuffleonly',
    mediaCapabilities: {
      ...EMPTY_NAVET_MEDIA_CAPABILITIES,
      canPlay: true,
      canPause: true,
      canShuffle: true,
      canRepeat: false,
    },
  },
  play: async (context) => {
    await SpeakerDialog.play?.(context);
    const dialog = within(document.body).getByRole('dialog');
    const controls = within(dialog);
    await expect(
      Boolean(controls.queryByRole('button', { name: /shuffle|linear playback/i }))
    ).toBe(true);
    await expect(Boolean(controls.queryByRole('button', { name: /repeat off/i }))).toBe(false);
  },
};

export const RepeatOnly: Story = {
  ...SpeakerDialog,
  args: {
    ...SpeakerDialog.args,
    id: 'media_player.story_repeatonly',
    mediaCapabilities: {
      ...EMPTY_NAVET_MEDIA_CAPABILITIES,
      canPlay: true,
      canPause: true,
      canShuffle: false,
      canRepeat: true,
    },
  },
  play: async (context) => {
    await SpeakerDialog.play?.(context);
    const dialog = within(document.body).getByRole('dialog');
    const controls = within(dialog);
    await expect(
      Boolean(controls.queryByRole('button', { name: /shuffle|linear playback/i }))
    ).toBe(false);
    await expect(Boolean(controls.queryByRole('button', { name: /repeat off/i }))).toBe(true);
  },
};

export const FullPlaybackOptions: Story = {
  ...SpeakerDialog,
  args: {
    ...SpeakerDialog.args,
    id: 'media_player.story_fullplaybackoptions',
    mediaCapabilities: {
      ...EMPTY_NAVET_MEDIA_CAPABILITIES,
      canPlay: true,
      canPause: true,
      canShuffle: true,
      canRepeat: true,
    },
  },
  play: async (context) => {
    await SpeakerDialog.play?.(context);
    const dialog = within(document.body).getByRole('dialog');
    const controls = within(dialog);
    await expect(
      Boolean(controls.queryByRole('button', { name: /shuffle|linear playback/i }))
    ).toBe(true);
    await expect(Boolean(controls.queryByRole('button', { name: /repeat off/i }))).toBe(true);
  },
};

export const SpeakerBrightArtworkDialog: Story = {
  ...SpeakerDialog,
  args: {
    ...SpeakerDialog.args,
    id: 'media_player.bright_artwork',
    title: 'Bright artwork contrast preview',
    artist: 'Example artist',
    entityPicture: `data:image/svg+xml,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="#c6cee5"/><text x="160" y="235" text-anchor="middle" font-size="240" fill="white">♪</text></svg>'
    )}`,
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: /open media details/i }));
    const dialog = await within(document.body).findByRole('dialog', {}, { timeout: 5000 });
    await expect(within(dialog).getByRole('img')).toBeInTheDocument();
    await expect(
      within(dialog).getByRole('button', { name: /pause playback/i })
    ).toBeInTheDocument();
  },
};

export const SpeakerCompact: Story = {
  args: {
    size: 'small',
  },
};

export const SpeakerMediumVertical: Story = {
  args: {
    size: 'medium-vertical',
  },
};

export const SpeakerLarge: Story = {
  args: {
    size: 'large',
  },
};

const tvCardStoryArgs = {
  id: 'media_player.living_room_tv',
  name: 'Living Room TV',
  room: 'Living Room',
  title: 'Samsung TV Plus',
  artist: 'Live',
  entityType: 'TV',
  mediaCapabilities: {
    ...EMPTY_NAVET_MEDIA_CAPABILITIES,
    canSetVolume: true,
    canMuteVolume: true,
    canSelectSource: true,
  },
  deviceClass: 'tv',
  source: 'Samsung TV Plus',
  sourceList: ['TV', 'HDMI 1', 'HDMI 2', 'Apple TV'],
  entityPicture: undefined,
  state: 'idle' as const,
  volume: 18,
  isMuted: false,
  elapsedSeconds: undefined,
  durationSeconds: undefined,
  positionUpdatedAt: undefined,
  supportsGrouping: false,
  groupMembers: [] as string[],
  /** Storybook has no HA `remote.*` entity; enable TV D-pad / channel styling as in a live dashboard */
  simulateTvRemote: true,
} satisfies Partial<Omit<ComponentProps<typeof MediaCard>, 'onSizeChange' | 'isEditMode'>>;

/** Browser regression: visible control targets remain distinct and reachable. */
async function verifyTvTargets(root: HTMLElement) {
  const visibleRect = (button: HTMLElement) => {
    const r = button.getBoundingClientRect();
    const visible = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    for (let parent = button.parentElement; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent);
      const bounds = parent.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(css.overflowX)) {
        visible.left = Math.max(visible.left, bounds.left);
        visible.right = Math.min(visible.right, bounds.right);
      }
      if (/auto|scroll|hidden|clip/.test(css.overflowY)) {
        visible.top = Math.max(visible.top, bounds.top);
        visible.bottom = Math.min(visible.bottom, bounds.bottom);
      }
    }
    return visible;
  };

  const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')].filter(
    (button) => !button.classList.contains('inset-0')
  );
  for (const button of buttons) {
    button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
    const r = button.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    await expect(button.contains(hit), `${button.ariaLabel} remains reachable`).toBe(true);
    const rectangles = buttons.map((item) => ({ item, rect: visibleRect(item) }));
    for (let i = 0; i < rectangles.length; i++) {
      for (let j = i + 1; j < rectangles.length; j++) {
        const a = rectangles[i];
        const b = rectangles[j];
        const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        await expect(
          x <= 0.5 || y <= 0.5,
          `${a.item.ariaLabel} and ${b.item.ariaLabel} do not overlap`
        ).toBe(true);
      }
    }
  }
}

/** Widescreen TV: D-pad overlays top-right; volume/channel + action row share the fixed 104×104 pad size. */
export const TV: Story = {
  args: {
    ...tvCardStoryArgs,
    size: 'medium',
  },
  play: async ({ canvasElement, canvas }) => {
    await verifyTvTargets(canvasElement);
    const root = canvasElement.querySelector<HTMLElement>('[data-tv-card-root]');
    const source = root?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
    const settings = canvas.getByRole('button', { name: 'More actions' });
    if (!root || !source?.parentElement)
      throw new Error('Expected TV controls and source selector');
    const sourceRect = source.getBoundingClientRect();
    const settingsRect = settings.getBoundingClientRect();
    const gap = Number.parseFloat(getComputedStyle(source.parentElement).columnGap);
    await expect(
      Math.abs(settingsRect.right - root.getBoundingClientRect().right)
    ).toBeLessThanOrEqual(0.5);
    await expect(Math.abs(sourceRect.right + gap - settingsRect.left)).toBeLessThanOrEqual(0.5);
  },
  parameters: {
    docs: {
      description: {
        story:
          'Medium TV card: volume +/− in the first column, channel +/− in the second, compact navigation/playback beside them, and the existing D-pad at top right. Source/settings stay beneath the D-pad.',
      },
    },
  },
};

export const TVLongName: Story = {
  args: {
    ...tvCardStoryArgs,
    name: 'Samsung The Frame 65 QE65LS03AAUXXC',
    size: 'medium',
  },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas }) => {
    const title = canvas.getByText('Samsung The Frame 65 QE65LS03AAUXXC');
    const selectButton = canvas.getByRole('button', { name: /^select$/i });
    const dpad = selectButton.closest<HTMLElement>('.relative.shrink-0');

    await expect(dpad).not.toBeNull();
    await expect(title.getBoundingClientRect().right).toBeLessThanOrEqual(
      dpad?.getBoundingClientRect().left ?? 0
    );
  },
};

/** Small TV: header gamepad toggles the D-pad; settings stays bottom-right while the pad is open. */
export const TVSmall: Story = {
  args: {
    ...tvCardStoryArgs,
    size: 'small',
    source: 'Source',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Small TV card: separate volume and channel toggles reveal a single compact control row. Settings is always visible; navigation, playback and source selection remain in the TV dialog.',
      },
    },
  },
  play: async ({ canvas, canvasElement, userEvent, step }) => {
    await verifyTvTargets(canvasElement);
    await step('toggle volume and channels with settings always available', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Volume controls' }));
      await expect(canvas.getByRole('button', { name: 'Mute volume' })).toBeInTheDocument();
      await verifyTvTargets(canvasElement);
      await userEvent.keyboard('{Escape}');
      await userEvent.click(canvas.getByRole('button', { name: 'Channel controls' }));
      await expect(canvas.queryByRole('button', { name: 'Mute volume' })).not.toBeInTheDocument();
      await expect(canvas.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
      await verifyTvTargets(canvasElement);
      await userEvent.keyboard('{Escape}');
    });
  },
};

/** Tall TV: D-pad in document flow under the header (left), then volume/channel and actions. */
export const TVMediumVertical: Story = {
  args: {
    ...tvCardStoryArgs,
    size: 'medium-vertical',
    source: 'Source',
  },
  play: async ({ canvasElement, canvas }) => {
    await verifyTvTargets(canvasElement);
    const root = canvasElement.querySelector<HTMLElement>('[data-tv-card-root]');
    if (!root) throw new Error('Expected tall TV card');
    await expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight);
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
    const volume = canvas.getByRole('button', { name: 'Volume up' }).getBoundingClientRect();
    const channel = canvas.getByRole('button', { name: 'Channel up' }).getBoundingClientRect();
    const menu = canvas.getByRole('button', { name: 'Menu' }).getBoundingClientRect();
    const playback = canvas
      .getByRole('button', { name: /pause playback|resume playback/i })
      .getBoundingClientRect();
    await expect(Math.abs(volume.left - menu.left)).toBeLessThanOrEqual(0.5);
    await expect(Math.abs(channel.left - playback.left)).toBeLessThanOrEqual(0.5);
  },
  parameters: {
    docs: {
      description: {
        story:
          'Tall TV card: volume and channel buttons occupy the four corners around the existing D-pad. Mute joins playback/navigation below; source and settings stay at the bottom. The controls fit without scrolling.',
      },
    },
  },
};

/** Large TV: same inline D-pad placement and footprint as vertical medium. */
export const TVLarge: Story = {
  args: {
    ...tvCardStoryArgs,
    size: 'large',
    source: 'Source',
  },
  play: async ({ canvasElement }) => verifyTvTargets(canvasElement),
  parameters: {
    docs: {
      description: {
        story:
          'Large TV card: the existing 136×136 D-pad remains under the header; volume +/− sits to the left of the D-pad and channel +/− to the right. The action row stays below, with contained scrolling when needed.',
      },
    },
  },
};

export const Docs: Story = {
  parameters: {
    docsOnly: true,
  },
};
