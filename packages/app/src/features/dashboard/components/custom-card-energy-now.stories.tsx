import { CardEmptyState } from '@navet/app/components/patterns';
import { BaseCard } from '@navet/app/components/primitives';
import {
  type CardSize,
  getCardSizeOverlayStyle,
} from '@navet/app/components/shared/card-size-selector';
import { useTheme } from '@navet/app/hooks';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Zap } from 'lucide-react';
import { EnergyNowCardView } from '../../energy/components/widgets/energy-now-card-view';
import dialogMeta, * as dialogStories from './widgets/energy-now-dashboard-widget.story-fixtures';

type EnergyNowStoryArgs = {
  size: Extract<CardSize, 'small' | 'medium' | 'large'>;
};

const STORY_TREND = [
  { label: '06:00', value: 310, timestampMs: 1 },
  { label: '09:00', value: 420, timestampMs: 2 },
  { label: '12:00', value: 560, timestampMs: 3 },
  { label: '15:00', value: 690, timestampMs: 4 },
  { label: '18:00', value: 510, timestampMs: 5 },
  { label: '21:00', value: 380, timestampMs: 6 },
] as const;

function EnergyNowStoryFrame({ size }: EnergyNowStoryArgs) {
  const { accentColor } = useTheme();

  return (
    <div style={getCardSizeOverlayStyle(size)}>
      <EnergyNowCardView
        title="Energy today"
        subtitle="Widget"
        currentLoadW={690}
        todayUsageKWh={8.4}
        trend={[...STORY_TREND]}
        accentColor={accentColor}
        size={size}
      />
    </div>
  );
}

function EnergyNowEmptyStateStory({ size }: EnergyNowStoryArgs) {
  const { accentColor } = useTheme();

  return (
    <div style={getCardSizeOverlayStyle(size)}>
      <BaseCard
        size={size}
        fullBleed
        className="transition-all duration-500"
        contentClassName="h-full"
      >
        <div className="relative z-[2] h-full p-4">
          <CardEmptyState
            title="Energy Now"
            description="Select an energy source to populate this widget."
            icon={Zap}
            actionLabel="Energy entities"
            size={size}
            accentColor={accentColor}
          />
        </div>
      </BaseCard>
    </div>
  );
}

const meta = {
  title: 'Cards/Custom/Energy Now',
  component: EnergyNowStoryFrame,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Energy Now custom card. In dark theme, the outer shell should inherit the shared `BaseCard` inactive surface, while the accent remains inside the chart/content rather than tinting the whole card border/background.',
      },
    },
  },
} satisfies Meta<EnergyNowStoryArgs>;

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

type Story = StoryObj<EnergyNowStoryArgs>;

export const Playground: Story = {
  args: {
    size: 'medium',
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

export const Large: Story = {
  args: {
    size: 'large',
  },
};

export const EmptyState: Story = {
  render: (args) => <EnergyNowEmptyStateStory {...args} />,
  args: {
    size: 'medium',
  },
};

export const Dialog: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.Default,
};
