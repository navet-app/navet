import { CardEmptyState } from '@navet/app/components/patterns';
import { BaseCard, EntityCardHeader, EntityCardHeaderIcon } from '@navet/app/components/primitives';
import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { getCardReadableTextTokens } from '@navet/app/components/shared/theme/card-readable-text-tokens';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import type { SensorReading } from '@navet/app/features/sensors/components/sensors/sensor-types';
import { SmallSensorDisplay } from '@navet/app/features/sensors/components/sensors/small-sensor-display';
import { useTheme } from '@navet/app/hooks';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import { EntityCardStoryFrame } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { BatteryCharging } from 'lucide-react';
import { getUpsStatusTone } from './widgets/ups-widget-data';

type UpsStoryArgs = {
  size: CardSize;
  status: 'OL' | 'OB' | 'LB' | 'unavailable';
};

function getStatusLabel(status: UpsStoryArgs['status']) {
  switch (status) {
    case 'OL':
      return 'OL';
    case 'OB':
      return 'On Battery';
    case 'LB':
      return 'Low Battery';
    default:
      return 'Unavailable';
  }
}

function UpsStoryFrame({ size, status }: UpsStoryArgs) {
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const readableText = getCardReadableTextTokens({ theme });
  const statusTone = getUpsStatusTone(status);
  const statusText = getCardReadableTextTokens({
    theme,
    tone: statusTone === 'neutral' ? 'neutral' : statusTone,
  });
  const readings: SensorReading[] = [
    {
      id: 'battery',
      icon: 'battery',
      label: 'Battery',
      value: status === 'LB' ? '12' : status === 'OB' ? '58' : '92',
      unit: '%',
    },
    {
      id: 'runtime',
      icon: 'zap',
      label: 'Runtime',
      value: status === 'LB' ? '8' : status === 'OB' ? '24' : '54',
      unit: 'min',
    },
    {
      id: 'load',
      icon: 'gauge',
      label: 'Load',
      value: status === 'OB' ? '46' : status === 'LB' ? '68' : '23',
      unit: '%',
    },
  ];
  if (size !== 'small') {
    readings.push(
      { id: 'input', icon: 'zap', label: 'Input voltage', value: '232', unit: 'V' },
      { id: 'output', icon: 'zap', label: 'Output voltage', value: '230', unit: 'V' }
    );
  }
  const resolvedSize = size === 'small' ? 'small' : size === 'large' ? 'large' : 'medium';

  if (status === 'unavailable') {
    return (
      <EntityCardStoryFrame size={size}>
        <BaseCard
          size={resolvedSize}
          fullBleed
          frameClassName="overflow-hidden"
          contentClassName="h-full"
        >
          <div className="relative flex h-full min-w-0 flex-col p-3">
            <CardEmptyState
              title="UPS device unavailable"
              description="Reconnect the UPS sensors or pick another UPS source for this card."
              icon={BatteryCharging}
              size={resolvedSize}
            />
          </div>
        </BaseCard>
      </EntityCardStoryFrame>
    );
  }

  return (
    <EntityCardStoryFrame size={size}>
      <BaseCard
        size={resolvedSize}
        fullBleed
        frameClassName="overflow-hidden"
        contentClassName="h-full"
      >
        <div className="relative flex h-full min-w-0 flex-col p-3">
          <EntityCardHeader
            title="Rack UPS"
            subtitle={getStatusLabel(status)}
            layout="eyebrow-first"
            size={resolvedSize === 'large' ? 'medium' : resolvedSize}
            titleClassName={surface.textPrimary}
            subtitleStyle={{ color: statusText.titleColor }}
            leading={
              <EntityCardHeaderIcon
                IconComponent={BatteryCharging}
                isActive
                size={resolvedSize === 'large' ? 'medium' : resolvedSize}
              />
            }
          />

          <div className="flex min-h-0 flex-1 items-end">
            <SmallSensorDisplay
              sensors={readings}
              size={resolvedSize === 'small' ? 'small' : 'medium'}
              textPrimaryColor={readableText.titleColor}
              textSecondaryColor={readableText.subtitleColor}
            />
          </div>
        </div>
      </BaseCard>
    </EntityCardStoryFrame>
  );
}

const meta = {
  title: 'Cards/Custom/UPS Monitor',
  component: UpsStoryFrame,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
    },
    status: {
      control: 'select',
      options: ['OL', 'OB', 'LB', 'unavailable'],
    },
  },
  parameters: {
    docs: {
      description: {
        component: '',
        story:
          'Reuses the Grouped Sensor entity card readings component and header arrangement. Reference: cards-entity-grouped-sensor--playground.',
      },
    },
  },
} satisfies Meta<UpsStoryArgs>;

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

type Story = StoryObj<UpsStoryArgs>;

export const Playground: Story = {
  args: {
    size: 'medium',
    status: 'OL',
  },
};

export const Online: Story = {
  args: {
    size: 'medium',
    status: 'OL',
  },
};

export const OnBattery: Story = {
  args: {
    size: 'medium',
    status: 'OB',
  },
};

export const LowBattery: Story = {
  args: {
    size: 'medium',
    status: 'LB',
  },
};

export const Unavailable: Story = {
  args: {
    size: 'medium',
    status: 'unavailable',
  },
};

export const Small: Story = { args: { size: 'small', status: 'OL' } };
export const Large: Story = { args: { size: 'large', status: 'OL' } };
