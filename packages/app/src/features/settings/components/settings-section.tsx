import { useI18n, useMediaQuery, usePersistedState } from '@navet/app/hooks';
import { isHomeAssistantPanelMode, supportsDeviceAuthorization } from '@navet/app/runtime/app-mode';
import { Info, Languages, LayoutGrid, Monitor, Palette, Server } from 'lucide-react';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useSettingsSectionController } from '../hooks/use-settings-section-controller';
import {
  SETTINGS_DETAIL_HISTORY_KEY,
  SETTINGS_TAB_STORAGE_KEY,
  type SettingsTabId,
} from '../settings-navigation';
import { SettingsAppearanceSection } from './settings-appearance-section';
import { SettingsDashboardSection } from './settings-dashboard-section';
import { SettingsInteractionSection } from './settings-interaction-section';
import { SettingsLocalizationSection } from './settings-localization-section';
import { type SettingsNavigationGroup, SettingsNavigationShell } from './settings-navigation-shell';
import { SettingsProjectSection } from './settings-project-section';
import { createSettingsSearchItems } from './settings-search-items';
import { SettingsEmbeddedSurface } from './settings-section-shell';
import { SettingsSystemSection } from './settings-system-section';

interface SettingsSectionProps {
  hiddenTabs?: SettingsTabId[];
  layout?: 'auto' | 'desktop' | 'mobile';
}

const EMPTY_HIDDEN_TABS: SettingsTabId[] = [];

export function SettingsSection({
  hiddenTabs = EMPTY_HIDDEN_TABS,
  layout = 'auto',
}: SettingsSectionProps) {
  const { t } = useI18n();
  const controller = useSettingsSectionController();
  const hiddenTabSet = useMemo(() => new Set<string>(hiddenTabs), [hiddenTabs]);
  const responsiveIsMobile = useMediaQuery('(max-width: 767px)');
  const isMobile = layout === 'mobile' || (layout === 'auto' && responsiveIsMobile);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [pendingSearchTarget, setPendingSearchTarget] = useState<string | null>(null);
  const settingsRootRef = useRef<HTMLDivElement | null>(null);

  const navItems = useMemo(
    () =>
      [
        { id: 'appearance', label: t('settings.nav.appearance'), icon: Palette },
        { id: 'localization', label: t('settings.nav.localization'), icon: Languages },
        { id: 'dashboard', label: t('settings.nav.dashboard'), icon: LayoutGrid },
        { id: 'interaction', label: t('settings.nav.interaction'), icon: Monitor },
        { id: 'system', label: t('settings.nav.system'), icon: Server },
        { id: 'project', label: t('settings.project.sectionTitle'), icon: Info },
      ].filter(({ id }) => !hiddenTabSet.has(id)),
    [hiddenTabSet, t]
  );
  const fallbackTab = (navItems[0]?.id ?? 'appearance') as SettingsTabId;
  const [persistedTab, setPersistedTab] = usePersistedState<SettingsTabId>(
    SETTINGS_TAB_STORAGE_KEY,
    fallbackTab
  );
  const activeTab = navItems.some(({ id }) => id === persistedTab) ? persistedTab : fallbackTab;

  useEffect(() => {
    if (activeTab !== persistedTab) {
      setPersistedTab(activeTab);
    }
  }, [activeTab, persistedTab, setPersistedTab]);

  useEffect(() => {
    if (!isMobile) {
      setMobileDetailOpen(false);
      return;
    }

    setMobileDetailOpen(Boolean(window.history.state?.[SETTINGS_DETAIL_HISTORY_KEY]));
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) {
      return;
    }

    const handlePopState = (event: PopStateEvent) => {
      setMobileDetailOpen(Boolean(event.state?.[SETTINGS_DETAIL_HISTORY_KEY]));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isMobile]);

  const navigationGroups = useMemo<SettingsNavigationGroup[]>(() => {
    const itemById = new Map(navItems.map((item) => [item.id, item]));
    const createGroup = (id: string, itemIds: SettingsTabId[], label?: string) => ({
      id,
      label,
      items: itemIds.flatMap((itemId) => {
        const item = itemById.get(itemId);
        return item ? [item] : [];
      }),
    });

    return [
      createGroup('personal', ['appearance', 'localization']),
      createGroup('dashboard', ['dashboard', 'interaction'], t('settings.nav.dashboard')),
      createGroup('navet', ['system', 'project'], 'Navet'),
    ].filter((group) => group.items.length > 0);
  }, [navItems, t]);
  const searchItems = useMemo(
    () =>
      createSettingsSearchItems(t, {
        authorizedDevices: supportsDeviceAuthorization(),
        browserZoom: !isHomeAssistantPanelMode(),
        kioskSwipeRooms: controller.kioskMode,
      }).filter((item) => !hiddenTabSet.has(item.sectionId)),
    [hiddenTabSet, t, controller.kioskMode]
  );

  const selectTab = (value: string) => {
    startTransition(() => {
      setPersistedTab(value as SettingsTabId);
    });

    if (isMobile) {
      window.history.pushState(
        { ...window.history.state, [SETTINGS_DETAIL_HISTORY_KEY]: true },
        '',
        window.location.href
      );
      setMobileDetailOpen(true);
    }
  };

  const closeMobileDetail = () => {
    setMobileDetailOpen(false);
    if (window.history.state?.[SETTINGS_DETAIL_HISTORY_KEY]) {
      window.history.back();
    }
  };

  useEffect(() => {
    if (!pendingSearchTarget) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const target = Array.from(
        settingsRootRef.current?.querySelectorAll<HTMLElement>('[data-settings-search-label]') ?? []
      ).find((element) => element.dataset.settingsSearchLabel === pendingSearchTarget);

      if (!target) {
        return;
      }

      const scrollContainer = target.closest<HTMLElement>('main');
      if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        scrollContainer.scrollTo?.({
          top: scrollContainer.scrollTop + targetRect.top - containerRect.top - 16,
          behavior: 'auto',
        });
      }
      target.focus({ preventScroll: true });
      setPendingSearchTarget(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, mobileDetailOpen, pendingSearchTarget]);

  const activeSection =
    activeTab === 'appearance' ? (
      <SettingsAppearanceSection controller={controller} />
    ) : activeTab === 'localization' ? (
      <SettingsLocalizationSection controller={controller} />
    ) : activeTab === 'interaction' ? (
      <SettingsInteractionSection controller={controller} />
    ) : activeTab === 'dashboard' ? (
      <SettingsDashboardSection controller={controller} />
    ) : activeTab === 'system' && !hiddenTabSet.has('system') ? (
      <SettingsSystemSection controller={controller} />
    ) : (
      <SettingsProjectSection controller={controller} />
    );

  return (
    <SettingsNavigationShell
      activeId={activeTab}
      emptySearchLabel={t('settings.search.noResults')}
      groups={navigationGroups}
      isMobile={isMobile}
      mobileDetailOpen={mobileDetailOpen}
      onBack={closeMobileDetail}
      onSearchSelect={(item) => {
        setPendingSearchTarget(item.targetLabel ?? null);
        selectTab(item.sectionId);
      }}
      onSelect={selectTab}
      rootRef={settingsRootRef}
      searchLabel={t('sidebar.search')}
      searchItems={searchItems}
      styles={controller.styles}
      title={t('settings.hero.eyebrow')}
    >
      <SettingsEmbeddedSurface>{activeSection}</SettingsEmbeddedSurface>
    </SettingsNavigationShell>
  );
}
