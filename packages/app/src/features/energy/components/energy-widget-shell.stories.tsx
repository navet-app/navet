import type { Meta, StoryObj } from '@storybook/react-vite';
import { EnergyWidgetShell } from './energy-widget-shell';

const meta = {
  title: 'Components/Shared/Energy Widget Shell',
  component: EnergyWidgetShell,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    title: 'Energy Overview',
    eyebrow: 'ENERGY',
    children: <div className="text-sm text-white/70">Widget body content</div>,
  },
} satisfies Meta<typeof EnergyWidgetShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLongContent: Story = {
  args: {
    title: 'Current Power',
    children: (
      <div className="space-y-2">
        <div className="h-2 rounded-full bg-white/10" />
        <div className="h-2 w-5/6 rounded-full bg-white/10" />
        <div className="h-2 w-3/5 rounded-full bg-white/10" />
      </div>
    ),
  },
};
