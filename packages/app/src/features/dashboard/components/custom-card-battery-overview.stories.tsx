import { CardEmptyState } from '@navet/app/components/patterns';
import { BaseCard } from '@navet/app/components/primitives';
import { EntityCardHeader } from '@navet/app/components/primitives/entity-card-header';
import { EntityCardHeaderIcon } from '@navet/app/components/primitives/entity-card-header-icon';
import { type CardSize, isCompactCardSize } from '@navet/app/components/shared/card-size-selector';
import { getThemeColorValue } from '@navet/app/components/shared/theme/theme-colors';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useTheme } from '@navet/app/hooks';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import { EntityCardStoryFrame } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Battery, Settings2 } from 'lucide-react';
import { BatteryList, getLevelColor } from './widgets/battery-list';
import dialogMeta, * as dialogStories from './widgets/battery-overview-widget.story-fixtures';

type BatteryOverviewStoryArgs = {
  size: CardSize;
};

const STORY_BATTERIES = [
  { id: 'front-door-sensor', name: 'Front Door Sensor', level: 18 },
  { id: 'kitchen-remote', name: 'Kitchen Remote', level: 42 },
  { id: 'hallway-motion', name: 'Hallway Motion', level: 67 },
  { id: 'ups-backup', name: 'UPS Backup', level: 92 },
] as const;

function BatteryOverviewStoryFrame({ size }: BatteryOverviewStoryArgs) {
  const { theme, primaryColor } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const accentHex = getThemeColorValue(primaryColor);
  const chromeSize = size === 'large' ? 'medium' : size;
  const isCompact = isCompactCardSize(size);

  return (
    <EntityCardStoryFrame size={size}>
      <BaseCard
        size={size}
        fullBleed
        className="transition-all duration-500"
        contentClassName="h-full"
      >
        <div className="relative flex h-full min-w-0 flex-col p-3">
          <EntityCardHeader
            title="Battery Overview"
            subtitle="Widget"
            layout="eyebrow-first"
            size={chromeSize}
            titleClassName={surface.textPrimary}
            subtitleClassName={surface.textMuted}
            leading={<EntityCardHeaderIcon IconComponent={Battery} isActive size={chromeSize} />}
          />
          <BatteryList
            devices={[...STORY_BATTERIES]}
            isCompact={isCompact}
            subtleFill="rgba(255,255,255,0.08)"
            textSecondary={surface.textSecondary}
            emptyStateLabel="No batteries"
            getLevelColor={(level) => getLevelColor(level, accentHex)}
          />
        </div>
      </BaseCard>
    </EntityCardStoryFrame>
  );
}

function BatteryOverviewEmptyStateStory({ size }: BatteryOverviewStoryArgs) {
  const { primaryColor } = useTheme();
  const accentHex = getThemeColorValue(primaryColor);

  return (
    <EntityCardStoryFrame size={size}>
      <BaseCard
        size={size}
        fullBleed
        className="transition-all duration-500"
        contentClassName="h-full"
      >
        <div className="relative z-[2] h-full p-4">
          <CardEmptyState
            title="Battery Overview"
            description="Select battery entities to populate this widget."
            icon={Battery}
            actionLabel="Battery settings"
            actionIcon={Settings2}
            size={size}
            accentColor={accentHex}
          />
        </div>
      </BaseCard>
    </EntityCardStoryFrame>
  );
}

const meta = {
  title: 'Cards/Custom/Battery Overview',
  component: BatteryOverviewStoryFrame,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
    },
  },
  parameters: { docs: { description: {} } },
} satisfies Meta<BatteryOverviewStoryArgs>;

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

type Story = StoryObj<BatteryOverviewStoryArgs>;

export const Playground: Story = {
  args: {
    size: 'large',
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
  render: (args) => <BatteryOverviewEmptyStateStory {...args} />,
  args: {
    size: 'medium',
  },
};

export const Dialog: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.Default,
};
