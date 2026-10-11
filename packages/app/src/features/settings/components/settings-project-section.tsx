import { AppReleaseBadge } from '@navet/app/components/shared/app-release-badge';
import { DiscordMark, RedditMark, YouTubeMark } from '@navet/app/components/shared/social-marks';
import {
  APP_BUILD_METADATA,
  getAppBuildChannelLabel,
  isLocalDevelopmentBuild,
} from '@navet/app/constants/app-build-metadata';
import { APP_VERSION } from '@navet/app/constants/app-version';
import { COMMUNITY_URLS } from '@navet/app/constants/urls';
import { useI18n } from '@navet/app/hooks';
import { ExternalLink, FileText, Info, Scale } from 'lucide-react';
import type { ReactNode, SVGProps } from 'react';
import type { SettingsSectionController } from '../hooks/use-settings-section-controller';
import { SettingsItem, SettingsSectionGroup, SettingsSectionShell } from './settings-section-shell';

interface SettingsProjectSectionProps {
  controller: SettingsSectionController;
}

function GithubMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58l-.02-2.04c-3.34.73-4.04-1.42-4.04-1.42-.55-1.38-1.34-1.75-1.34-1.75-1.1-.74.08-.72.08-.72 1.21.09 1.85 1.24 1.85 1.24 1.08 1.83 2.82 1.3 3.51.99.11-.77.42-1.3.76-1.6-2.67-.3-5.48-1.33-5.48-5.92 0-1.31.47-2.38 1.24-3.22-.12-.31-.54-1.56.12-3.26 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.7.24 2.95.12 3.26.77.84 1.24 1.91 1.24 3.22 0 4.6-2.81 5.61-5.49 5.91.43.38.82 1.11.82 2.24l-.01 3.32c0 .32.22.69.82.58A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

function CompactMetaRow({
  label,
  value,
  styles,
}: {
  label: string;
  value: ReactNode;
  styles: SettingsSectionController['styles'];
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-[16px] px-3 py-2.5 ${styles.softBg}`}
    >
      <div className="min-w-0">
        <div className={`text-xs font-medium ${styles.subtleColor}`}>{label}</div>
        <div className={`mt-1 text-sm font-semibold ${styles.textColor}`}>{value}</div>
      </div>
    </div>
  );
}

function SimpleDisclosure({
  open,
  onToggle,
  icon,
  label,
  contentId,
  styles,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon: ReactNode;
  label: string;
  contentId: string;
  styles: SettingsSectionController['styles'];
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={contentId}
        className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none ${styles.borderColor} ${styles.softBg} ${styles.hoverBg} ${styles.textColor} ${styles.ringClass}`}
      >
        {icon}
        <span>{label}</span>
      </button>

      {open ? (
        <div
          id={contentId}
          className={`rounded-[18px] border p-4 ${styles.borderColor} ${styles.softBg}`}
        >
          <div className={`space-y-3 text-sm leading-relaxed ${styles.textColor}`}>{children}</div>
        </div>
      ) : null}
    </div>
  );
}

