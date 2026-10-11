import { APP_VERSION } from '@navet/app/constants/app-version';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsSectionController } from '../../hooks/use-settings-section-controller';
import { SettingsProjectSection } from '../settings-project-section';

const build = vi.hoisted(() => ({ releaseChannel: 'dev' }));
vi.mock('@navet/app/constants/app-build-metadata', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@navet/app/constants/app-build-metadata')>();
  return {
    ...actual,
    APP_BUILD_METADATA: {
      ...actual.APP_BUILD_METADATA,
      get releaseChannel() {
        return build.releaseChannel;
      },
    },
  };
});

function ProjectSection() {
  const controller = useSettingsSectionController();
  return <SettingsProjectSection controller={controller} />;
}

describe('About Navet build identity', () => {
  beforeEach(async () => {
    await resetAppStores();
  });

  it.each(['development', 'dev', 'local'])('presents %s as a local build', (channel) => {
    build.releaseChannel = channel;
    renderWithProviders(<ProjectSection />);
    expect(screen.getByText('Local development build')).toBeInTheDocument();
    expect(screen.queryByText(APP_VERSION, { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Beta', { exact: true })).not.toBeInTheDocument();
  });

  it.each(['beta', 'stable'])('preserves the release version for %s builds', (channel) => {
    build.releaseChannel = channel;
    renderWithProviders(<ProjectSection />);
    expect(screen.getByText(APP_VERSION, { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Local development build')).not.toBeInTheDocument();
  });
});
