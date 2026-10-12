import { APP_VERSION } from '@navet/app/constants/app-version';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsSectionController } from '../../hooks/use-settings-section-controller';
import { SettingsProjectSection } from '../settings-project-section';

const build = vi.hoisted(() => ({ releaseChannel: 'dev', hostname: 'localhost' }));
vi.mock('@navet/app/constants/app-build-metadata', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@navet/app/constants/app-build-metadata')>();
  return {
    ...actual,
    isLocalDevelopmentBuild: () =>
      actual.isLocalDevelopmentBuild(build.releaseChannel, build.hostname),
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
    build.hostname = 'localhost';
  });

  it.each(['development', 'local'])('presents %s as a local build', (channel) => {
    build.releaseChannel = channel;
    renderWithProviders(<ProjectSection />);
    expect(screen.getByText('Local development build')).toBeInTheDocument();
    expect(screen.queryByText(APP_VERSION, { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Beta', { exact: true })).not.toBeInTheDocument();
  });

  it.each(['localhost', '127.0.0.1', '[::1]'])(
    'preserves published Dev build identity on %s',
    (hostname) => {
      build.releaseChannel = 'dev';
      build.hostname = hostname;
      renderWithProviders(<ProjectSection />);
      expect(screen.getByText(APP_VERSION, { exact: true })).toBeInTheDocument();
      expect(screen.queryByText('Local development build')).not.toBeInTheDocument();
      expect(screen.getByText('Beta', { exact: true })).toBeInTheDocument();
      expect(screen.getByText(/ · test-sh · /)).toHaveTextContent(APP_VERSION);
    }
  );

  it.each(['beta', 'stable'])('preserves the release version for %s builds', (channel) => {
    build.releaseChannel = channel;
    renderWithProviders(<ProjectSection />);
    expect(screen.getByText(APP_VERSION, { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Local development build')).not.toBeInTheDocument();
  });

  it.each(['development', 'dev', 'local'])('preserves deployed %s build identity', (channel) => {
    build.releaseChannel = channel;
    build.hostname = 'dev.navet.app';
    renderWithProviders(<ProjectSection />);
    expect(screen.getByText(APP_VERSION, { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Local development build')).not.toBeInTheDocument();
    expect(screen.getByText('Beta', { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/ · test-sh · /)).toHaveTextContent(APP_VERSION);
  });
});