export function SettingsProjectSection({ controller }: SettingsProjectSectionProps) {
  const { t } = useI18n();
  const { setShowLicense, setShowTerms, showLicense, showTerms, styles } = controller;
  const isLocalBuild = isLocalDevelopmentBuild();
  const buildDate = APP_BUILD_METADATA.buildDate.slice(0, 10);
  const buildMeta = [
    ...(isLocalBuild
      ? []
      : [`${getAppBuildChannelLabel(APP_VERSION)} ${APP_BUILD_METADATA.buildVersion}`]),
    APP_BUILD_METADATA.gitShaShort,
    buildDate,
  ].join(' · ');

  return (
    <SettingsSectionShell
      id="project"
      icon={Info}
      title={t('settings.project.sectionTitle')}
      description={t('settings.project.sectionDescription')}
      styles={styles}
      grouped
    >
      <SettingsSectionGroup
        id="project-information"
        title={t('settings.project.group.projectInformation')}
        styles={styles}
      >
        <SettingsItem
          title={t('settings.project.about.title')}
          description={t('settings.project.about.description')}
          styles={styles}
        >
          <div className="space-y-2.5">
            <CompactMetaRow
              label={t('settings.project.about.version')}
              value={
                <div className="flex flex-wrap items-center gap-2">
                  <span>{isLocalBuild ? t('settings.project.about.localBuild') : APP_VERSION}</span>
                  {!isLocalBuild && <AppReleaseBadge />}
                </div>
              }
              styles={styles}
            />
            <CompactMetaRow
              label={t('settings.project.about.build')}
              value={
                <span className="font-mono text-[0.82rem]" title={APP_BUILD_METADATA.buildDate}>
                  {buildMeta}
                </span>
              }
              styles={styles}
            />
          </div>
        </SettingsItem>

        <SettingsItem
          title={t('settings.project.credits.title')}
          description={t('settings.project.credits.description')}
          styles={styles}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href="https://github.com/awesomestvi/"
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none ${styles.borderColor} ${styles.softBg} ${styles.hoverBg} ${styles.textColor} ${styles.ringClass}`}
              >
                <GithubMark className="h-4 w-4" />
                <span translate="no">awesomestvi</span>
                <ExternalLink className={`h-3.5 w-3.5 ${styles.subtleColor}`} />
              </a>
              <a
                href="https://github.com/navet-app/navet/blob/main/docs/ATTRIBUTIONS.md"
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none ${styles.borderColor} ${styles.softBg} ${styles.hoverBg} ${styles.textColor} ${styles.ringClass}`}
              >
                <span>{t('settings.project.credits.viewAttributions')}</span>
                <ExternalLink className={`h-3.5 w-3.5 ${styles.subtleColor}`} />
              </a>
            </div>
          </div>
        </SettingsItem>

        <SettingsItem
          title={t('settings.project.community.title')}
          description={t('settings.project.community.description')}
          styles={styles}
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={COMMUNITY_URLS.discord}
              target="_blank"
              rel="noopener noreferrer"
              className={`group inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none ${styles.borderColor} ${styles.softBg} ${styles.hoverBg} ${styles.textColor} ${styles.ringClass}`}
            >
              <DiscordMark className="h-4 w-4 transition-colors duration-200 group-hover:text-[#5865f2] group-focus-visible:text-[#5865f2] motion-reduce:transition-none" />
              <span>{t('settings.project.community.discord')}</span>
            </a>
            <a
              href={COMMUNITY_URLS.reddit}
              target="_blank"
              rel="noopener noreferrer"
              className={`group inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none ${styles.borderColor} ${styles.softBg} ${styles.hoverBg} ${styles.textColor} ${styles.ringClass}`}
            >
              <span className="relative h-4 w-4 transition-colors duration-200 group-hover:text-[#ff4500] group-focus-visible:text-[#ff4500] motion-reduce:transition-none">
                <span
                  className="absolute inset-[1px] rounded-full bg-transparent transition-colors duration-200 group-hover:bg-white group-focus-visible:bg-white motion-reduce:transition-none"
                  aria-hidden="true"
                />
                <RedditMark className="relative h-4 w-4" />
              </span>
              <span>{t('settings.project.community.reddit')}</span>
            </a>
            <a
              href={COMMUNITY_URLS.youtube}
              target="_blank"
              rel="noopener noreferrer"
              className={`group inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none ${styles.borderColor} ${styles.softBg} ${styles.hoverBg} ${styles.textColor} ${styles.ringClass}`}
            >
              <span className="relative h-4 w-4 transition-colors duration-200 group-hover:text-[#ff0000] group-focus-visible:text-[#ff0000] motion-reduce:transition-none">
                <span
                  className="absolute inset-[2px] rounded-sm bg-transparent transition-colors duration-200 group-hover:bg-white group-focus-visible:bg-white motion-reduce:transition-none"
                  aria-hidden="true"
                />
                <YouTubeMark className="relative h-4 w-4" />
              </span>
              <span>{t('settings.project.community.youtube')}</span>
            </a>
          </div>
        </SettingsItem>
      </SettingsSectionGroup>

      <SettingsSectionGroup
        id="project-legal"
        title={t('settings.project.group.legal')}
        styles={styles}
      >
        <SettingsItem
          title={t('settings.project.license.title')}
          description={t('settings.project.license.description')}
          styles={styles}
        >
          <SimpleDisclosure
            open={showLicense}
            onToggle={() => setShowLicense(!showLicense)}
            icon={<Scale className="h-4 w-4" />}
            contentId="project-license-details"
            label={
              showLicense ? t('settings.project.license.hide') : t('settings.project.license.show')
            }
            styles={styles}
          >
            <p>{t('settings.project.license.summary')}</p>
            <p>{t('settings.project.license.networkUse')}</p>
            <p>{t('settings.project.license.trademark')}</p>
            <a
              href="https://www.gnu.org/licenses/agpl-3.0-standalone.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-500 hover:underline"
            >
              <span>{t('settings.project.license.readFull')}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </SimpleDisclosure>
        </SettingsItem>

        <SettingsItem
          title={t('settings.project.terms.title')}
          description={t('settings.project.terms.description')}
          styles={styles}
        >
          <SimpleDisclosure
            open={showTerms}
            onToggle={() => setShowTerms(!showTerms)}
            icon={<FileText className="h-4 w-4" />}
            contentId="project-terms-details"
            label={showTerms ? t('settings.project.terms.hide') : t('settings.project.terms.show')}
            styles={styles}
          >
            <div>
              <p className="font-semibold">{t('settings.project.terms.allowedTitle')}</p>
              <ul className="mt-2 ml-4 list-disc space-y-1">
                <li>{t('settings.project.terms.allowed.1')}</li>
                <li>{t('settings.project.terms.allowed.2')}</li>
                <li>{t('settings.project.terms.allowed.3')}</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold">{t('settings.project.terms.prohibitedTitle')}</p>
              <ul className="mt-2 ml-4 list-disc space-y-1">
                <li>{t('settings.project.terms.prohibited.1')}</li>
                <li>{t('settings.project.terms.prohibited.2')}</li>
                <li>{t('settings.project.terms.prohibited.3')}</li>
              </ul>
            </div>
            <p className={styles.subtleColor}>{t('settings.project.terms.disclaimer')}</p>
          </SimpleDisclosure>
        </SettingsItem>
      </SettingsSectionGroup>
    </SettingsSectionShell>
  );
}
