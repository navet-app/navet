import {
  AttentionBand,
  type AttentionBandItem,
  DashboardEmptyState,
} from '@navet/app/components/patterns';
import { Badge, InteractivePill, Panel } from '@navet/app/components/primitives';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import type { HomeStatusSummaryItem } from '@navet/app/features/sensors/components/home-status-summary-model';
import {
  SummaryBar,
  SummaryBarStack,
} from '@navet/app/features/sensors/components/info-badge-strip';
import { useI18n, useIntegrationStore, useTheme } from '@navet/app/hooks';
import { getIntegrationProviderAdapter } from '@navet/app/services/integration-registry.service';
import { roomNamesMatch } from '@navet/app/utils/room-name';
import type { IntegrationProviderId } from '@navet/core/integration-providers';
import { AlertTriangle, Bot, ClipboardList, Power, PowerOff, Sparkles } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { useAutomationDashboardController } from '../hooks/use-automation-dashboard-controller';
import {
  type AutomationSortKey,
  sortAutomationTasks,
  type TableSortState,
  toggleTableSort,
} from '../utils/task-table-sorting';
import { AutomationTaskRow } from './automation-task-row';
import { QuickActionGrid } from './quick-action-grid';
import { SortableTableHeader } from './sortable-table-header';

type AutomationVisibilityFilter = 'all' | 'active' | 'disabled' | 'recent' | 'attention';
type RoutineView = 'automations' | 'scripts';

const automationFilterPillClassName =
  'h-7 shrink-0 whitespace-nowrap px-2 text-xs md:h-7 md:gap-1 md:px-2.5 md:text-xs [&>svg]:h-3 [&>svg]:w-3 [&>svg]:md:h-3.5 [&>svg]:md:w-3.5';
const routineViewPillClassName =
  'shrink-0 whitespace-nowrap md:h-9 md:gap-1.5 md:px-3.5 md:text-sm [&>svg]:md:h-4 [&>svg]:md:w-4';

