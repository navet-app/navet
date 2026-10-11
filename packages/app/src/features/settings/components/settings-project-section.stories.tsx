import { isLocalDevelopmentBuild } from '@navet/app/constants/app-build-metadata';
import { APP_VERSION } from '@navet/app/constants/app-version';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useSettingsSectionController } from '../hooks/use-settings-section-controller';
import { SettingsProjectSection } from './settings-project-section';

function ProjectStory() {
  const controller = useSettingsSectionController();
  return (
    <div className="h-full min-w-0 overflow-x-hidden overflow-y-auto px-3 py-3 md:px-6 md:py-6">
      <div className="mx-auto w-full max-w-4xl">
        <SettingsProjectSection controller={controller} />
      </div>
    </div>
  );
}

const meta = {
  title: 'Pages/Settings/About Navet',
  component: ProjectStory,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'About Navet settings grouped into project information and legal references.',
      },
    },
  },
} satisfies Meta<typeof ProjectStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    if (isLocalDevelopmentBuild()) {
      await expect(canvas.getByText('Local development build')).toBeVisible();
      await expect(canvas.queryByText('Beta', { exact: true })).not.toBeInTheDocument();
    } else {
      await expect(canvas.getByText(APP_VERSION, { exact: true })).toBeVisible();
      await expect(canvas.queryByText('Local development build')).not.toBeInTheDocument();
    }
    await expect(canvasElement.querySelectorAll('[data-settings-detail-group]')).toHaveLength(2);
    await expect(canvas.getByRole('link', { name: 'Join Discord' })).toHaveAttribute(
      'href',
      'https://discord.gg/fJWZwSyfVf'
    );
    await expect(canvas.getByRole('link', { name: 'Visit r/navet' })).toHaveAttribute(
      'href',
      'https://www.reddit.com/r/navet/'
    );
    const licenseButton = canvas.getByRole('button', { name: 'View license details' });
    await expect(licenseButton).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(licenseButton);
    await expect(licenseButton).toHaveAttribute('aria-expanded', 'true');
    await expect(canvasElement.querySelector('#project-license-details')).toBeVisible();
  },
};
