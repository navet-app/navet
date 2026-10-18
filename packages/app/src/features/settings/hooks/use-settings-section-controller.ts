import { useAuthBaseUrl, useOptionalAuthSession } from '@navet/app/auth/AuthProvider';
import { invalidateAuthorizedProvider } from '@navet/app/auth/device-authorization';
import type { AuthSession } from '@navet/app/auth/types';
import { PRIMARY_COLOR_OPTIONS, THEME_OPTIONS } from '@navet/app/constants/theme-options';
import { useDashboardEntitiesStore } from '@navet/app/features/dashboard';
import { useI18n, useIntegrationStore, useProviderHealth, useTheme } from '@navet/app/hooks';
import type { ProviderHealth } from '@navet/app/platform/types';
import { getProviderFeatureMatrix } from '@navet/app/provider-runtime-registry';
import { type EntityInteractionMode, type UserSettings, useSettingsStore } from '@navet/app/stores';
import { useNavigationStore } from '@navet/app/stores/navigation-store';
import { integrationSelectors } from '@navet/app/stores/selectors';
import { useThemeStore } from '@navet/app/stores/theme-store';
import { INTEGRATION_PROVIDERS, type IntegrationProviderId } from '@navet/app/types/provider';
import type { ScopedUserSettingKey } from '@navet/app/utils/settings-profile-scope';
import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { getSettingsSectionStyles } from './settings-section-styles';
import { useSettingsSectionActions } from './use-settings-section-actions';

type ProviderCardStatus =
  | 'connected'
  | 'connecting'
  | 'reconnecting'
  | 'signed-in'
  | 'offline'
  | 'disconnected'
  | 'planned';

export function resolveProviderDisplayBaseUrl(
  session: { haBaseUrl?: string; hassUrl?: string } | null | undefined
) {
  return session?.haBaseUrl ?? session?.hassUrl ?? null;
}

export function resolveProviderCardStatus(
  providerId: IntegrationProviderId,
  health: ProviderHealth | undefined,
  session: AuthSession | undefined
): ProviderCardStatus {
  if (health?.implementationStatus === 'planned') return 'planned';
  if (health?.reconnecting) return 'reconnecting';
  if (health?.connecting) return 'connecting';
  if (health?.connected) return 'connected';
  if (!session) return 'disconnected';
  if (
    providerId === 'homey' &&
    (health?.unreachable ||
      (session.providerId === 'homey' && session.selectedHomeyId && session.needsHomeySelection))
  ) {
    return 'offline';
  }
  return 'signed-in';
}