function TasksLoadingState() {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);

  return (
    <div
      className="h-full min-w-0 overflow-x-hidden overflow-y-auto"
      role="status"
      aria-label={t('tasks.loadingRoutines')}
    >
      <div className="w-full min-w-0 space-y-4 pb-24 md:space-y-5 md:pb-0">
        <div className="flex gap-1.5 overflow-hidden md:gap-2">
          {[0, 1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className={`h-[34px] w-28 shrink-0 rounded-full md:h-[42px] md:w-32 ${surface.panelMuted}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RoutineTasksSection() {
  const { locale, t } = useI18n();
  const { theme, accentColor } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const controller = useAutomationDashboardController();
  const [chosenRoutineView, setRoutineView] = useState<RoutineView | null>(null);
  const routineView =
    chosenRoutineView ?? (controller.automations.length > 0 ? 'automations' : 'scripts');
  const [automationFilter, setAutomationFilter] = useState<AutomationVisibilityFilter>('all');
  const [automationRoomFilter, setAutomationRoomFilter] = useState<string>('all');
  const [automationSort, setAutomationSort] = useState<TableSortState<AutomationSortKey> | null>(
    null
  );
  const totalTasks = controller.automations.length + controller.quickActions.length;
  const visibleAutomations = useMemo(() => {
    const filteredByState =
      automationFilter === 'active'
        ? controller.enabledAutomations
        : automationFilter === 'disabled'
          ? controller.disabledAutomations
          : automationFilter === 'recent'
            ? controller.recentlyTriggeredAutomations
            : automationFilter === 'attention'
              ? controller.attentionAutomations
              : controller.automations;

    const filteredByRoom =
      automationRoomFilter === 'all'
        ? filteredByState
        : filteredByState.filter((automation) =>
            roomNamesMatch(automation.room, automationRoomFilter)
          );

    return sortAutomationTasks(filteredByRoom, automationSort, locale);
  }, [
    automationFilter,
    automationRoomFilter,
    automationSort,
    controller.attentionAutomations,
    controller.automations,
    controller.disabledAutomations,
    controller.enabledAutomations,
    controller.recentlyTriggeredAutomations,
    locale,
  ]);
  const showRoomFilters = controller.automationRooms.length >= 2;
  const summaryItems = useMemo<HomeStatusSummaryItem[]>(
    () => [
      {
        id: 'tasks-total',
        title: t('tasks.summary.total'),
        value: String(controller.automationSummary.total),
        icon: Bot,
        iconColor: accentColor,
      },
      {
        id: 'tasks-active',
        title: t('tasks.summary.active'),
        value: String(controller.automationSummary.active),
        icon: Power,
        iconColor: '#22c55e',
      },
      {
        id: 'tasks-disabled',
        title: t('tasks.summary.disabled'),
        value: String(controller.automationSummary.disabled),
        icon: PowerOff,
        iconColor: '#94a3b8',
      },
      {
        id: 'tasks-recent',
        title: t('tasks.summary.recent'),
        value: String(controller.automationSummary.recent),
        icon: Sparkles,
        iconColor: accentColor,
      },
      {
        id: 'tasks-attention',
        title: t('tasks.summary.attention'),
        value: String(controller.automationSummary.attention),
        icon: AlertTriangle,
        iconColor: controller.automationSummary.attention > 0 ? '#f59e0b' : '#94a3b8',
        priority: controller.automationSummary.attention > 0 ? 'attention' : 'current',
        tone: controller.automationSummary.attention > 0 ? 'warning' : 'neutral',
      },
    ],
    [accentColor, controller.automationSummary, t]
  );
  const attentionItems = useMemo<AttentionBandItem[]>(() => {
    const providerItem: AttentionBandItem[] = controller.hasError
      ? [
          {
            id: 'routines-provider-error',
            title: t('tasks.dashboard.partialErrorTitle'),
            detail: t('tasks.dashboard.partialErrorDescription'),
            priority: 'attention',
            icon: AlertTriangle,
            actionLabel: t('tasks.filters.attention'),
          },
        ]
      : [];
    return [
      ...providerItem,
      ...controller.attentionAutomations.map((automation) => ({
        id: `routine:${automation.id}`,
        title: automation.name,
        detail: automation.attentionReason
          ? t(`tasks.automation.attention.${automation.attentionReason}`)
          : t('tasks.summary.attentionCaption'),
        priority: 'attention' as const,
        icon: AlertTriangle,
        actionLabel: t('common.open'),
      })),
    ];
  }, [controller.attentionAutomations, controller.hasError, t]);
  const filteredEmptyMessage =
    automationFilter === 'attention'
      ? t('tasks.automation.empty.noAttention')
      : automationFilter === 'recent'
        ? t('tasks.automation.empty.noRecent')
        : t('tasks.automation.empty.filtered');

  const toggleAutomationFilter = (filter: Exclude<AutomationVisibilityFilter, 'all'>) => {
    setAutomationFilter((current) => (current === filter ? 'all' : filter));
  };

  if (controller.isLoading) {
    return (
      <main>
        <TasksLoadingState />
      </main>
    );
  }

  if (totalTasks === 0) {
    return (
      <main className="flex h-full items-center justify-center p-6">
        <DashboardEmptyState
          icon={ClipboardList}
          title={t('sections.tasks.emptyTitle')}
          description={t('sections.tasks.emptyDescription')}
          className="w-full max-w-md"
        />
      </main>
    );
  }

  return (
    <main className="h-full min-w-0 overflow-x-hidden overflow-y-auto">
      <SummaryBarStack className="w-full min-w-0">
        <AttentionBand
          items={attentionItems}
          ariaLabel={t('tasks.filters.attention')}
          onSelect={() => {
            setRoutineView('automations');
            setAutomationFilter('attention');
          }}
        />

        <SummaryBar items={summaryItems} ariaLabel={t('tasks.summary.title')} />

        <section className="min-w-0 space-y-4 py-1 md:space-y-5">
          <header>
            <h1 className={`text-xl font-semibold md:text-2xl ${surface.textPrimary}`}>
              {t('sections.tasks.title')}
            </h1>
            <p className={`mt-1 max-w-3xl text-sm leading-6 ${surface.textSecondary}`}>
              {t('sections.tasks.description')}
            </p>
          </header>
          <div className="space-y-4">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
              <InteractivePill
                active={routineView === 'automations'}
                aria-pressed={routineView === 'automations'}
                className={routineViewPillClassName}
                icon={Bot}
                intent="navigation"
                size="small"
                onClick={() => setRoutineView('automations')}
              >
                <span className="inline-flex items-center gap-2">
                  {t('sections.tasks.automations.title')}
                  <Badge tone="neutral" size="small">
                    {controller.automations.length}
                  </Badge>
                </span>
              </InteractivePill>
              <InteractivePill
                active={routineView === 'scripts'}
                aria-pressed={routineView === 'scripts'}
                className={routineViewPillClassName}
                icon={Sparkles}
                intent="navigation"
                size="small"
                onClick={() => setRoutineView('scripts')}
              >
                <span className="inline-flex items-center gap-2">
                  {t('tasks.quickActions.title')}
                  <Badge tone="neutral" size="small">
                    {controller.quickActions.length}
                  </Badge>
                </span>
              </InteractivePill>
            </div>

            {routineView === 'automations' ? (
              <>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
                  <InteractivePill
                    active={automationFilter === 'all'}
                    aria-pressed={automationFilter === 'all'}
                    className={automationFilterPillClassName}
                    icon={Bot}
                    intent="navigation"
                    size="compact"
                    onClick={() => setAutomationFilter('all')}
                  >
                    {t('tasks.filters.all')}
                  </InteractivePill>
                  <InteractivePill
                    active={automationFilter === 'active'}
                    aria-pressed={automationFilter === 'active'}
                    className={automationFilterPillClassName}
                    icon={Power}
                    intent="navigation"
                    size="compact"
                    onClick={() => toggleAutomationFilter('active')}
                  >
                    {t('tasks.filters.active')}
                  </InteractivePill>
                  <InteractivePill
                    active={automationFilter === 'disabled'}
                    aria-pressed={automationFilter === 'disabled'}
                    className={automationFilterPillClassName}
                    icon={PowerOff}
                    intent="navigation"
                    size="compact"
                    onClick={() => toggleAutomationFilter('disabled')}
                  >
                    {t('tasks.filters.disabled')}
                  </InteractivePill>
                  <InteractivePill
                    active={automationFilter === 'recent'}
                    aria-pressed={automationFilter === 'recent'}
                    className={automationFilterPillClassName}
                    icon={Sparkles}
                    intent="navigation"
                    size="compact"
                    onClick={() => toggleAutomationFilter('recent')}
                  >
                    {t('tasks.filters.recent')}
                  </InteractivePill>
                  <InteractivePill
                    active={automationFilter === 'attention'}
                    aria-pressed={automationFilter === 'attention'}
                    className={automationFilterPillClassName}
                    icon={AlertTriangle}
                    intent="navigation"
                    size="compact"
                    onClick={() => toggleAutomationFilter('attention')}
                  >
                    {t('tasks.filters.attention')}
                  </InteractivePill>
                </div>

                {showRoomFilters ? (
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
                    <InteractivePill
                      active={automationRoomFilter === 'all'}
                      aria-pressed={automationRoomFilter === 'all'}
                      className={automationFilterPillClassName}
                      intent="navigation"
                      size="compact"
                      onClick={() => setAutomationRoomFilter('all')}
                    >
                      {t('tasks.filters.allRooms')}
                    </InteractivePill>
                    {controller.automationRooms.map((room) => (
                      <InteractivePill
                        key={room}
                        active={automationRoomFilter === room}
                        aria-pressed={automationRoomFilter === room}
                        className={automationFilterPillClassName}
                        intent="navigation"
                        size="compact"
                        onClick={() =>
                          setAutomationRoomFilter((current) => (current === room ? 'all' : room))
                        }
                      >
                        {room}
                      </InteractivePill>
                    ))}
                  </div>
                ) : null}

                {visibleAutomations.length > 0 ? (
                  <div
                    className={`@container/automation-table overflow-hidden rounded-[22px] border ${surface.border} ${surface.panelMuted}`}
                  >
                    <div
                      className={`hidden grid-cols-[minmax(0,1fr)_10rem_7rem_15rem] items-center gap-3 px-4 pt-3 pb-2 text-xs font-medium @4xl/automation-table:grid ${surface.textMuted}`}
                    >
                      <SortableTableHeader
                        label={t('sections.tasks.automations.title')}
                        direction={
                          automationSort?.key === 'name' ? automationSort.direction : undefined
                        }
                        onToggle={() =>
                          setAutomationSort((current) => toggleTableSort(current, 'name'))
                        }
                      />
                      <SortableTableHeader
                        label={t('tasks.automation.category')}
                        direction={
                          automationSort?.key === 'category' ? automationSort.direction : undefined
                        }
                        onToggle={() =>
                          setAutomationSort((current) => toggleTableSort(current, 'category'))
                        }
                      />
                      <SortableTableHeader
                        label={t('dashboard.zones.status')}
                        direction={
                          automationSort?.key === 'status' ? automationSort.direction : undefined
                        }
                        onToggle={() =>
                          setAutomationSort((current) => toggleTableSort(current, 'status'))
                        }
                      />
                      <div aria-hidden="true" />
                    </div>
                    {visibleAutomations.map((automation, index) => (
                      <AutomationTaskRow
                        key={automation.id}
                        automation={automation}
                        shouldReduceMotion={controller.shouldReduceMotion}
                        striped={index % 2 === 0}
                      />
                    ))}
                  </div>
                ) : (
                  <Panel muted padded={false} className="p-5 text-sm leading-6">
                    <p className={surface.textSecondary}>{filteredEmptyMessage}</p>
                  </Panel>
                )}
              </>
            ) : controller.quickActions.length > 0 ? (
              <QuickActionGrid
                actions={controller.quickActions}
                shouldReduceMotion={controller.shouldReduceMotion}
              />
            ) : (
              <Panel muted padded={false} className="p-5 text-sm leading-6">
                <p className={surface.textSecondary}>{t('tasks.quickActions.empty')}</p>
              </Panel>
            )}
          </div>
        </section>
      </SummaryBarStack>
    </main>
  );
}

const TodoListsSection = lazy(() => import('./todo-lists-section'));

export function TasksSection() {
  const { t } = useI18n();
  const [workspace, setWorkspace] = useState<'routines' | 'lists'>('routines');
  const providerKey = useIntegrationStore((state) => state.selectedProviderIds.join(','));
  const listProviderIds = useMemo(
    () =>
      (providerKey.split(',').filter(Boolean) as IntegrationProviderId[]).filter((id) =>
        Boolean(getIntegrationProviderAdapter(id).todoListFeatureService)
      ),
    [providerKey]
  );
  if (!listProviderIds.length) return <RoutineTasksSection />;
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4">
      <nav className="flex shrink-0 gap-2" aria-label={t('todo.workspace')}>
        <InteractivePill
          active={workspace === 'routines'}
          aria-pressed={workspace === 'routines'}
          intent="navigation"
          size="small"
          onClick={() => setWorkspace('routines')}
        >
          {t('todo.routines')}
        </InteractivePill>
        <InteractivePill
          active={workspace === 'lists'}
          aria-pressed={workspace === 'lists'}
          intent="navigation"
          size="small"
          onClick={() => setWorkspace('lists')}
        >
          {t('todo.lists')}
        </InteractivePill>
      </nav>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {workspace === 'routines' ? (
          <RoutineTasksSection />
        ) : (
          <div className="h-full min-w-0 overflow-y-auto">
            <Suspense fallback={<TasksLoadingState />}>
              <TodoListsSection providerIds={listProviderIds} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
