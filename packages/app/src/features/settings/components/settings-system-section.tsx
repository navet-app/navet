import homeAssistantLogo from '@navet/app/assets/providers/home-assistant.svg';
import homeyLogo from '@navet/app/assets/providers/homey-ui.webp';
import openhabLogo from '@navet/app/assets/providers/openhab.svg';
import { Badge, Button, Input, ModalSurface } from '@navet/app/components/primitives';
import { getThemeSurfaceTokens, navetTypographyTokens } from '@navet/app/components/system/tokens';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@navet/app/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@navet/app/components/ui/dropdown-menu';
import { cn } from '@navet/app/components/ui/utils';
import { useI18n, useTheme } from '@navet/app/hooks';
import {
  supportsAdditionalSmartHomeProviders,
  supportsDeviceAuthorization,
} from '@navet/app/runtime/app-mode';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Home,
  Link2,
  LogOut,
  MoreHorizontal,
  RotateCcw,
  Server,
  Settings2,
  Unplug,
} from 'lucide-react';
import { useState } from 'react';
import type { SettingsSectionController } from '../hooks/use-settings-section-controller';
import { SettingsAuthorizedDevices } from './settings-authorized-devices';
import { SettingsBackupItem } from './settings-backup-item';
import { SettingsItem, SettingsSectionGroup, SettingsSectionShell } from './settings-section-shell';

interface SettingsSystemSectionProps {
  controller: SettingsSectionController;
}

type ProviderCardStatus =
  | 'connected'
  | 'connecting'
  | 'reconnecting'
  | 'signed-in'
  | 'offline'
  | 'disconnected'
  | 'planned';

type ProviderCard = SettingsSectionController['providerCards'][number];

const PROVIDER_LOGOS: Partial<Record<IntegrationProviderId, string>> = {
  home_assistant: homeAssistantLogo,
  homey: homeyLogo,
  openhab: openhabLogo,
};

const PROVIDER_ACCENTS: Record<IntegrationProviderId, string> = {
  home_assistant:
    'from-sky-500/18 via-cyan-500/10 to-transparent ring-sky-400/20 shadow-[0_18px_42px_-34px_rgba(56,189,248,0.6)]',
  homey:
    'from-orange-500/18 via-amber-500/10 to-transparent ring-orange-400/20 shadow-[0_18px_42px_-34px_rgba(249,115,22,0.55)]',
  openhab:
    'from-emerald-500/18 via-lime-500/10 to-transparent ring-emerald-400/20 shadow-[0_18px_42px_-34px_rgba(16,185,129,0.55)]',
  hubitat:
    'from-fuchsia-500/14 via-pink-500/8 to-transparent ring-fuchsia-400/15 shadow-[0_18px_42px_-34px_rgba(217,70,239,0.45)]',
  smartthings:
    'from-blue-500/16 via-indigo-500/8 to-transparent ring-blue-400/15 shadow-[0_18px_42px_-34px_rgba(59,130,246,0.45)]',
};

function getProviderStatusLabel(t: ReturnType<typeof useI18n>['t'], status: ProviderCardStatus) {
  switch (status) {
    case 'connected':
      return t('settings.system.providers.status.connected');
    case 'connecting':
      return t('settings.system.providers.status.connecting');
    case 'reconnecting':
      return t('settings.system.providers.status.reconnecting');
    case 'signed-in':
      return t('settings.system.providers.status.signed-in');
    case 'offline':
      return t('settings.system.clients.status.offline');
    case 'disconnected':
      return t('settings.system.providers.status.disconnected');
    case 'planned':
      return t('settings.system.providers.status.planned');
  }
}

function getProviderInitials(provider: ProviderCard) {
  if (provider.id === 'home_assistant') return 'HA';
  if (provider.id === 'openhab') return 'OH';
  if (provider.id === 'smartthings') return 'ST';
  return provider.label.slice(0, 2).toUpperCase();
}

