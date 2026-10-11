import { LightCard } from '@navet/app/features/lighting';
import {
  createPreviewLightEntity,
  createPreviewStoryScenario,
  replacePreviewEntity,
} from '@navet/app/preview/runtime';
import type { PrimaryColor, ThemeMode } from '@navet/app/stores/theme-store';
import { useThemeStore } from '@navet/app/stores/theme-store';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import { EntityCardStoryFrame, noopCardSizeChange } from '@navet/app/storybook/story-frames';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import dialogMeta, * as dialogStories from './light-settings-dialog.story-fixtures';

function LightCardStory(args: Omit<ComponentProps<typeof LightCard>, 'onSizeChange'>) {
  return (
    <EntityCardStoryFrame size={args.size ?? 'medium'}>
      <LightCard {...args} onSizeChange={noopCardSizeChange} />
    </EntityCardStoryFrame>
  );
}

function ThemeAccentDecorator({
  theme,
  primaryColor,
  customPrimaryColor,
  children,
}: {
  theme: ThemeMode;
  primaryColor: PrimaryColor;
  customPrimaryColor?: string | null;
  children: ReactNode;
}) {
  useEffect(() => {
    const previousTheme = useThemeStore.getState();

    useThemeStore.setState({
      ...previousTheme,
      theme,
      followSystemTheme: false,
      primaryColor,
      customPrimaryColor: customPrimaryColor ?? null,
      wallpaper: null,
    });

    return () => {
      useThemeStore.setState(previousTheme);
    };
  }, [customPrimaryColor, primaryColor, theme]);

  return <>{children}</>;
}

function withThemeAccent(
  theme: ThemeMode,
  primaryColor: PrimaryColor,
  customPrimaryColor?: string | null
): Decorator {
  return (Story) => (
    <ThemeAccentDecorator
      theme={theme}
      primaryColor={primaryColor}
      customPrimaryColor={customPrimaryColor}
    >
      <Story />
    </ThemeAccentDecorator>
  );
}

const meta = {
  title: 'Cards/Entity/Light',
  component: LightCardStory,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['extra-small', 'small', 'medium'],
    },
  },
  args: {
    id: 'light.living_room',
    name: 'Living Room',
    room: 'Living Room',
    initialState: true,
    initialBrightness: 64,
    initialTemp: 3900,
    size: 'medium',
    isEditMode: false,
  },
  parameters: { docs: { description: {} } },
} satisfies Meta<typeof LightCardStory>;

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

export const Playground: Story = {
  play: async ({ canvas, userEvent, step }) => {
    const lightCard = canvas.getByRole('button', { name: /^living room$/i });

    await step('shows the light as on initially', async () => {
      await expect(lightCard).toHaveAttribute('aria-pressed', 'true');
    });

    await step('toggles the light off when the card is clicked', async () => {
      await userEvent.click(lightCard);
      await expect(lightCard).toHaveAttribute('aria-pressed', 'false');
    });

    await step('toggles the light back on when clicked again', async () => {
      await userEvent.click(lightCard);
      await expect(lightCard).toHaveAttribute('aria-pressed', 'true');
    });

    await step('supports the primary action with Enter and Space', async () => {
      lightCard.focus();
      await userEvent.keyboard('{Enter}');
      await expect(lightCard).toHaveAttribute('aria-pressed', 'false');
      await userEvent.keyboard(' ');
      await expect(lightCard).toHaveAttribute('aria-pressed', 'true');
    });
  },
};

export const ExtraSmall: Story = {
  args: {
    size: 'extra-small',
  },
};

export const Small: Story = {
  args: {
    size: 'small',
  },
};

export const Medium: Story = {
  args: {
    size: 'medium',
  },
};

export const BlueGlassAccent: Story = {
  decorators: [withThemeAccent('glass', 'blue')],
};

export const PurpleDarkAccent: Story = {
  decorators: [withThemeAccent('dark', 'purple')],
};

export const TealLightAccent: Story = {
  decorators: [withThemeAccent('light', 'teal')],
};

export const OrangeBlackAccent: Story = {
  decorators: [withThemeAccent('black', 'orange')],
};

export const CustomAccent: Story = {
  decorators: [withThemeAccent('glass', 'custom', '#60a5fa')],
};

export const Docs: Story = {
  parameters: {
    docsOnly: true,
  },
};

export const WithEffects: Story = {
  parameters: {
    previewRuntime: {
      scenario: replacePreviewEntity(
        createPreviewStoryScenario(),
        createPreviewLightEntity('light.living_room', {
          supportedColorModes: ['brightness'],
          effect: 'Rainbow',
          effectList: ['Rainbow', 'Fire', 'Twinkle'],
        })
      ),
    },
  },
};

export const PrismClipping: Story = {
  parameters: {
    previewRuntime: {
      scenario: replacePreviewEntity(
        createPreviewStoryScenario(),
        createPreviewLightEntity('light.living_room', {
          supportedColorModes: ['brightness'],
          effect: 'Prism',
          effectList: ['Prism', 'Fire', 'Twinkle'],
        })
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const layer = canvasElement.querySelector<HTMLElement>(
      '[data-light-color-cycle-effect="true"]'
    );
    if (!layer?.parentElement) throw new Error('Expected the Prism color layer.');
    const view = canvasElement.ownerDocument.defaultView;
    if (!view) throw new Error('Expected a browser window.');
    await expect(view.getComputedStyle(layer).borderRadius).toBe(
      view.getComputedStyle(layer.parentElement).borderRadius
    );
  },
};

export const KelvinPicker: Story = {
  ...Medium,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Color Temperature' }));
    const picker = within(canvasElement.ownerDocument.body).getByRole('dialog', {
      name: 'Color Temperature',
    });
    await expect(within(picker).getByRole('slider', { name: 'Color Temperature' })).toBeVisible();
    await userEvent.type(
      within(picker).getByRole('slider', { name: 'Color Temperature' }),
      '{End}'
    );
    await expect(within(picker).getByRole('slider', { name: 'Color Temperature' })).toHaveAttribute(
      'aria-valuenow',
      '6500'
    );
  },
};

export const ColorPicker: Story = {
  ...Medium,
  parameters: {
    previewRuntime: {
      scenario: replacePreviewEntity(
        createPreviewStoryScenario(),
        createPreviewLightEntity('light.living_room', {
          supportedColorModes: ['rgb', 'color_temp'],
          supported_color_modes: ['rgb', 'color_temp'],
        })
      ),
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Choose custom color' })
    );
    const picker = within(canvasElement.ownerDocument.body).getByRole('dialog', {
      name: 'Choose custom color',
    });
    await expect(within(picker).getByRole('slider', { name: 'Hue' })).toBeVisible();
    await expect(within(picker).queryByRole('textbox', { name: 'Hex color' })).toBeNull();
    await userEvent.click(within(picker).getByRole('button', { name: 'Select color #FFA500' }));
    await expect(
      within(picker).getByRole('button', { name: 'Select color #FFA500' })
    ).toHaveAttribute('aria-pressed', 'true');
  },
};

export const Dialog: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.Default,
};

export const DialogOff: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.Off,
};

export const DialogOnOffOnly: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.OnOffOnly,
};

export const DialogWithEffects: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.WithEffects,
};