export function useSettingsSectionController() {
  const {
    customPrimaryColor,
    followSystemTheme,
    theme,
    setTheme,
    setFollowSystemTheme,
    primaryColor,
    setPrimaryColor,
    setCustomPrimaryColor,
    wallpaper,
    setWallpaper,
  } = useTheme();
  const manualTheme = useThemeStore((state) => state.theme);
  const { languageOptions, t } = useI18n();
  const hassUrl = useAuthBaseUrl();
  const authSession = useOptionalAuthSession();
  const currentProviderId = useIntegrationStore(integrationSelectors.currentProviderId);
  const activeProviderId = authSession?.providerId ?? currentProviderId;
  const sessions = authSession?.sessions ?? {};
  const login = authSession?.login;
  const logout = authSession?.logout;
  const setActiveProvider = authSession?.setActiveProvider ?? (() => undefined);
  const providerHealth = useProviderHealth() as Array<{
    providerId: IntegrationProviderId;
    connected: boolean;
    connecting: boolean;
    reconnecting: boolean;
    implementationStatus: 'implemented' | 'planned';
    lastError: string | null;
    unreachable?: boolean;
  }>;
  const {
    disableAnimations,
    effectsQuality,
    effectsQualityUserOverride,
    headerCustomText,
    headerTitleMode,
    lowPowerMode,
    preventBrowserZoom,
    language,
    keepDeviceAwake,
    temperatureUnit,
    use24HourTime,
    entityInteractionMode,
    ambientLightBleed,
    advancedCustomizationEnabled,
    customSidebarActions,
    customSummaryPills,
    dashboardProfileMode,
    dashboardSpaceMode,
    kioskMode,
    kioskSwipeRooms,
    showHomeSummaryBar,
    choresEnabled,
    updateSettings,
  } = useSettingsStore(
    useShallow((state) => ({
      disableAnimations: state.disableAnimations,
      effectsQuality: state.effectsQuality,
      effectsQualityUserOverride: state.effectsQualityUserOverride,
      lowPowerMode: state.lowPowerMode,
      preventBrowserZoom: state.preventBrowserZoom,
      headerCustomText: state.headerCustomText,
      headerTitleMode: state.headerTitleMode,
      language: state.language,
      keepDeviceAwake: state.keepDeviceAwake,
      temperatureUnit: state.temperatureUnit,
      use24HourTime: state.use24HourTime,
      entityInteractionMode: state.entityInteractionMode,
      ambientLightBleed: state.ambientLightBleed,
      advancedCustomizationEnabled: state.advancedCustomizationEnabled,
      customSidebarActions: state.customSidebarActions,
      customSummaryPills: state.customSummaryPills,
      dashboardProfileMode: state.dashboardProfileMode,
      dashboardSpaceMode: state.dashboardSpaceMode,
      kioskMode: state.kioskMode,
      kioskSwipeRooms: state.kioskSwipeRooms,
      showHomeSummaryBar: state.showHomeSummaryBar,
      choresEnabled: state.choresEnabled,
      updateSettings: state.updateSettings,
    }))
  );
  const { hiddenEntityIds, reopenOnboarding } = useDashboardEntitiesStore(
    useShallow((state) => ({
      hiddenEntityIds: state.hiddenEntityIds,
      reopenOnboarding: state.reopenOnboarding,
    }))
  );
  const { setActiveSection, setCurrentRoom } = useNavigationStore(
    useShallow((state) => ({
      setActiveSection: state.setActiveSection,
      setCurrentRoom: state.setCurrentRoom,
    }))
  );

  const {
    showLicense,
    setShowLicense,
    showTerms,
    setShowTerms,
    showLogoutConfirm,
    setShowLogoutConfirm,
    showRestoreEntities,
    setShowRestoreEntities,
    showRestartOnboardingConfirm,
    setShowRestartOnboardingConfirm,
    importInputRef,
    handleLogout,
    confirmLogout,
    handleResetConnection,
    handleResetLocalSettings,
    handleWallpaperUpload,
    handleRemoveWallpaper,
    handleSelectWallpaper,
    handleExportDashboardConfig,
    handleImportDashboardConfig,
    handleConnectProvider,
    handleDisconnectProvider,
    handleRestartOnboarding,
  } = useSettingsSectionActions({
    t,
    activeProviderId,
    setWallpaper,
    setActiveSection,
    setCurrentRoom,
    reopenOnboarding,
    connectProvider: async ({ providerId, hassUrl, username, password }) => {
      await login?.({ providerId, hassUrl, username, password });
    },
    disconnectProvider: async (providerId) => {
      await invalidateAuthorizedProvider(providerId);
      await logout?.(providerId);
    },
  });

  const styles = getSettingsSectionStyles(theme, primaryColor);
  const providerCards = useMemo(
    () =>
      Object.values(INTEGRATION_PROVIDERS).map((provider) => {
        const health = providerHealth.find((entry) => entry.providerId === provider.id);
        const session = sessions[provider.id];
        const status = resolveProviderCardStatus(provider.id, health, session);

        return {
          id: provider.id,
          label: provider.label,
          loginMode: provider.loginMode,
          status,
          isActive: activeProviderId === provider.id,
          isConnected: Boolean(session),
          canConnect: provider.loginMode !== 'unavailable',
          canDisconnect: Boolean(session),
          baseUrl: resolveProviderDisplayBaseUrl(session),
          error: session && status !== 'offline' ? (health?.lastError ?? null) : null,
          implementationStatus: health?.implementationStatus ?? 'planned',
          featureMatrix: getProviderFeatureMatrix(provider.id),
        };
      }),
    [activeProviderId, providerHealth, sessions]
  );
  const updateScopedSettings = useCallback(
    (settings: Partial<UserSettings>, _scopeKeys: readonly ScopedUserSettingKey[]) => {
      updateSettings(settings);
    },
    [updateSettings]
  );

  return {
    activeProviderId,
    ambientLightBleed,
    advancedCustomizationEnabled,
    config: hassUrl ? { url: hassUrl } : null,
    customPrimaryColor,
    customSidebarActions,
    customSummaryPills,
    dashboardProfileMode,
    dashboardSpaceMode,
    disableAnimations,
    effectsQuality,
    effectsQualityUserOverride,
    headerCustomText,
    headerTitleMode,
    entityInteractionMode,
    followSystemTheme,
    setFollowSystemTheme,
    handleExportDashboardConfig,
    handleImportDashboardConfig,
    handleConnectProvider,
    handleDisconnectProvider,
    handleLogout,
    confirmLogout,
    handleRemoveWallpaper,
    handleResetConnection,
    handleResetLocalSettings,
    handleRestartOnboarding,
    handleSelectWallpaper,
    handleWallpaperUpload,
    hiddenEntityIds,
    importInputRef,
    kioskMode,
    kioskSwipeRooms,
    keepDeviceAwake,
    language,
    languageOptions,
    lowPowerMode,
    preventBrowserZoom,
    manualTheme,
    primaryColor,
    providerCards,
    reopenOnboarding,
    setActiveProvider,
    setPrimaryColor,
    setCustomPrimaryColor,
    setShowLicense,
    setShowLogoutConfirm,
    setShowRestartOnboardingConfirm,
    setShowRestoreEntities,
    setShowTerms,
    showHomeSummaryBar,
    choresEnabled,
    setTheme,
    showLicense,
    showLogoutConfirm,
    showRestartOnboardingConfirm,
    showRestoreEntities,
    showTerms,
    styles,
    theme,
    themeOptions: THEME_OPTIONS,
    temperatureUnit,
    colorOptions: PRIMARY_COLOR_OPTIONS,
    updateSettings,
    updateScopedSettings,
    use24HourTime,
    wallpaper,
  };
}

export type SettingsSectionController = ReturnType<typeof useSettingsSectionController>;
export type SettingsInteractionOption = { value: EntityInteractionMode; label: string };
