import { LoadingSpinner } from '@navet/app/components/primitives/loading-spinner';
import { SkipLink } from '@navet/app/components/primitives/skip-link';
import { RenderProfiler } from '@navet/app/components/shared/render-profiler';
import { isAllRooms } from '@navet/app/constants/rooms';
import { useI18n } from '@navet/app/hooks';
import {
  dashboardToPath,
  notifyNavigationPathChanged,
  pathToDashboardId,
} from '@navet/app/navigation/sections';
import { useErrorStore, useNavigationStore } from '@navet/app/stores';
import { appErrorSelectors } from '@navet/app/stores/selectors';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { DashboardArrivalReveal } from '../components/dashboard-arrival-reveal';
import { DashboardOverlays } from '../components/dashboard-overlays';
import { DashboardSectionRouter } from '../components/dashboard-section-router';
import { useDashboardCollectionStore } from '../dashboards/dashboard-collection-store';
import { useDashboardController } from '../hooks/use-dashboard-controller';
import { useDashboardProfileSync } from '../hooks/use-dashboard-profile-sync';
import { useScreensaverStore } from '../screensaver/screensaver-store';

export function DashboardPage() {
  const { t } = useI18n();
  const screensaverActive = useScreensaverStore((state) => state.active);
  const appError = useErrorStore(appErrorSelectors.error);
  const setAppError = useErrorStore(appErrorSelectors.setError);
  const clearAppError = useErrorStore(appErrorSelectors.clearError);
  const activeCustomSidebarActionId = useNavigationStore(
    (state) => state.activeCustomSidebarActionId
  );
  const { profileLoadCompleted } = useDashboardProfileSync();
  const { page, overlays, section } = useDashboardController();
  const pendingAssignedDashboardId = useDashboardCollectionStore(
    (state) => state.pendingAssignedDashboardId
  );
  const companionCustomizationOpen = useDashboardCollectionStore(
    (state) => state.companionCustomizationOpen
  );
  const applyPendingAssignment = useDashboardCollectionStore(
    (state) => state.applyPendingAssignment
  );
  const syncDashboardFromLocation = useDashboardCollectionStore(
    (state) => state.syncDashboardFromLocation
  );
  const isDashboardReady =
    page.devicesLoaded &&
    profileLoadCompleted &&
    (activeCustomSidebarActionId !== null ||
      page.activeSection !== 'home' ||
      !isAllRooms(page.activeRoom) ||
      page.homeLayoutHydrated);
  const isWaitingForDashboard =
    page.devicesLoaded && profileLoadCompleted && !isDashboardReady && !page.connecting;

  useEffect(() => {
    if (!isWaitingForDashboard || appError) {
      return;
    }

    setAppError(t('dashboard.loadingRecovery.title'), t('dashboard.loadingRecovery.description'));
  }, [appError, isWaitingForDashboard, setAppError, t]);

  useEffect(() => {
    if (!isDashboardReady || !appError) {
      return;
    }

    if (appError.message === t('dashboard.loadingRecovery.title')) {
      clearAppError();
    }
  }, [appError, clearAppError, isDashboardReady, t]);

  useEffect(() => {
    const syncFromLocation = () => {
      syncDashboardFromLocation();
      const requestedDashboardId = pathToDashboardId(window.location.pathname);
      if (
        page.activeSection === 'home' &&
        requestedDashboardId &&
        !useDashboardCollectionStore.getState().collection.dashboardsById[requestedDashboardId]
      ) {
        const fallbackDashboardId = useDashboardCollectionStore.getState().activeDashboardId;
        window.history.replaceState(
          window.history.state,
          '',
          `${dashboardToPath(fallbackDashboardId)}${window.location.search}${window.location.hash}`
        );
        notifyNavigationPathChanged();
        toast.warning(t('dashboard.multiple.notFound'), {
          id: 'dashboard-not-found',
        });
      }
    };
    const handlePopState = () => syncFromLocation();
    if (profileLoadCompleted) {
      syncFromLocation();
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [page.activeSection, profileLoadCompleted, syncDashboardFromLocation, t]);

  useEffect(() => {
    if (
      pendingAssignedDashboardId &&
      page.activeSection === 'home' &&
      !page.isEditMode &&
      !companionCustomizationOpen &&
      !screensaverActive &&
      !page.showAddCardDialog &&
      !page.showAddEntityDialog
    ) {
      applyPendingAssignment();
    }
  }, [
    applyPendingAssignment,
    companionCustomizationOpen,
    page.activeSection,
    page.isEditMode,
    page.showAddCardDialog,
    page.showAddEntityDialog,
    pendingAssignedDashboardId,
    screensaverActive,
  ]);

  if (!isDashboardReady) {
    return page.connecting ? (
      <>
        <SkipLink targetId="dashboard-main-content" label={t('common.skipToMainContent')} />
        <main id="dashboard-main-content" tabIndex={-1} aria-busy="true">
          <LoadingSpinner message={t('dashboard.page.connectingHomeAssistant')} fullScreen />
        </main>
      </>
    ) : null;
  }

  return (
    <>
      <SkipLink targetId="dashboard-main-content" label={t('common.skipToMainContent')} />
      <DashboardArrivalReveal
        open={
          page.activeSection === 'home' &&
          page.dashboardArrivalVariant !== null &&
          (page.showImportedDashboardReveal || page.isOnboardingClosing)
        }
        onComplete={page.onDismissImportedDashboardReveal}
        variant={page.dashboardArrivalVariant ?? 'import'}
      />
      <div aria-hidden={page.showAddEntityDialog}>
        <RenderProfiler id="DashboardPage:SectionRouter">
          <DashboardSectionRouter controller={section} />
        </RenderProfiler>
      </div>
      <RenderProfiler id="DashboardPage:Overlays">
        <DashboardOverlays controller={overlays} />
      </RenderProfiler>
    </>
  );
}
