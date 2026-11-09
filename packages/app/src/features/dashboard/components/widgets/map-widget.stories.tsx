import { EntityCardStoryFrame } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MapWidget } from './map-widget';

const meta = {
  title: 'Cards/Widgets/Map',
  component: MapWidget,
  decorators: [
    (Story) => (
      <EntityCardStoryFrame size="large">
        <Story />
      </EntityCardStoryFrame>
    ),
  ],
  args: {
    size: 'large',
    markers: [
      {
        id: 'home_assistant:person.alex',
        kind: 'person',
        name: 'Alex',
        latitude: 55.7047,
        longitude: 13.191,
        state: 'home',
      },
      {
        id: 'home_assistant:zone.home',
        kind: 'zone',
        name: 'Home',
        latitude: 55.7047,
        longitude: 13.191,
        state: '1',
        radiusMeters: 100,
      },
      {
        id: 'home_assistant:geo_location.alert',
        kind: 'geolocation',
        name: 'Weather alert',
        latitude: 55.72,
        longitude: 13.21,
        state: '2 km',
      },
    ],
  },
} satisfies Meta<typeof MapWidget>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Context: Story = {};
export const ZonesOnly: Story = {
  args: {
    markers: [
      {
        id: 'zone.home',
        kind: 'zone',
        name: 'Home',
        latitude: 55.7047,
        longitude: 13.191,
        state: '1',
        radiusMeters: 100,
      },
    ],
  },
};
export const Empty: Story = { args: { markers: [] } };