function ProviderLogoMark({ provider }: { provider: ProviderCard }) {
  const logoSrc = PROVIDER_LOGOS[provider.id];
  const accentClassName = PROVIDER_ACCENTS[provider.id];

  return (
    <div
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-white/10 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.18),transparent_58%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] ring-1 ${accentClassName}`}
    >
      {logoSrc ? (
        <img src={logoSrc} alt="" width={24} height={24} className="h-6 w-6 object-contain" />
      ) : (
        <span className="text-xs font-semibold tracking-[0.2em] text-white/90">
          {getProviderInitials(provider)}
        </span>
      )}
    </div>
  );
}

function ProviderManagementToggle({
  expanded,
  onToggle,
  styles,
  totalProviders,
  t,
}: {
  expanded: boolean;
  onToggle: () => void;
  styles: SettingsSectionController['styles'];
  totalProviders: number;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none ${styles.borderColor} ${styles.softBg} ${styles.hoverBg} ${styles.textColor} ${styles.ringClass}`}
    >
      <Settings2 className="h-4 w-4" />
      <span>
        {expanded
          ? t('settings.system.providers.hideManagement')
          : t('settings.system.providers.manageOthers', { count: totalProviders })}
      </span>
      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </button>
  );
}

function getProviderOpenUrl(provider: ProviderCard, configUrl: string | null) {
  if (!provider.isConnected) {
    return null;
  }

  if (provider.id === 'home_assistant') {
    return configUrl ?? provider.baseUrl ?? null;
  }

  return provider.baseUrl ?? null;
}

function getProviderUrlPlaceholder(provider: ProviderCard, t: ReturnType<typeof useI18n>['t']) {
  return provider.id === 'openhab'
    ? 'http://openhab.local:8080'
    : t('settings.system.providers.homeAssistantUrlPlaceholder');
}

