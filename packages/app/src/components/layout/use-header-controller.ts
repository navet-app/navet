import { getThemeColorValue } from '@navet/app/components/shared/theme/theme-colors';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { readNavetPersonState } from '@navet/app/core/navet-device-state';
import { useNotificationBadgeCount } from '@navet/app/features/notifications/components/notifications/use-notification-badge-count';
import { useI18n, useIntegrationStore, useProviderResource, useTheme } from '@navet/app/hooks';
import { useResourceUrl } from '@navet/app/hooks/use-resource-url';
import { integrationSelectors, settingsSelectors } from '@navet/app/stores/selectors';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import type { PersonDevice } from '@navet/app/types/device.types';
import { useMemo, useRef, useState } from 'react';
import { useHeaderSearch } from './use-header-search';

export type HeaderController = ReturnType<typeof useHeaderController>;
const EMPTY_PERSON_DEVICES: PersonDevice[] = [];

function normalizePersonName(name: string | null | undefined): string {
  return name?.trim().toLowerCase() ?? '';
}

function getFirstName(name: string): string {
  return name.split(/\s+/)[0] ?? '';
}

function resolveMatchedPersonCanonicalId(
  providerPersons: PersonDevice[],
  userName: string | null | undefined
): string | null {
  const normalizedUserName = normalizePersonName(userName);
  if (!normalizedUserName) {
    const personsWithPictures = providerPersons.filter(
      (person) =>
        typeof person.entityPicture === 'string' ||
        typeof person.resources?.primaryImage?.path === 'string'
    );

    return personsWithPictures.length === 1 ? (personsWithPictures[0]?.canonicalId ?? null) : null;
  }

  const exactMatch =
    providerPersons.find((person) => normalizePersonName(person.name) === normalizedUserName)
      ?.canonicalId ?? null;
  if (exactMatch) {
    return exactMatch;
  }

  const normalizedUserFirstName = getFirstName(normalizedUserName);
  if (!normalizedUserFirstName) {
    return null;
  }

  const firstNameMatches = providerPersons.filter(
    (person) => getFirstName(normalizePersonName(person.name)) === normalizedUserFirstName
  );

  return firstNameMatches.length === 1 ? (firstNameMatches[0]?.canonicalId ?? null) : null;
}

export function useHeaderController() {
  const { theme, primaryColor } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const lowPowerMode = useSettingsStore(settingsSelectors.lowPowerMode);
  const effectsQuality = useSettingsStore(settingsSelectors.effectsQuality);
  const currentProviderId = useIntegrationStore(integrationSelectors.currentProviderId);
  const user = useIntegrationStore(integrationSelectors.currentUser);
  const shouldResolveAvatarFromProvider = !user?.avatarUrl;
  const providerPersons = useIntegrationStore(
    (state) =>
      shouldResolveAvatarFromProvider
        ? (integrationSelectors.providerDeviceCollectionById(currentProviderId)(state)?.persons ??
          EMPTY_PERSON_DEVICES)
        : EMPTY_PERSON_DEVICES,
    Object.is
  );
  const [isMobileUtilityOpen, setIsMobileUtilityOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const mobileNotificationButtonRef = useRef<HTMLButtonElement | null>(null);
  const desktopNotificationButtonRef = useRef<HTMLButtonElement | null>(null);
  const unreadCount = useNotificationBadgeCount({
    includeUpdates: !lowPowerMode && effectsQuality !== 'low',
  });
  const { t } = useI18n();
  const headerTitleMode = useSettingsStore(settingsSelectors.headerTitleMode);
  const headerCustomText = useSettingsStore(settingsSelectors.headerCustomText);
  const {
    closeMobileSearch,
    handleClearSearch,
    handleSearchChange,
    handleToggleMobileSearch,
    isMobileSearchOpen,
    isSearchActive,
    isSearchFocused,
    mobileSearchInputRef,
    searchQuery,
    setIsMobileSearchOpen,
    setIsSearchFocused,
  } = useHeaderSearch();

  const firstName = useMemo(() => {
    const fullName = user?.name?.trim();
    if (!fullName) {
      return t('header.guestName');
    }

    return fullName.split(/\s+/)[0];
  }, [t, user?.name]);

  const matchedPersonCanonicalId = useMemo(() => {
    if (user?.avatarUrl) {
      return null;
    }

    return resolveMatchedPersonCanonicalId(providerPersons, user?.name);
  }, [providerPersons, user?.avatarUrl, user?.name]);
  const matchedPersonEntity = useIntegrationStore(
    (state) =>
      matchedPersonCanonicalId
        ? integrationSelectors.providerEntityByLookup(
            currentProviderId,
            matchedPersonCanonicalId
          )(state)
        : null,
    Object.is
  );

  const matchedPersonState = readNavetPersonState(matchedPersonEntity);
  const avatarRequestKey = [
    matchedPersonEntity?.resources?.primary_image?.path,
    matchedPersonState?.entityPicture,
    matchedPersonEntity?.providerId,
  ]
    .filter(Boolean)
    .join('::');
  const avatarResource = useProviderResource({
    deviceId: matchedPersonEntity?.canonicalId ?? '',
    kind: 'primary_image',
    attrs: matchedPersonEntity?.resources?.primary_image?.path
      ? { entity_picture: matchedPersonEntity.resources.primary_image.path }
      : undefined,
    fallbackPicture: matchedPersonState?.entityPicture,
    providerId: matchedPersonEntity?.providerId,
    requestKey: avatarRequestKey,
  });

  const customAvatarUrl = useResourceUrl(user?.avatarUrl, currentProviderId);
  const avatarUrl = useMemo(() => {
    if (avatarResource?.kind === 'image' && avatarResource.url) {
      return avatarResource.url;
    }

    if (!user?.avatarUrl) {
      return null;
    }

    return customAvatarUrl;
  }, [avatarResource, customAvatarUrl, user?.avatarUrl]);

  return {
    activeColorValue: getThemeColorValue(primaryColor),
    avatarUrl,
    border: surface.border,
    closeMobileUtility: () => setIsMobileUtilityOpen(false),
    desktopNotificationButtonRef,
    dividerColor: surface.textMuted,
    firstName,
    headerCustomText,
    headerTitleMode,
    closeMobileSearch,
    closeNotifications: () => setIsNotificationOpen(false),
    handleClearSearch,
    handleSearchChange,
    handleToggleMobileSearch,
    hoverBg: surface.hoverBg,
    inputBg: surface.inputBg,
    isMobileSearchOpen,
    isMobileUtilityOpen,
    isNotificationOpen,
    isSearchActive,
    isSearchFocused,
    mobileNotificationButtonRef,
    mobileSearchInputRef,
    openMobileUtility: () => setIsMobileUtilityOpen(true),
    openNotifications: () => setIsNotificationOpen(true),
    placeholder: surface.placeholder,
    searchQuery,
    setIsMobileSearchOpen,
    setIsMobileUtilityOpen,
    setIsNotificationOpen,
    setIsSearchFocused,
    surface,
    t,
    textPrimary: surface.textPrimary,
    textSecondary: surface.textSecondary,
    unreadCount,
  };
}
