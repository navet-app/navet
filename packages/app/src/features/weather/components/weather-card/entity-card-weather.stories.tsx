import { WeatherCard } from '@navet/app/features/weather';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import { EntityCardStoryFrame, noopCardSizeChange } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';
import dialogMeta, * as dialogStories from './weather-settings-dialog.story-fixtures';

function WeatherCardStory(args: Omit<ComponentProps<typeof WeatherCard>, 'onSizeChange'>) {
  return (
    <EntityCardStoryFrame size={args.size ?? 'medium'}>
      <WeatherCard {...args} onSizeChange={noopCardSizeChange} />
    </EntityCardStoryFrame>
  );
}

const forecast = [
  { day: 'Mon', condition: 'partly-cloudy', high: 7, low: 2 },
  { day: 'Tue', condition: 'rainy', high: 6, low: 1 },
  { day: 'Wed', condition: 'cloudy', high: 8, low: 3 },
  { day: 'Thu', condition: 'sunny', high: 10, low: 4 },
  { day: 'Fri', condition: 'cloudy', high: 9, low: 5 },
  { day: 'Sat', condition: 'rainy', high: 8, low: 4 },
  { day: 'Sun', condition: 'sunny', high: 11, low: 6 },
];

const storyConditions = [
  'sunny',
  'fair',
  'moony',
  'clear-night',
  'partly-cloudy',
  'partly-cloudy-night',
  'cloudy',
  'overcast',
  'rainy',
  'pouring',
  'showers',
  'drizzle',
  'snow',
  'snow-night',
  'snowy-rainy',
  'blizzard',
  'thunderstorm',
  'lightning',
  'lightning-rainy',
  'hail',
  'windy',
  'breezy',
  'fog',
  'mist',
  'hazy',
] as const;

const baseWeatherArgs = {
  id: 'weather.home',
  location: 'Stockholm, Sweden',
  temperature: 4,
  feelsLikeTemperature: 1,
  condition: 'rainy',
  humidity: 88,
  windSpeed: 22,
  windSpeedUnit: 'km/h',
  windGustSpeed: 35,
  pressure: 1008,
  pressureUnit: 'hPa',
  uvIndex: 1.4,
  cloudCoverage: 86,
  precipitation: 2.9,
  precipitationUnit: 'mm',
  sunrise: '06:22',
  sunset: '19:18',
  daylight: '12h 56m',
  rainForecast: 'Steady rain for next 4h',
  forecast,
  forecastMode: 'hourly',
  highTemp: 5,
  lowTemp: 1,
  size: 'medium',
  isEditMode: false,
} as const;

function getConditionRainForecast(condition: (typeof storyConditions)[number]) {
  if (condition.includes('rain') || condition === 'drizzle' || condition === 'showers') {
    return 'Precipitation expected through the afternoon';
  }

  if (condition.includes('snow') || condition === 'blizzard') {
    return 'Snow bands moving in later today';
  }

  if (condition === 'thunderstorm' || condition === 'lightning' || condition === 'hail') {
    return 'Storm risk remains elevated into the evening';
  }

  if (condition === 'fog' || condition === 'mist' || condition === 'hazy') {
    return 'Low visibility through the morning';
  }

  if (condition === 'windy' || condition === 'breezy') {
    return 'Strong crosswinds through midday';
  }

  return 'Stable conditions for most of the day';
}

function createConditionStory(condition: (typeof storyConditions)[number]): Story {
  const conditionIndex = storyConditions.indexOf(condition);

  return {
    args: {
      id: `weather.${condition}`,
      condition,
      forecastMode: 'weekly',
      size: 'medium',
      rainForecast: getConditionRainForecast(condition),
      forecast: forecast.map((day, index) => ({
        ...day,
        condition: storyConditions[(conditionIndex + index) % storyConditions.length],
      })),
    },
  };
}

const meta = {
  title: 'Cards/Entity/Weather',
  component: WeatherCardStory,
  tags: ['autodocs'],
  argTypes: {
    condition: {
      control: 'select',
      options: storyConditions,
    },
    forecastMode: {
      control: 'inline-radio',
      options: ['hourly', 'weekly'],
    },
    size: {
      control: 'inline-radio',
      options: ['small', 'medium', 'large'],
    },
  },
  args: {
    ...baseWeatherArgs,
  },
  parameters: { docs: { description: {} } },
} satisfies Meta<typeof WeatherCardStory>;

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
    sunrise: '08:30',
  },
};

export const Hourly: Story = {
  args: {
    forecastMode: 'hourly',
    size: 'medium',
  },
};

export const Weekly: Story = {
  args: {
    forecastMode: 'weekly',
    size: 'medium',
  },
};

export const Sunny: Story = {
  args: {
    condition: 'sunny',
    forecastMode: 'weekly',
    size: 'medium',
    rainForecast: 'Dry and bright through the afternoon',
  },
};

export const Fair: Story = createConditionStory('fair');
export const Moony: Story = createConditionStory('moony');
export const ClearNight: Story = createConditionStory('clear-night');
export const PartlyCloudy: Story = createConditionStory('partly-cloudy');
export const PartlyCloudyNight: Story = createConditionStory('partly-cloudy-night');
export const Cloudy: Story = createConditionStory('cloudy');
export const Overcast: Story = createConditionStory('overcast');
export const Rainy: Story = createConditionStory('rainy');
export const Pouring: Story = createConditionStory('pouring');
export const Showers: Story = createConditionStory('showers');
export const Drizzle: Story = createConditionStory('drizzle');
export const Snow: Story = createConditionStory('snow');
export const SnowNight: Story = createConditionStory('snow-night');
export const SnowyRainy: Story = createConditionStory('snowy-rainy');
export const Blizzard: Story = createConditionStory('blizzard');
export const Thunderstorm: Story = createConditionStory('thunderstorm');
export const Lightning: Story = createConditionStory('lightning');
export const LightningRainy: Story = createConditionStory('lightning-rainy');
export const Hail: Story = createConditionStory('hail');
export const Windy: Story = createConditionStory('windy');
export const Breezy: Story = createConditionStory('breezy');
export const Fog: Story = createConditionStory('fog');
export const Mist: Story = createConditionStory('mist');
export const Hazy: Story = createConditionStory('hazy');

export const Docs: Story = {
  parameters: {
    docsOnly: true,
  },
};

export const Dialog: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.Default,
};

export const DialogSelectableControls: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.SelectableControls,
};

export const DialogMobileSelectableControls: StoryObj<typeof dialogMeta> = {
  ...dialogMeta,
  ...dialogStories.MobileSelectableControls,
};
