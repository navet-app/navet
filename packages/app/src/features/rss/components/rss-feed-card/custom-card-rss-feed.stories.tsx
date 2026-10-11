import storyWeatherImage from '@assets/reference/photo-frame/beach-friends.webp';
import storyEnergyImage from '@assets/reference/photo-frame/city-cafe.webp';
import storyHomeImage from '@assets/reference/photo-frame/country-walk.webp';
import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { useTheme } from '@navet/app/hooks';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import { buildCustomCard, CustomWidgetStoryFrame } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import dialogMeta, * as dialogStories from './settings-dialog.story-fixtures';
import type { RSSItem, RSSProvider } from './types';
import { RSSFeedCardView } from './view';

const STORY_PROVIDER: RSSProvider = {
  id: 'bbc-world',
  name: 'BBC World',
  type: 'url',
  feedUrl: 'https://feeds.bbci.co.uk/news/rss.xml',
  demoItems: [
    {
      id: 'bbc-demo-1',
      title: 'Energy dashboard highlights evening demand peak',
      source: 'BBC World',
      timeAgo: '12 min ago',
      url: 'https://www.bbc.com/news',
      excerpt:
        'A practical view of home energy demand helps households shift flexible loads away from the evening peak.',
      imageUrl: storyEnergyImage,
      publishedAtMs: Date.UTC(2026, 4, 16, 18, 40),
    },
    {
      id: 'bbc-demo-2',
      title: 'Smart home controls move toward calmer shared screens',
      source: 'BBC World',
      timeAgo: '28 min ago',
      url: 'https://www.bbc.com/news',
      excerpt:
        'Dashboard-first interfaces are focusing on clarity, glanceability, and fewer interruptions for family spaces.',
      imageUrl: storyHomeImage,
      publishedAtMs: Date.UTC(2026, 4, 16, 18, 24),
    },
    {
      id: 'bbc-demo-3',
      title: 'Weather systems bring cooler nights across southern Sweden',
      source: 'BBC World',
      timeAgo: '1 hr ago',
      url: 'https://www.bbc.com/weather',
      excerpt:
        'A cooler overnight pattern is expected to reduce air-conditioning demand and keep bedrooms more comfortable.',
      imageUrl: storyWeatherImage,
      publishedAtMs: Date.UTC(2026, 4, 16, 17, 48),
    },
  ] satisfies RSSItem[],
};

function RSSFeedStory({ size = 'large', tintColor }: { size?: CardSize; tintColor?: string }) {
  return (
    <CustomWidgetStoryFrame
      card={buildCustomCard('rss', size, {
        tintColor,
        articleCount: 4,
        customProviders: [STORY_PROVIDER],
        selectedProviderIds: [STORY_PROVIDER.id],
      })}
    />
  );
}

function RSSEmptyStory({
  size = 'medium',
  variant = 'no-selection',
}: {
  size?: CardSize;
  variant?: 'no-providers' | 'no-selection' | 'no-articles';
}) {
  const { theme, accentColor } = useTheme();

  return (
    <div style={{ width: size === 'small' ? 160 : 320, height: size === 'large' ? 320 : 160 }}>
      <RSSFeedCardView
        size={size}
        theme={theme}
        accentColor={accentColor}
        tintColor="#3b82f6"
        isSmall={size === 'small'}
        isMedium={size === 'medium'}
        latestArticle={null}
        items={[]}
        selectedProviders={[]}
        activeProviderId="all"
        onActiveProviderChange={() => {}}
        handleArticleClick={() => {}}
        isLoading={false}
        error={null}
        hasConfiguredProviders={variant !== 'no-providers'}
        hasSelectedProviders={variant !== 'no-providers' && variant !== 'no-selection'}
        onOpenSettings={() => {}}
      />
    </div>
  );
}

const meta = {
  title: 'Cards/Custom/RSS Feed',
  component: RSSFeedStory,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['small', 'medium', 'large'],
    },
    tintColor: {
      control: 'color',
    },
  },
  args: {
    size: 'large',
  },
  parameters: {
    docs: {
      description: {
        component: 'Custom RSS Feed card rendered through the dashboard widget card runtime.',
      },
    },
  },
} satisfies Meta<typeof RSSFeedStory>;

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

export const Large: Story = {
  args: {
    size: 'large',
  },
};

export const EmptyNoProviders: Story = {
  render: () => <RSSEmptyStory size="medium" variant="no-providers" />,
};

export const EmptyNoSelection: Story = {
  render: () => <RSSEmptyStory size="medium" variant="no-selection" />,
};

export const EmptyNoArticles: Story = {
  render: () => <RSSEmptyStory size="large" variant="no-articles" />,
};

export const Dialog: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.Default,
};

export const DialogOverflowNavigation: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.OverflowNavigation,
};

export const DialogMobileOverflowNavigation: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.MobileOverflowNavigation,
};

export const DialogEmptyFeedSetup: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.EmptyFeedSetup,
};