function ProviderCardView({
  provider,
  styles,
  openConnectDialog,
  handleConnectProvider,
  onRequestDisconnect,
  t,
  configUrl,
}: {
  provider: ProviderCard;
  styles: SettingsSectionController['styles'];
  openConnectDialog: (providerId: IntegrationProviderId) => void;
  handleConnectProvider: SettingsSectionController['handleConnectProvider'];
  onRequestDisconnect: (providerId: IntegrationProviderId) => void;
  t: ReturnType<typeof useI18n>['t'];
  configUrl: string | null;
}) {
  const usesUrlConnect = provider.loginMode === 'url_oauth' || provider.loginMode === 'url_session';
  const openUrl = getProviderOpenUrl(provider, configUrl);
  const displayUrl =
    provider.baseUrl ??
    (provider.id === 'home_assistant' && provider.isConnected ? configUrl : null);
  const canEditUrl = provider.id === 'home_assistant' && provider.isConnected;
  const hasProviderMenu = Boolean(openUrl || canEditUrl || provider.canDisconnect);
  const hasNonDestructiveMenuAction = Boolean(openUrl || canEditUrl);
  const canConnectHomey = provider.id === 'homey' && !provider.isConnected;
  const canConnectWithUrl = usesUrlConnect && !provider.isConnected;

  return (
    <div
      className={`min-w-0 rounded-[22px] border p-4 ${styles.insetBorderColor} ${styles.insetBg}`}
    >
      <div className="min-w-0">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <ProviderLogoMark provider={provider} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className={`truncate text-sm font-medium ${styles.textColor}`}>
                  {provider.label}
                </p>
                {provider.status === 'connected' ? (
                  <Badge tone="success" size="small" className="text-[10px]">
                    {t('settings.system.providers.status.connected')}
                  </Badge>
                ) : provider.status !== 'disconnected' ? (
                  <ProviderStatusBadge label={getProviderStatusLabel(t, provider.status)} />
                ) : null}
              </div>
              <p
                className={`mt-1 truncate text-xs ${styles.subtleColor}`}
                title={displayUrl ?? t('settings.system.providers.notConnected')}
              >
                {displayUrl ?? t('settings.system.providers.notConnected')}
              </p>
              {provider.status === 'offline' ? (
                <p className="mt-2 text-sm leading-relaxed text-amber-300">
                  {t('settings.system.providers.homeyOffline')}
                </p>
              ) : provider.error ? (
                <p className="mt-2 text-sm leading-relaxed text-red-400">{provider.error}</p>
              ) : null}
            </div>
            {hasProviderMenu ? (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="small"
                    variant="ghost"
                    iconOnly
                    label={`${t('common.moreActions')}: ${provider.label}`}
                    className="self-center"
                  >
                    <MoreHorizontal className="h-4.5 w-4.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {openUrl ? (
                    <DropdownMenuItem asChild>
                      <a href={openUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        {t('common.open')}
                      </a>
                    </DropdownMenuItem>
                  ) : null}
                  {canEditUrl ? (
                    <DropdownMenuItem onSelect={() => openConnectDialog(provider.id)}>
                      <Link2 className="h-4 w-4" />
                      {t('common.editItem', { item: t('settings.system.providers.url') })}
                    </DropdownMenuItem>
                  ) : null}
                  {provider.canDisconnect ? (
                    <>
                      {hasNonDestructiveMenuAction ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => onRequestDisconnect(provider.id)}
                      >
                        <Unplug className="h-4 w-4" />
                        {t('settings.system.providers.disconnect')}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>

        {canConnectHomey || canConnectWithUrl ? (
          <div
            className="mt-3 flex w-full flex-wrap items-center gap-2"
            data-provider-actions={provider.id}
          >
            {canConnectHomey ? (
              <Button
                type="button"
                variant="secondary"
                size="small"
                leading={<Link2 className="h-4 w-4" />}
                className="min-w-32 flex-1 rounded-full"
                onClick={() => void handleConnectProvider('homey')}
              >
                {t('settings.system.providers.connect')}
              </Button>
            ) : null}

            {canConnectWithUrl ? (
              <Button
                type="button"
                variant="secondary"
                size="small"
                leading={<Link2 className="h-4 w-4" />}
                className="min-w-32 flex-1 rounded-full"
                onClick={() => openConnectDialog(provider.id)}
              >
                {t('settings.system.providers.connect')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SettingsSystemSection({ controller }: SettingsSystemSectionProps) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const dialogSurface = getThemeSurfaceTokens(theme);
  const [providerUrls, setProviderUrls] = useState<Record<string, string>>({
    home_assistant: '',
    openhab: '',
  });
  const [providerUsernames, setProviderUsernames] = useState<Record<string, string>>({
    openhab: '',
  });
  const [providerPasswords, setProviderPasswords] = useState<Record<string, string>>({
    openhab: '',
  });
  const [connectDialogProviderId, setConnectDialogProviderId] =
    useState<IntegrationProviderId | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [disconnectProviderId, setDisconnectProviderId] = useState<IntegrationProviderId | null>(
    null
  );
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showProviderManagement, setShowProviderManagement] = useState(() =>
    controller.providerCards.every((provider) => !provider.isConnected)
  );
  const {
    config,
    confirmLogout,
    handleConnectProvider,
    handleDisconnectProvider,
    handleLogout,
    handleResetLocalSettings,
    providerCards: allProviderCards,
    showLogoutConfirm,
    setShowLogoutConfirm,
    styles,
  } = controller;
  const showAdditionalProviders = supportsAdditionalSmartHomeProviders();
  const providerCards = allProviderCards.filter(
    (provider) =>
      provider.implementationStatus === 'implemented' &&
      (showAdditionalProviders || provider.id === 'home_assistant')
  );
  const connectedProviders = providerCards.filter((provider) => provider.isConnected);
  const disconnectDialogProvider = connectedProviders.find(
    (provider) => provider.id === disconnectProviderId
  );
  const managedProviders = providerCards.filter((provider) => !provider.isConnected);
  const connectDialogProvider =
    connectDialogProviderId === null
      ? null
      : (providerCards.find((provider) => provider.id === connectDialogProviderId) ?? null);
  const closeConnectDialog = () => {
    if (!isConnecting) setConnectDialogProviderId(null);
  };
  const openConnectDialog = (providerId: IntegrationProviderId) => {
    setConnectionError(null);
    const provider = providerCards.find((candidate) => candidate.id === providerId);
    if (provider) {
      setProviderUrls((current) => ({
        ...current,
        [providerId]:
          current[providerId] ||
          provider.baseUrl ||
          (providerId === 'home_assistant' ? config?.url : '') ||
          '',
      }));
    }
    setConnectDialogProviderId(providerId);
  };

  return (
    <SettingsSectionShell
      id="system"
      icon={Server}
      title={t('settings.system.sectionTitle')}
      description={t('settings.system.sectionDescription')}
      styles={styles}
      grouped
    >
      <SettingsSectionGroup
        id="system-smart-home"
        title={t('settings.system.group.smartHome')}
        styles={styles}
      >
        <SettingsItem
          title={t('settings.system.providers.title')}
          description={t('settings.system.providers.description')}
          styles={styles}
        >
          <div className="space-y-3">
            {connectedProviders.length > 0 ? (
              <div className="grid gap-3">
                {connectedProviders.map((provider) => (
                  <ProviderCardView
                    key={provider.id}
                    provider={provider}
                    styles={styles}
                    openConnectDialog={openConnectDialog}
                    handleConnectProvider={handleConnectProvider}
                    onRequestDisconnect={setDisconnectProviderId}
                    t={t}
                    configUrl={config?.url ?? null}
                  />
                ))}
              </div>
            ) : null}

            {managedProviders.length > 0 ? (
              <ProviderManagementToggle
                expanded={showProviderManagement}
                onToggle={() => setShowProviderManagement((current) => !current)}
                styles={styles}
                totalProviders={managedProviders.length}
                t={t}
              />
            ) : null}

            {showProviderManagement && managedProviders.length > 0 ? (
              <div className="grid gap-3">
                {managedProviders.map((provider) => (
                  <ProviderCardView
                    key={provider.id}
                    provider={provider}
                    styles={styles}
                    openConnectDialog={openConnectDialog}
                    handleConnectProvider={handleConnectProvider}
                    onRequestDisconnect={setDisconnectProviderId}
                    t={t}
                    configUrl={config?.url ?? null}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </SettingsItem>
      </SettingsSectionGroup>

      {supportsDeviceAuthorization() ? (
        <SettingsSectionGroup
          id="system-access"
          title={t('settings.system.group.access')}
          styles={styles}
        >
          <SettingsItem
            title={t('settings.system.authorizedDevices.title')}
            description={t('settings.system.authorizedDevices.description')}
            styles={styles}
          >
            <SettingsAuthorizedDevices styles={styles} />
          </SettingsItem>
        </SettingsSectionGroup>
      ) : null}

      {connectDialogProvider ? (
        <ModalSurface
          isOpen
          onOpenChange={(open) => {
            if (!open) {
              closeConnectDialog();
            }
          }}
          title={t('login.connectProviderTitle', { provider: connectDialogProvider.label })}
          description={t('settings.system.providers.connectDescription', {
            provider: connectDialogProvider.label,
          })}
          contentClassName="max-w-lg"
          bodyClassName="overflow-hidden rounded-[28px]"
        >
          <form
            className="space-y-5 p-5 sm:p-6"
            aria-busy={isConnecting}
            onSubmit={async (event) => {
              event.preventDefault();
              if (isConnecting) return;
              setIsConnecting(true);
              setConnectionError(null);
              try {
                const error = await handleConnectProvider(
                  connectDialogProvider.id,
                  (providerUrls[connectDialogProvider.id] ?? '').trim(),
                  connectDialogProvider.id === 'openhab'
                    ? (providerUsernames[connectDialogProvider.id] ?? '').trim()
                    : undefined,
                  connectDialogProvider.id === 'openhab'
                    ? (providerPasswords[connectDialogProvider.id] ?? '')
                    : undefined
                );
                if (error) {
                  setConnectionError(error);
                } else {
                  setProviderPasswords((current) => ({
                    ...current,
                    [connectDialogProvider.id]: '',
                  }));
                  setConnectDialogProviderId(null);
                }
              } catch (error) {
                setConnectionError(
                  error instanceof Error
                    ? error.message
                    : t('settings.feedback.providerConnectFailed')
                );
              } finally {
                setIsConnecting(false);
              }
            }}
          >
            <div>
              <p className={cn(navetTypographyTokens.sectionHeading, dialogSurface.textPrimary)}>
                {t('login.connectProviderTitle', { provider: connectDialogProvider.label })}
              </p>
              <p
                className={cn(
                  'mt-1 leading-relaxed',
                  navetTypographyTokens.label,
                  dialogSurface.textSecondary
                )}
              >
                {connectDialogProvider.id === 'openhab'
                  ? t('settings.system.providers.credentialsHelp')
                  : t('settings.system.providers.urlHelp')}
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="provider-connect-url"
                  className={cn('text-xs font-medium', dialogSurface.textSecondary)}
                >
                  {t('settings.system.providers.url')}
                </label>
                <Input
                  id="provider-connect-url"
                  name="provider-url"
                  disabled={isConnecting}
                  type="url"
                  autoComplete="off"
                  value={providerUrls[connectDialogProvider.id] ?? ''}
                  onChange={(event) =>
                    setProviderUrls((current) => ({
                      ...current,
                      [connectDialogProvider.id]: event.target.value,
                    }))
                  }
                  placeholder={getProviderUrlPlaceholder(connectDialogProvider, t)}
                  leading={<Home className={cn('h-4 w-4', dialogSurface.textMuted)} />}
                  inputClassName={dialogSurface.textPrimary}
                />
              </div>

              {connectDialogProvider.id === 'openhab' ? (
                <>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="provider-connect-username"
                      className={cn('text-xs font-medium', dialogSurface.textSecondary)}
                    >
                      {t('settings.system.providers.username')}
                    </label>
                    <Input
                      id="provider-connect-username"
                      name="provider-username"
                      disabled={isConnecting}
                      autoComplete="username"
                      spellCheck={false}
                      value={providerUsernames[connectDialogProvider.id] ?? ''}
                      onChange={(event) =>
                        setProviderUsernames((current) => ({
                          ...current,
                          [connectDialogProvider.id]: event.target.value,
                        }))
                      }
                      placeholder={t('settings.system.providers.openhabUsernamePlaceholder')}
                      inputClassName={dialogSurface.textPrimary}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="provider-connect-password"
                      className={cn('text-xs font-medium', dialogSurface.textSecondary)}
                    >
                      {t('settings.system.providers.password')}
                    </label>
                    <Input
                      id="provider-connect-password"
                      name="provider-password"
                      disabled={isConnecting}
                      type="password"
                      autoComplete="current-password"
                      value={providerPasswords[connectDialogProvider.id] ?? ''}
                      onChange={(event) =>
                        setProviderPasswords((current) => ({
                          ...current,
                          [connectDialogProvider.id]: event.target.value,
                        }))
                      }
                      placeholder={t('settings.system.providers.openhabPasswordPlaceholder')}
                      inputClassName={dialogSurface.textPrimary}
                    />
                  </div>
                </>
              ) : null}
            </div>

            {connectionError ? (
              <p role="alert" className="text-sm text-red-400">
                {connectionError}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="small"
                className="rounded-full"
                onClick={closeConnectDialog}
                disabled={isConnecting}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                loading={isConnecting}
                variant="secondary"
                size="small"
                leading={<Link2 className="h-4 w-4" />}
                className="rounded-full"
              >
                {isConnecting ? t('login.connecting') : t('settings.system.providers.connect')}
              </Button>
            </div>
          </form>
        </ModalSurface>
      ) : null}

      <AlertDialog
        open={Boolean(disconnectDialogProvider)}
        onOpenChange={(open) => {
          if (!open && !isDisconnecting) setDisconnectProviderId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.system.providers.disconnectTitle', {
                provider: disconnectDialogProvider?.label ?? '',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.system.providers.disconnectDescription', {
                provider: disconnectDialogProvider?.label ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisconnecting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDisconnecting || !disconnectDialogProvider}
              onClick={async (event) => {
                event.preventDefault();
                if (isDisconnecting || !disconnectDialogProvider) return;
                setIsDisconnecting(true);
                try {
                  await handleDisconnectProvider(disconnectDialogProvider.id);
                  setDisconnectProviderId(null);
                } finally {
                  setIsDisconnecting(false);
                }
              }}
            >
              {t('settings.system.providers.disconnect')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SettingsSectionGroup
        id="system-backup-recovery"
        title={t('settings.system.group.backupRecovery')}
        styles={styles}
      >
        <SettingsBackupItem controller={controller} />
        <SettingsItem
          title={t('settings.project.localData.title')}
          description={t('settings.project.localData.description')}
          styles={styles}
        >
          <button
            type="button"
            onClick={handleResetLocalSettings}
            className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none ${styles.borderColor} ${styles.softBg} ${styles.hoverBg} ${styles.textColor} ${styles.ringClass}`}
          >
            <RotateCcw className="h-4 w-4" />
            <span>{t('settings.project.localData.reset')}</span>
          </button>
        </SettingsItem>
      </SettingsSectionGroup>

      <SettingsSectionGroup
        id="system-session"
        title={t('settings.system.group.session')}
        styles={styles}
      >
        <SettingsItem
          title={t('settings.project.logout')}
          description={t('settings.system.logout.description')}
          styles={styles}
        >
          <Button
            type="button"
            size="small"
            variant="destructive"
            onClick={handleLogout}
            leading={<LogOut className="h-4 w-4" />}
            className="rounded-full"
          >
            {t('settings.project.logout')}
          </Button>

          <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('settings.feedback.logoutConfirm')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('settings.system.logout.description')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={confirmLogout}>
                  {t('settings.project.logout')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SettingsItem>
      </SettingsSectionGroup>
    </SettingsSectionShell>
  );
}

function ProviderStatusBadge({ label }: { label: string }) {
  return (
    <Badge tone="neutral" size="small">
      {label}
    </Badge>
  );
}
