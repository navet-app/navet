import {
  type ChoreDemoFixtureMode,
  createChoreDemoWorkspace,
} from '@navet/app/features/chores/chore-demo-fixture';
import { useChoreWorkspaceStore } from '@navet/app/features/chores/chore-workspace-store';
import { normalizeChoreExperienceState } from '@navet/core/chore-experience';
import { createChoreInterchangeDocument } from '@navet/core/chore-interchange';
import { applyChoreWorkspaceAction } from '@navet/core/chores';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { act, useEffect, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { AllChoresView } from './chore-management-views';
import { ChoreTodayView } from './chore-today-view';
import { HouseholdSection } from './household-section';

const DEMO_COPY = {
  dishwasher: 'Unload dishwasher',
  toys: 'Toys back home',
  hallway: 'Shoes and jackets',
  laundry: 'Fold clean laundry',
  plants: 'Water the plants',
  bins: 'Take out recycling',
  missionTitle: 'Saturday reset',
  missionDescription: 'Make the shared spaces feel calm for the weekend.',
  upcomingMissionTitle: 'Evening tidy up',
  upcomingMissionDescription: 'A quick reset before bedtime.',
  rewardTitle: 'Choose our next family outing',
  secondRewardTitle: 'Build a new LEGO set',
  childDishwasher: 'Dishwasher rescue',
  childToys: 'Toys back to base',
  childHallway: 'Clear the launch pad',
  kitchen: 'Kitchen',
  bedroom: 'Bedroom',
  hallwayRoom: 'Hallway',
  livingRoom: 'Living room',
};

function HouseholdStory({ mode = 'default' }: { mode?: ChoreDemoFixtureMode }) {
  useEffect(() => {
    useChoreWorkspaceStore.getState().setPreviewDocument({
      data: createChoreDemoWorkspace({ copy: DEMO_COPY, mode }),
    });
    return () => useChoreWorkspaceStore.getState().reset();
  }, [mode]);
  return <HouseholdSection syncEnabled={false} />;
}

function HouseholdRewardRequestsStory() {
  useEffect(() => {
    const data = createChoreDemoWorkspace({ copy: DEMO_COPY });
    const experience = normalizeChoreExperienceState(data.experience);
    experience.earnedPointsByParticipant = { maya: 250 };
    experience.rewardRequestsById = {
      'request-1': {
        id: 'request-1',
        rewardId: 'maya-saving-goal',
        rewardTitle: 'Build a new LEGO set',
        cost: 200,
        participantId: 'maya',
        status: 'requested',
        requestedAt: '2026-08-15T08:00:00.000Z',
        updatedAt: '2026-08-15T08:00:00.000Z',
      },
      'request-2': {
        id: 'request-2',
        rewardId: 'family-outing',
        rewardTitle: 'Choose our next family outing',
        cost: 120,
        participantId: 'maya',
        status: 'fulfilled',
        requestedAt: '2026-08-14T08:00:00.000Z',
        updatedAt: '2026-08-15T08:00:00.000Z',
        managerParticipantId: 'alex',
      },
    };
    useChoreWorkspaceStore.getState().setPreviewDocument({ data: { ...data, experience } });
    return () => useChoreWorkspaceStore.getState().reset();
  }, []);
  return <HouseholdSection syncEnabled={false} />;
}

function HouseholdProgressionStory() {
  useEffect(() => {
    const data = createChoreDemoWorkspace({ copy: DEMO_COPY });
    const experience = normalizeChoreExperienceState(data.experience);
    experience.badgesById = {
      'weekly-helper': {
        id: 'weekly-helper',
        title: 'Weekly helper',
        metric: 'count',
        target: 3,
        cycle: 'weekly',
        awardPoints: 10,
      },
    };
    experience.achievementsById = {
      'maya-dishes': {
        id: 'maya-dishes',
        title: 'Dishwasher expert',
        metric: 'selected_chore',
        target: 5,
        definitionIds: ['dishwasher'],
        participantId: 'maya',
        cycle: 'once',
      },
    };
    useChoreWorkspaceStore.getState().setPreviewDocument({ data: { ...data, experience } });
    return () => useChoreWorkspaceStore.getState().reset();
  }, []);
  return <HouseholdSection syncEnabled={false} />;
}

function HouseholdVacationReviewStory() {
  useEffect(() => {
    const data = createChoreDemoWorkspace({ copy: DEMO_COPY });
    const now = Date.now();
    const maya = data.participantsById.maya;
    if (!maya) throw new Error('Expected Maya in the demo household');
    maya.pausedAt = new Date(now - 5 * 86_400_000).toISOString();
    maya.resumeAt = new Date(now + 2 * 86_400_000).toISOString();
    const candidate = Object.values(data.occurrencesById).find(
      (occurrence) => occurrence.status === 'available'
    );
    if (!candidate) throw new Error('Expected an available chore');
    candidate.assigneeIds = ['maya'];
    candidate.scheduledAt = new Date(now - 86_400_000).toISOString();
    candidate.dueAt = new Date(now - 82_800_000).toISOString();
    useChoreWorkspaceStore.getState().setPreviewDocument({ data });
    return () => useChoreWorkspaceStore.getState().reset();
  }, []);
  return <HouseholdSection syncEnabled={false} />;
}

function HouseholdCustomIntervalStory() {
  useEffect(() => {
    const data = createChoreDemoWorkspace({ copy: DEMO_COPY });
    const plants = data.definitionsById.plants;
    for (const [id, intervalDays] of [
      ['toys', 1],
      ['bins', 10],
    ] as const) {
      const definition = data.definitionsById[id];
      if (!definition) throw new Error(`Missing chore fixture: ${id}`);
      definition.schedule = {
        frequency: 'after_completion',
        startDate:
          definition.schedule.frequency === 'once'
            ? definition.schedule.date
            : definition.schedule.startDate,
        time: definition.schedule.time,
        timeZone: definition.schedule.timeZone,
        intervalDays,
      };
    }
    useChoreWorkspaceStore.getState().setPreviewDocument({
      data: plants
        ? {
            ...data,
            definitionsById: {
              ...data.definitionsById,
              plants: {
                ...plants,
                schedule: {
                  frequency: 'daily',
                  startDate:
                    plants.schedule.frequency === 'once'
                      ? plants.schedule.date
                      : plants.schedule.startDate,
                  time: plants.schedule.time,
                  timeZone: plants.schedule.timeZone,
                  intervalDays: 10,
                },
              },
            },
          }
        : data,
    });
    return () => useChoreWorkspaceStore.getState().reset();
  }, []);
  return <HouseholdSection syncEnabled={false} />;
}

function HouseholdEdgeCaseStory() {
  useEffect(() => {
    const data = createChoreDemoWorkspace({ copy: DEMO_COPY });
    const createdAt = '2026-08-01T08:00:00.000Z';
    const extraParticipants = Object.fromEntries(
      ['Jordan', 'Riley', 'Taylor', 'Casey'].map((displayName) => {
        const id = displayName.toLowerCase();
        return [
          id,
          {
            id,
            displayName,
            capabilities: ['complete' as const],
            createdAt,
            updatedAt: createdAt,
          },
        ];
      })
    );
    const hallway = data.definitionsById.hallway;
    const hallwayOccurrence = data.occurrencesById['today-hallway'];
    useChoreWorkspaceStore.getState().setPreviewDocument({
      data: {
        ...data,
        participantsById: { ...data.participantsById, ...extraParticipants },
        definitionsById: hallway
          ? {
              ...data.definitionsById,
              hallway: {
                ...hallway,
                title:
                  'Put every pair of shoes, coat, backpack, and umbrella back where it belongs',
                roomRef: undefined,
                assignment: { mode: 'anyone', participantIds: [] },
              },
            }
          : data.definitionsById,
        occurrencesById: hallwayOccurrence
          ? {
              ...data.occurrencesById,
              'today-hallway': { ...hallwayOccurrence, assigneeIds: [], assignmentSlot: 'anyone' },
            }
          : data.occurrencesById,
      },
    });
    return () => useChoreWorkspaceStore.getState().reset();
  }, []);
  return <HouseholdSection syncEnabled={false} />;
}

function HouseholdRecoveryStory() {
  useEffect(() => {
    useChoreWorkspaceStore.setState({
      data: null,
      error: 'Chore data could not be read. The saved file was left unchanged.',
      recovery: {
        backupAvailable: true,
        pinConfigured: false,
        reason: 'workspace_invalid',
      },
      revision: null,
      status: 'unavailable',
    });
    return () => useChoreWorkspaceStore.getState().reset();
  }, []);
  return <HouseholdSection syncEnabled={false} />;
}

function HouseholdInvalidDataStory() {
  useEffect(() => {
    useChoreWorkspaceStore.setState({
      data: null,
      error:
        'Navet received chore data it could not safely read. Your household data was left unchanged.',
      recovery: null,
      revision: null,
      status: 'error',
    });
    return () => useChoreWorkspaceStore.getState().reset();
  }, []);
  return <HouseholdSection syncEnabled={false} />;
}

function HouseholdProtectedStory() {
  useEffect(() => {
    useChoreWorkspaceStore.getState().setPreviewDocument({
      data: createChoreDemoWorkspace({ copy: DEMO_COPY }),
    });
    useChoreWorkspaceStore.setState({
      managementPinConfigured: true,
      managementUnlocked: true,
    });
    return () => useChoreWorkspaceStore.getState().reset();
  }, []);
  return <HouseholdSection syncEnabled={false} />;
}

function HouseholdPointsStory({ missedHistory = false }: { missedHistory?: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const store = useChoreWorkspaceStore.getState();
    const originalExecute = store.execute;
    const originalUnlockManagement = store.unlockManagement;
    const workspace = createChoreDemoWorkspace({ copy: DEMO_COPY });
    const experience = normalizeChoreExperienceState(workspace.experience);
    const data = {
      ...workspace,
      experience: {
        ...experience,
        earnedPointsByParticipant: { maya: 25, sam: 99 },
      },
      activity: [
        {
          id: 'activity:maya-birthday',
          commandId: 'story:maya-birthday',
          timestamp: '2026-08-30T12:00:00.000Z',
          type: 'points_adjusted' as const,
          participantId: 'maya',
          actorParticipantId: 'alex',
          pointsDelta: 10,
          reason: 'Birthday bonus',
        },
        {
          id: 'activity:sam-private',
          commandId: 'story:sam-private',
          timestamp: '2026-08-31T12:00:00.000Z',
          type: 'points_adjusted' as const,
          participantId: 'sam',
          actorParticipantId: 'alex',
          pointsDelta: 99,
          reason: 'Sam only',
        },
      ],
    };
    if (missedHistory) {
      const original = data.occurrencesById['today-dishwasher'];
      const scheduledAt = new Date(Date.now() - 7 * 86_400_000).toISOString();
      data.occurrencesById['missed-history-dishwasher'] = {
        ...original,
        id: 'missed-history-dishwasher',
        scheduledAt,
        dueAt: scheduledAt,
        status: 'missed',
        missedAt: new Date().toISOString(),
      };
      data.occurrencesById['today-dishwasher'] = {
        ...original,
        scheduledAt: new Date(Date.now() - 3_600_000).toISOString(),
        dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      };
      data.definitionsById.dishwasher.schedule = {
        frequency: 'weekly',
        startDate: scheduledAt.slice(0, 10),
        time: '10:00',
        timeZone: 'UTC',
        daysOfWeek: [0],
      };
    }
    store.setPreviewDocument({ data });
    useChoreWorkspaceStore.setState({
      managementPinConfigured: true,
      managementUnlocked: false,
      unlockManagement: async (pin) => {
        if (pin !== '1234') {
          useChoreWorkspaceStore.setState({ managementError: 'PIN was not accepted' });
          return false;
        }
        useChoreWorkspaceStore.setState({ managementError: null, managementUnlocked: true });
        return true;
      },
      execute: async (action) => {
        const current = useChoreWorkspaceStore.getState();
        if (!current.data || current.revision === null) return false;
        try {
          const result = applyChoreWorkspaceAction({
            action,
            commandId: `story:${Date.now()}`,
            timestamp: new Date().toISOString(),
            workspace: current.data,
          });
          useChoreWorkspaceStore.setState({
            data: {
              ...result.data,
              activity: [...result.data.activity, result.activity],
            },
            revision: current.revision + 1,
            status: 'ready',
          });
          return true;
        } catch {
          return false;
        }
      },
    });
    setReady(true);
    return () => {
      useChoreWorkspaceStore.setState({
        execute: originalExecute,
        unlockManagement: originalUnlockManagement,
      });
      useChoreWorkspaceStore.getState().reset();
    };
  }, [missedHistory]);
  return ready ? <HouseholdSection syncEnabled={false} /> : null;
}

function HouseholdImportNavigationStory() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const store = useChoreWorkspaceStore.getState();
    const originalRestoreBackup = store.restoreBackup;
    store.setPreviewDocument({ data: createChoreDemoWorkspace({ copy: DEMO_COPY }) });
    useChoreWorkspaceStore.setState({
      restoreBackup: async ({ document }) => {
        useChoreWorkspaceStore.getState().setPreviewDocument({ data: document.workspace });
        return true;
      },
    });
    setReady(true);
    return () => {
      useChoreWorkspaceStore.setState({ restoreBackup: originalRestoreBackup });
      useChoreWorkspaceStore.getState().reset();
    };
  }, []);
  return ready ? <HouseholdSection syncEnabled={false} /> : null;
}

const meta = {
  title: 'Pages/Household/Today',
  component: HouseholdStory,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The complete provider-neutral Household workspace. Today combines a compact house pulse, visible ownership and effort, an always-available Add chore action, and mission and reward cards aligned to the dashboard grid. Household views use the same independent navigation pills as Room Nav, alongside shared BaseCard geometry, themes, and progressive disclosure.',
      },
    },
  },
} satisfies Meta<typeof HouseholdStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const IpadProLandscape: Story = {
  globals: { viewport: { value: 'ipadPro', isRotated: true } },
  parameters: {
    docs: {
      description: {
        story:
          'Primary tablet and wall-display state keeps missions and rewards out of the chore flow until the household opens them from Chores today.',
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    const panel = within(await canvas.findByRole('region', { name: 'Today' }));
    const addChore = panel.getByRole('button', { name: 'Add chore' });
    await expect(addChore).toHaveClass('h-9');
    await expect(panel.getByRole('button', { name: 'Using this screen' })).toHaveClass('h-9');
    await expect(
      panel.getByRole('heading', { name: 'Needs attention', level: 1 })
    ).toBeInTheDocument();
    await expect(
      panel.getByRole('heading', { name: 'Needs attention', level: 2 })
    ).toBeInTheDocument();
    await expect(panel.queryByRole('heading', { name: 'Coming up' })).not.toBeInTheDocument();
    await expect(
      panel.queryByRole('heading', { name: 'Missions and rewards' })
    ).not.toBeInTheDocument();
    const pulse = panel
      .getByRole('heading', { name: 'Needs attention', level: 1 })
      .closest('[data-house-pulse-layout="responsive"]');
    await expect(pulse).not.toBeNull();
    await expect(within(pulse as HTMLElement).getAllByText('Overdue').length).toBeGreaterThan(0);
    const seeRewards = panel.getByRole('button', {
      name: 'See rewards, Missions and rewards',
    });
    await expect(seeRewards).toHaveClass('xl:min-h-14', 'rounded-none');
    await expect(seeRewards.querySelector('[data-pulse-metric-icon]')).toHaveClass(
      'xl:h-9',
      'xl:w-9'
    );
    await expect(within(seeRewards).getByText('Missions and rewards')).toBeVisible();
    await expect(seeRewards).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(seeRewards);
    await expect(seeRewards).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.getByRole('heading', { name: 'Missions and rewards' })).toBeVisible();
    await expect(panel.getByText('Saturday reset')).toBeInTheDocument();
    await expect(panel.getByText('Choose our next family outing')).toBeInTheDocument();
    await userEvent.click(seeRewards);
    await expect(seeRewards).toHaveAttribute('aria-expanded', 'false');
    await expect(
      panel.queryByRole('heading', { name: 'Missions and rewards' })
    ).not.toBeInTheDocument();
    await expect(
      panel.queryByRole('heading', { name: 'Around the house' })
    ).not.toBeInTheDocument();
    const doneSection = panel.getByRole('heading', { name: 'Done' }).closest('section');
    await expect(doneSection).not.toBeNull();
    await expect(doneSection?.querySelectorAll('[data-chore-card-size="small"]')).toHaveLength(2);
    await expect(doneSection?.querySelectorAll('[data-chore-earned-points]')).toHaveLength(2);
    await expect(doneSection?.querySelector('[title^="About"]')).not.toBeInTheDocument();
    const focusSection = panel
      .getByRole('heading', { name: 'Needs attention', level: 2 })
      .closest('section');
    await expect(focusSection).not.toBeNull();
    await expect(focusSection?.querySelector('[data-chore-artwork]')).not.toBeInTheDocument();
    await expect(panel.getAllByText('Kitchen').length).toBeGreaterThan(0);
  },
};

export const IpadMiniLandscape: Story = {
  globals: { viewport: { value: 'ipadMini', isRotated: true } },
  parameters: {
    docs: {
      description: {
        story:
          'Short landscape tablets move Add chore and assignment into Chores today, remove the redundant Today introduction, and keep the metrics in one compact row so the first actionable chore stays above the fold.',
      },
    },
  },
  play: async ({ canvas }) => {
    const panel = within(await canvas.findByRole('region', { name: 'Today' }));
    await expect(panel.queryByText('Today at home')).not.toBeInTheDocument();
    await expect(
      panel.queryByText('Start with what needs attention, then let the rest wait.')
    ).not.toBeInTheDocument();
    const pulse = panel
      .getByRole('heading', { name: 'Needs attention', level: 1 })
      .closest('[data-house-pulse-layout="responsive"]');
    await expect(pulse).not.toBeNull();
    await expect(
      within(pulse as HTMLElement).getByRole('button', { name: 'Add chore' })
    ).toBeVisible();
    await expect(
      within(pulse as HTMLElement).getByRole('button', { name: 'Using this screen' })
    ).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Needs attention', level: 2 })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Take out recycling' })).toBeVisible();
  },
};

export const WideDesktop: Story = {
  globals: { viewport: { value: 'desktop1440p', isRotated: false } },
};

export const IpadProPortrait: Story = {
  globals: { viewport: { value: 'ipadPro', isRotated: false } },
  parameters: {
    docs: {
      description: {
        story:
          'Portrait tablets use the compact Chores today composition so each metric and the rewards action remains readable and touchable.',
      },
    },
  },
  play: async ({ canvas }) => {
    const panel = within(await canvas.findByRole('region', { name: 'Today' }));
    const metrics = panel
      .getByRole('heading', { name: 'Needs attention', level: 1 })
      .closest('[data-house-pulse-layout="responsive"]')
      ?.querySelectorAll('[data-pulse-metric="true"]');
    await expect(metrics).toHaveLength(4);
    await expect(panel.getByText('Missions and rewards')).toBeVisible();
  },
};

export const Mobile: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Phone composition keeps the active household profile and next useful chore action ahead of secondary summaries.',
      },
    },
  },

  play: async ({ canvas }) => {
    const panel = within(await canvas.findByRole('region', { name: 'Today' }));
    const participantPicker = panel.getByLabelText('Using this screen');
    await expect(participantPicker).toBeInTheDocument();
    await expect(within(participantPicker).getByText('Everyone')).toBeVisible();
    const pulse = panel
      .getByRole('heading', { name: 'Needs attention', level: 1 })
      .closest('[data-house-pulse-layout="responsive"]');
    await expect(pulse).toBeVisible();
    await expect(pulse?.closest('[data-chore-today-layout="true"]')).toHaveClass('space-y-4');
    const focusHeading = panel
      .getByRole('heading', { name: 'Needs attention', level: 2 })
      .closest('[data-chore-section-heading="true"]');
    await expect(focusHeading).toHaveClass('mb-2', 'min-h-8');
    await expect(
      focusHeading?.querySelector('[data-chore-section-count="true"]')?.parentElement
    ).toHaveClass('inline-flex', 'border', 'px-2', 'py-0.5');
    await expect(panel.getByText('Missions and rewards')).toBeVisible();
    await expect(
      panel.getAllByRole('heading', { name: 'Unload dishwasher' }).length
    ).toBeGreaterThan(0);
  },

  globals: {
    viewport: {
      value: 'mobile1',
      isRotated: false,
    },
  },
};

export const LightTheme: Story = {
  globals: { theme: 'light', viewport: { value: 'ipadPro', isRotated: true } },
};

export const DarkTheme: Story = {
  globals: { theme: 'dark', viewport: { value: 'ipadPro', isRotated: true } },
};

export const BlackTheme: Story = {
  globals: { theme: 'black', viewport: { value: 'ipadPro', isRotated: true } },
};

export const ReducedMotionKiosk: Story = {
  globals: {
    theme: 'black',
    motion: 'reduced',
    effectsQuality: 'reduced',
    viewport: { value: 'desktop1440p', isRotated: false },
  },
};

export const EmptyHousehold: Story = {
  args: { mode: 'empty' },
  parameters: {
    docs: {
      description: {
        story:
          'First-run state and the start of the guided setup. The welcome surface defines chores in everyday language, explains why a household would use them, and keeps one clear primary action.',
      },
    },
  },
  play: async ({ canvas, canvasElement }) => {
    const welcome = await canvas.findByRole('region', {
      name: 'Make household work easier to share.',
    });
    await expect(within(welcome).getByText('Why use chores?')).toBeInTheDocument();
    await expect(within(welcome).getByText('No more asking who is doing what')).toBeInTheDocument();
    await expect(
      within(welcome).getByText('Routine jobs are harder to forget')
    ).toBeInTheDocument();
    await expect(within(welcome).getByText('See progress without checking in')).toBeInTheDocument();
    await userEvent.click(within(welcome).getByRole('button', { name: 'Create your chore list' }));
    const dialog = within(canvasElement.ownerDocument.body).getByRole('dialog', {
      name: 'Set up household chores',
    });
    await expect(within(dialog).getByText('Step 1 of 6')).toBeInTheDocument();
    await expect(within(dialog).queryByLabelText('Name')).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add person' }));
    await waitFor(() => expect(within(dialog).getByLabelText('Name')).toBeVisible());
    await expect(within(dialog).queryByLabelText('Profile colour')).toBeNull();
  },
};

export const DamagedWorkspaceRecovery: Story = {
  render: () => <HouseholdRecoveryStory />,
  parameters: {
    docs: {
      description: {
        story:
          'Recovery state for an unreadable workspace. Existing data remains untouched while retry, backup repair, and explicit start-over paths are presented.',
      },
    },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const recovery = canvas.getByText('Chores need attention').closest('[class*="rounded-[24px]"]');
    await expect(recovery).not.toBeNull();
    const recoverySurface = within(recovery as HTMLElement);
    await expect(recoverySurface.queryByText('What happened')).toBeNull();
    await expect(recoverySurface.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    await expect(
      recoverySurface.getByRole('button', { name: 'Repair chores' })
    ).toBeInTheDocument();
    await userEvent.click(recoverySurface.getByRole('button', { name: 'Start over' }));
    await expect(
      within(canvasElement.ownerDocument.body).getByRole('alertdialog', {
        name: 'Start chores over?',
      })
    ).toBeInTheDocument();
  },
};

export const InvalidWorkspaceMessage: Story = {
  render: () => <HouseholdInvalidDataStory />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Chores could not sync')).toBeInTheDocument();
    await expect(
      canvas.getByText(
        'Navet received chore data it could not safely read. Your household data was left unchanged.'
      )
    ).toBeInTheDocument();
    await expect(canvas.queryByText('Chores are unavailable here')).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  },
};

export const HouseSettled: Story = {
  args: { mode: 'complete' },
  play: async ({ canvas }) => {
    await canvas.findByText('All done for today');
    await expect(
      within(canvas.getByRole('region', { name: 'Today' })).getByText(
        'Everything due today is complete.'
      )
    ).toBeInTheDocument();
  },
};

export const MotivationOff: Story = {
  args: { mode: 'off' },
  play: async ({ canvas, userEvent }) => {
    const today = within(canvas.getByRole('region', { name: 'Today' }));
    const navigation = within(canvas.getByRole('navigation', { name: 'Household' }));
    const pulseHeading = await today.findByRole('heading', {
      name: 'Needs attention',
      level: 1,
    });
    const pulse = pulseHeading.closest('[data-house-pulse-layout="responsive"]');
    await expect(pulse).toHaveAttribute('data-house-pulse-density', 'inline-metrics');
    await expect(pulse).toHaveClass('lg:landscape:flex', 'xl:flex');
    await expect(pulse?.querySelector('[data-house-pulse-metrics="true"]')).toHaveClass(
      'grid-cols-2',
      'sm:grid-cols-2',
      'lg:landscape:contents',
      'xl:contents'
    );
    const inlineMetrics = pulse?.querySelectorAll('[data-pulse-metric="true"]') ?? [];
    await expect(inlineMetrics).toHaveLength(2);
    await expect(inlineMetrics[1]).toHaveClass('border-l');
    await expect(inlineMetrics[0]).toHaveClass('lg:landscape:ml-auto', 'xl:ml-auto');
    await expect(pulse?.querySelector('[data-house-pulse-actions="true"]')).toHaveClass(
      'lg:landscape:ml-3',
      'lg:landscape:border-l',
      'lg:landscape:pl-4',
      'xl:ml-3',
      'xl:border-l',
      'xl:pl-4'
    );
    await expect(inlineMetrics[0]).toHaveClass('lg:landscape:border-0', 'xl:border-0');
    for (const metric of inlineMetrics) {
      await expect(metric).toHaveClass('lg:landscape:px-4', 'xl:px-5');
    }
    for (const metric of Array.from(inlineMetrics).slice(1)) {
      await expect(metric).toHaveClass('lg:landscape:border-l', 'xl:border-l');
    }
    await expect(today.queryByText('Earned')).not.toBeInTheDocument();
    await expect(today.queryByTitle(/points$/)).not.toBeInTheDocument();
    await expect(navigation.queryByRole('button', { name: 'Missions' })).not.toBeInTheDocument();
    await expect(navigation.queryByRole('button', { name: 'Rewards' })).not.toBeInTheDocument();
    await expect(today.queryByText('Missions and rewards')).not.toBeInTheDocument();

    await userEvent.click(navigation.getByRole('button', { name: 'Progress' }));
    const progress = within(canvas.getByRole('region', { name: 'Progress' }));
    await expect(progress.queryByRole('button', { name: 'Point history' })).not.toBeInTheDocument();
    await expect(progress.queryByLabelText(/points for/i)).not.toBeInTheDocument();

    await userEvent.click(navigation.getByRole('button', { name: 'Chores' }));
    const chores = within(canvas.getByRole('region', { name: 'Chores' }));
    const dishwasherCard = chores
      .getByRole('heading', { name: 'Unload dishwasher' })
      .closest('[data-chore-base-card]');
    await expect(dishwasherCard).not.toBeNull();
    await expect(
      within(dishwasherCard as HTMLElement).queryByTitle('15 points')
    ).not.toBeInTheDocument();
  },
};

export const ChildFriendlyAdventure: Story = {
  args: { mode: 'adventure' },
  play: async ({ canvas }) => {
    const today = within(canvas.getByRole('region', { name: 'Today' }));
    await expect((await today.findAllByText('Dishwasher rescue')).length).toBeGreaterThan(0);
    await expect(today.getByText('Toys back to base')).toBeInTheDocument();
  },
  globals: {
    viewport: {
      value: 'mobile1',
      isRotated: false,
    },
  },
};

export const LongNameManyPeopleNoRoomAnyone: Story = {
  render: () => <HouseholdEdgeCaseStory />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const panel = within(canvas.getByRole('region', { name: 'Today' }));
    await expect(
      (
        await panel.findAllByText(
          'Put every pair of shoes, coat, backpack, and umbrella back where it belongs'
        )
      ).length
    ).toBeGreaterThan(0);
    await expect(panel.getAllByText('Anyone can do it').length).toBeGreaterThan(0);
    await userEvent.click(panel.getByLabelText('Using this screen'));
    await expect(
      within(canvasElement.ownerDocument.body).getAllByRole('menuitemradio')
    ).toHaveLength(8);
    await userEvent.keyboard('{Escape}');
  },
  globals: {
    viewport: {
      value: 'mobile1',
      isRotated: false,
    },
  },
};

export const ApprovalQueue: Story = {
  args: { mode: 'approval' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findAllByText('Needs approval');
    const panel = within(canvas.getByRole('region', { name: 'Today' }));
    await userEvent.click(panel.getByLabelText('Using this screen'));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole('menuitemradio', { name: 'Alex' })
    );
    await expect(panel.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  },
};

export const ChoreLibrary: Story = {
  render: () => <HouseholdCustomIntervalStory />,
  parameters: {
    docs: {
      description: {
        story:
          'Management view for searching, filtering, pausing, and editing recurring chores without crowding the operational Today view.',
      },
    },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole('region', { name: 'Today' });
    const choresNavigation = canvas.getByRole('navigation', { name: 'Household' });
    await expect(within(choresNavigation).queryByRole('tablist')).not.toBeInTheDocument();
    await userEvent.click(within(choresNavigation).getByRole('button', { name: 'Chores' }));
    await expect(within(choresNavigation).getByRole('button', { name: 'Chores' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    const panel = within(canvas.getByRole('region', { name: 'Chores' }));
    await expect(panel.queryByText('Chore library')).not.toBeInTheDocument();
    const toolbar = within(panel.getByRole('region', { name: 'Chore library' }));
    await expect(toolbar.getByRole('searchbox')).toBeInTheDocument();
    const filterTrigger = toolbar.getByRole('button', { name: 'Filter' });
    await expect(filterTrigger).toBeInTheDocument();
    await userEvent.click(filterTrigger);
    const filterMenu = within(canvasElement.ownerDocument.body).getByRole('menu');
    await expect(within(filterMenu).queryByRole('searchbox')).not.toBeInTheDocument();
    await expect(within(filterMenu).getByLabelText('Filter by room')).toBeInTheDocument();
    await expect(within(filterMenu).getByLabelText('Filter by person')).toBeInTheDocument();
    await expect(within(filterMenu).getByLabelText('Filter by schedule')).toBeInTheDocument();
    await expect(within(filterMenu).getByLabelText('Filter by status')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await expect(toolbar.getByRole('button', { name: 'Add chore' })).toBeInTheDocument();
    const dishwasherCard = panel
      .getByRole('heading', { name: 'Unload dishwasher' })
      .closest('[data-chore-base-card]');
    await expect(dishwasherCard).not.toBeNull();
    await expect(within(dishwasherCard as HTMLElement).getByText('Kitchen')).toBeVisible();
    await expect(within(dishwasherCard as HTMLElement).getByText('Maya')).toHaveClass(
      'text-xs',
      'font-normal'
    );
    await expect(within(dishwasherCard as HTMLElement).getByText('Maya')).not.toHaveClass(
      'font-semibold'
    );
    await expect(within(dishwasherCard as HTMLElement).getByTitle('About 4 min')).toBeVisible();
    await expect(within(dishwasherCard as HTMLElement).getByTitle('15 points')).toBeVisible();
    await expect(
      within(dishwasherCard as HTMLElement).getByRole('button', { name: 'Edit' })
    ).toBeVisible();
    const plantsCard = panel
      .getByRole('heading', { name: 'Water the plants' })
      .closest('[data-chore-base-card]');
    await expect(plantsCard).not.toBeNull();
    await expect(within(plantsCard as HTMLElement).getByText('Every 10 days')).toBeVisible();
    for (const [title, label] of [
      ['Toys back home', '1 day after completion'],
      ['Take out recycling', '10 days after completion'],
    ]) {
      const heading = panel.getByRole('heading', { name: title });
      await expect(heading.previousElementSibling).toHaveTextContent(label);
      await expect(
        within(heading.closest('[data-chore-base-card]') as HTMLElement).getByText(label)
      ).toBeVisible();
    }
    const moreActions = within(dishwasherCard as HTMLElement).getByRole('button', {
      name: 'More actions',
    });
    await expect(moreActions).toBeVisible();
    await userEvent.click(moreActions);
    const actionsMenu = within(canvasElement.ownerDocument.body).getByRole('menu');
    await expect(within(actionsMenu).getByRole('menuitem', { name: 'Pause' })).toBeVisible();
    await userEvent.click(within(actionsMenu).getByRole('menuitem', { name: 'Delete' }));
    const deleteDialog = within(canvasElement.ownerDocument.body).getByRole('alertdialog');
    await expect(
      within(deleteDialog).getByRole('heading', { name: 'Delete “Unload dishwasher”?' })
    ).toBeVisible();
    await userEvent.click(within(deleteDialog).getByRole('button', { name: 'Cancel' }));
  },
};

export const MissionManagement: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole('region', { name: 'Today' });
    await userEvent.click(canvas.getByRole('button', { name: 'Missions' }));
    const panel = within(canvas.getByRole('region', { name: 'Missions' }));
    await expect(panel.queryByText('Household missions')).not.toBeInTheDocument();
    await expect(
      panel.queryByText('Bring a few chores together around a shared outcome.')
    ).not.toBeInTheDocument();
    const toolbar = within(panel.getByRole('region', { name: 'Household missions' }));
    await expect(toolbar.getByRole('searchbox')).toBeInTheDocument();
    const filterTrigger = toolbar.getByRole('button', { name: 'Filter' });
    await expect(filterTrigger).toBeInTheDocument();
    await expect(toolbar.getByRole('button', { name: 'Add mission' })).toBeInTheDocument();
    const missionCard = panel
      .getByRole('heading', { name: 'Saturday reset' })
      .closest('[data-chore-base-card]');
    await expect(missionCard).not.toBeNull();
    await expect(within(missionCard as HTMLElement).getByText('Active')).toBeVisible();
    await expect(
      within(missionCard as HTMLElement).getByRole('button', { name: /Edit/ })
    ).toBeVisible();
    await expect(
      within(missionCard as HTMLElement).getByRole('button', { name: 'More actions' })
    ).toBeVisible();
    await userEvent.click(filterTrigger);
    const filterMenu = within(canvasElement.ownerDocument.body).getByRole('menu');
    const statusFilter = within(filterMenu).getByLabelText('Filter by status');
    await userEvent.selectOptions(statusFilter, 'complete');
    await expect(panel.queryByRole('heading', { name: 'Saturday reset' })).not.toBeInTheDocument();
    await expect(toolbar.getByText('1')).toHaveAttribute('data-active-filter-count', 'true');
    await userEvent.selectOptions(statusFilter, 'all');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(toolbar.getByRole('button', { name: 'Add mission' }));
    const dialog = within(canvasElement.ownerDocument.body).getByRole('dialog', {
      name: 'Create mission',
    });
    await expect(dialog).toBeInTheDocument();
  },
};

export const RewardManagement: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole('region', { name: 'Today' });
    await userEvent.click(canvas.getByRole('button', { name: 'Rewards' }));
    const panel = within(canvas.getByRole('region', { name: 'Rewards' }));
    await expect(panel.queryByText('Reward goals')).not.toBeInTheDocument();
    await expect(
      panel.queryByText('Keep motivation optional, visible, and kind.')
    ).not.toBeInTheDocument();
    const toolbar = within(panel.getByRole('region', { name: 'Reward goals' }));
    await expect(toolbar.getByRole('searchbox')).toBeInTheDocument();
    const filterTrigger = toolbar.getByRole('button', { name: 'Filter' });
    await expect(filterTrigger).toBeInTheDocument();
    await expect(toolbar.getByRole('button', { name: 'Add reward' })).toBeInTheDocument();
    const rewardCard = panel
      .getByRole('heading', { name: 'Choose our next family outing' })
      .closest('[data-chore-base-card]');
    await expect(rewardCard).not.toBeNull();
    await expect(within(rewardCard as HTMLElement).getByText('Family goal')).toBeVisible();
    await expect(
      within(rewardCard as HTMLElement).getByRole('button', { name: /Edit/ })
    ).toBeVisible();
    await expect(
      within(rewardCard as HTMLElement).getByRole('button', { name: 'More actions' })
    ).toBeVisible();
    await userEvent.click(filterTrigger);
    const filterMenu = within(canvasElement.ownerDocument.body).getByRole('menu');
    const typeFilter = within(filterMenu).getByLabelText('Goal type');
    await userEvent.selectOptions(typeFilter, 'instant');
    await expect(
      panel.queryByRole('heading', { name: 'Choose our next family outing' })
    ).not.toBeInTheDocument();
    await expect(toolbar.getByText('1')).toHaveAttribute('data-active-filter-count', 'true');
  },
};

export const RewardRequests: Story = {
  render: () => <HouseholdRewardRequestsStory />,
  globals: { viewport: { value: 'mobile1' } },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole('region', { name: 'Today' });
    await userEvent.click(canvas.getByRole('button', { name: 'Rewards' }));
    const panel = within(canvas.getByRole('region', { name: 'Rewards' }));
    await expect(panel.getByRole('heading', { name: 'Reward requests' })).toBeVisible();
    await expect(panel.getByText(/Awaiting review/)).toBeVisible();
    await expect(panel.getByText(/Fulfilled/)).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Approve' })).toBeVisible();
  },
};

export const ProgressManagement: Story = {
  render: () => <HouseholdPointsStory />,
  globals: { viewport: { value: 'desktop1440p', isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole('region', { name: 'Today' });
    await userEvent.click(canvas.getByRole('button', { name: 'Progress' }));
    const panel = within(canvas.getByRole('region', { name: 'Progress' }));
    await expect(panel.queryByText('Household progress')).not.toBeInTheDocument();
    await expect(
      panel.queryByText('See each person’s contribution without ranking the family.')
    ).not.toBeInTheDocument();
    const personCard = panel
      .getByRole('heading', { name: 'Maya' })
      .closest('[data-chore-base-card]');
    if (!(personCard instanceof HTMLElement)) throw new Error('Expected Maya progress card');
    const personCardScope = within(personCard);
    await expect(personCardScope.getByText(/completed chores/)).toBeVisible();
    const addPoints = personCardScope.getByRole('button', { name: 'Add points for Maya' });
    const removePoints = personCardScope.getByRole('button', {
      name: 'Remove points for Maya',
    });
    await expect(addPoints).toBeVisible();
    await expect(removePoints).toBeVisible();
    await expect(addPoints.closest('[data-point-adjustment-control]')).toBe(
      removePoints.closest('[data-point-adjustment-control]')
    );
    await expect(personCardScope.getByRole('button', { name: 'Point history' })).toBeVisible();
    await userEvent.click(addPoints);
    const body = within(canvasElement.ownerDocument.body);
    const pinInput = await body.findByLabelText('Management PIN');
    const pinDialog = pinInput.closest('[role="dialog"]');
    if (!(pinDialog instanceof HTMLElement)) throw new Error('Expected management PIN dialog');
    await userEvent.type(pinInput, '1234');
    await userEvent.click(within(pinDialog).getByRole('button', { name: 'Unlock' }));
    const addDialog = await body.findByRole('dialog', { name: 'Add points for Maya' });
    await expect(within(addDialog).queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    await expect(
      within(addDialog).queryByRole('button', { name: 'Remove' })
    ).not.toBeInTheDocument();
    const amount = within(addDialog).getByLabelText('Amount');
    await waitFor(() => expect(amount).toHaveFocus());
    await userEvent.clear(amount);
    await userEvent.type(amount, '0');
    await expect(within(addDialog).getByRole('button', { name: 'Add points' })).toBeDisabled();
    await userEvent.clear(amount);
    await userEvent.type(amount, '30');
    const saveAddition = within(addDialog).getByRole('button', {
      name: 'Add points',
    });
    await expect(saveAddition).toBeEnabled();
    const addedBalancePreview = within(addDialog).getByText('New balance: 55');
    await expect(addedBalancePreview).toBeInTheDocument();
    await userEvent.click(saveAddition);
    await waitFor(() => expect(body.queryByText('Add points for Maya')).not.toBeInTheDocument());
    await expect(personCardScope.getByText('55')).toBeVisible();

    await userEvent.click(removePoints);
    const removeDialog = await body.findByRole('dialog', { name: 'Remove points for Maya' });
    const removeAmount = within(removeDialog).getByLabelText('Amount');
    await userEvent.clear(removeAmount);
    await userEvent.type(removeAmount, '60');
    await userEvent.type(
      within(removeDialog).getByLabelText('Reason (optional)'),
      'Corrected total'
    );
    const balancePreview = within(removeDialog).getByText('New balance: -5');
    await expect(balancePreview).toBeInTheDocument();
    await expect(balancePreview).toHaveAttribute('data-point-balance-preview', 'true');
    await userEvent.click(within(removeDialog).getByRole('button', { name: 'Remove points' }));
    await waitFor(() => expect(body.queryByText('Remove points for Maya')).not.toBeInTheDocument());
    await expect(personCardScope.getByText('-5')).toBeVisible();

    await userEvent.click(personCardScope.getByRole('button', { name: 'Point history' }));
    const pointsSheet = await body.findByRole('dialog', { name: 'Maya points' });
    const viewport = canvasElement.ownerDocument.defaultView;
    if (viewport && viewport.innerWidth >= 768) {
      const bounds = pointsSheet.getBoundingClientRect();
      await expect(Math.abs(bounds.left + bounds.width / 2 - viewport.innerWidth / 2)).toBeLessThan(
        2
      );
      await expect(
        Math.abs(bounds.top + bounds.height / 2 - viewport.innerHeight / 2)
      ).toBeLessThan(2);
    }
    await expect(within(pointsSheet).getByText('Birthday bonus')).toBeVisible();
    await expect(within(pointsSheet).getByText('Earlier balance')).toBeVisible();
    const historyTable = within(pointsSheet).getByRole('table', { name: 'Point history' });
    await expect(historyTable).toBeVisible();
    await expect(within(historyTable).getAllByRole('row')).toHaveLength(5);
    await expect(within(pointsSheet).queryByText('Sam only')).not.toBeInTheDocument();
    await expect(within(pointsSheet).getByText('Corrected total')).toBeVisible();
    await expect(within(pointsSheet).getAllByText('-5').length).toBeGreaterThan(0);
  },
};

export const ProgressPointsMobile: Story = {
  ...ProgressManagement,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

export const BadgesAndAchievements: Story = {
  render: () => <HouseholdProgressionStory />,
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole('region', { name: 'Today' });
    await userEvent.click(canvas.getByRole('button', { name: 'Progress' }));
    const panel = within(canvas.getByRole('region', { name: 'Progress' }));
    await expect(panel.getByText('Weekly helper')).toBeVisible();
    await expect(panel.getByText('Dishwasher expert')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Add badge' })).toBeVisible();
  },
};

export const EmptyPointHistory: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole('region', { name: 'Today' });
    await userEvent.click(canvas.getByRole('button', { name: 'Progress' }));
    const panel = within(canvas.getByRole('region', { name: 'Progress' }));
    const personCard = panel
      .getByRole('heading', { name: 'Maya' })
      .closest('[data-chore-base-card]');
    if (!(personCard instanceof HTMLElement)) throw new Error('Expected Maya progress card');
    await userEvent.click(within(personCard).getByRole('button', { name: 'Point history' }));
    const pointsSheet = await within(canvasElement.ownerDocument.body).findByRole('dialog', {
      name: 'Maya points',
    });
    await expect(within(pointsSheet).getByText('Current balance')).toBeVisible();
    await expect(
      within(pointsSheet).queryByRole('heading', { name: 'Point history' })
    ).not.toBeInTheDocument();
    await expect(within(pointsSheet).queryByText('No point changes yet.')).not.toBeInTheDocument();
  },
};

export const ProgressPointsLightTheme: Story = {
  ...ProgressManagement,
  globals: { theme: 'light', viewport: { value: 'mobile1', isRotated: false } },
};

export const ProgressPointsDarkTheme: Story = {
  ...ProgressManagement,
  globals: { theme: 'dark', viewport: { value: 'mobile1', isRotated: false } },
};

export const ProgressPointsBlackTheme: Story = {
  ...ProgressManagement,
  globals: { theme: 'black', viewport: { value: 'mobile1', isRotated: false } },
};

export const SettingsAndRecovery: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Responsive settings workspace covering optional motivation, people, and installation-owned data and recovery controls.',
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole('region', { name: 'Today' });
    await userEvent.click(canvas.getByRole('button', { name: 'Settings' }));
    const panel = within(canvas.getByRole('region', { name: 'Settings' }));
    const workspace = panel.getByRole('region', { name: 'Chore settings' });
    const navigation = within(workspace).getByRole('navigation', { name: 'Chore settings' });
    await expect(workspace).toHaveAttribute('data-chore-settings-workspace');
    await expect(
      within(navigation).getByRole('button', { name: 'Motivation style' })
    ).toHaveAttribute('aria-current', 'page');
    const motivationPanel = within(workspace).getByRole('main', { name: 'Motivation style' });
    await expect(within(motivationPanel).getByText(/Example:/)).toBeVisible();
    await expect(
      within(motivationPanel).getByText(
        'Puts everyone’s points toward a shared reward. Example: reach 500 points to choose the next family outing.'
      )
    ).toBeVisible();
    await userEvent.click(within(navigation).getByRole('button', { name: 'Data and recovery' }));
    const recoveryPanel = within(workspace).getByRole('main', { name: 'Data and recovery' });
    await expect(recoveryPanel).toBeInTheDocument();
    await expect(within(workspace).getByRole('button', { name: 'Download backup' })).toBeVisible();
    await expect(
      within(recoveryPanel).queryByRole('combobox', { name: 'Motivation style' })
    ).toBeNull();
  },
};

export const VacationDueDateReview: Story = {
  render: () => <HouseholdVacationReviewStory />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole('region', { name: 'Today' });
    await userEvent.click(canvas.getByRole('button', { name: 'Settings' }));
    const settings = within(canvas.getByRole('region', { name: 'Settings' }));
    await userEvent.click(settings.getByRole('button', { name: 'People' }));
    await userEvent.click(settings.getByRole('button', { name: 'Review due dates' }));
    const dialog = within(
      within(canvasElement.ownerDocument.body).getByRole('dialog', { name: 'Review due dates' })
    );
    await expect(
      dialog.getByText(/Selected chores move to consecutive days/, { selector: 'span' })
    ).toBeInTheDocument();
    await expect(dialog.getByRole('button', { name: 'Move selected chores' })).toBeEnabled();
  },
};

export const ReturnsToTodayAfterSetupAndImport: Story = {
  render: () => <HouseholdImportNavigationStory />,
  parameters: {
    docs: {
      description: {
        story:
          'Completing setup after a reset and importing a backup from Settings both return the household to Today.',
      },
    },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole('region', { name: 'Today' });
    await userEvent.click(canvas.getByRole('button', { name: 'Settings' }));

    const completedWorkspace = useChoreWorkspaceStore.getState().data;
    if (!completedWorkspace) throw new Error('Expected the completed chore workspace');
    const experience = normalizeChoreExperienceState(completedWorkspace.experience);
    await act(async () => {
      useChoreWorkspaceStore.getState().setPreviewDocument({
        data: {
          ...completedWorkspace,
          experience: {
            ...experience,
            setupStartedAt: experience.setupStartedAt ?? '2026-08-15T08:00:00.000Z',
            setupCompletedAt: undefined,
          },
        },
      });
    });
    await canvas.findByRole('region', { name: 'Make household work easier to share.' });

    await act(async () => {
      useChoreWorkspaceStore.getState().setPreviewDocument({ data: completedWorkspace });
    });
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Settings' }));
    const settings = within(canvas.getByRole('region', { name: 'Settings' }));
    const workspace = settings.getByRole('region', { name: 'Chore settings' });
    await userEvent.click(within(workspace).getByRole('button', { name: 'Data and recovery' }));
    const backup = createChoreInterchangeDocument({
      workspace: completedWorkspace,
      events: [],
      exportedAt: '2026-08-15T08:30:00.000Z',
    });
    await userEvent.upload(
      within(workspace).getByLabelText('Import backup'),
      new File([JSON.stringify(backup)], 'navet-chores.json', { type: 'application/json' })
    );
    const confirmation = within(canvasElement.ownerDocument.body).getByRole('alertdialog', {
      name: 'Restore chores backup?',
    });
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Replace' }));
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
    );
  },
};

export const ManagementPinSettings: Story = {
  render: () => <HouseholdProtectedStory />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole('region', { name: 'Today' });
    await userEvent.click(canvas.getByRole('button', { name: 'Settings' }));
    const workspace = within(canvas.getByRole('region', { name: 'Settings' })).getByRole('region', {
      name: 'Chore settings',
    });
    const navigation = within(workspace).getByRole('navigation', { name: 'Chore settings' });
    await userEvent.click(within(navigation).getByRole('button', { name: 'Management PIN' }));
    const protectionPanel = within(workspace).getByRole('main', { name: 'Management PIN' });
    await expect(within(protectionPanel).getByText('On')).toBeVisible();
    const removePin = within(protectionPanel).getByRole('button', { name: 'Remove PIN' });
    await expect(removePin).toBeVisible();
    await userEvent.click(removePin);
    const confirmation = within(canvasElement.ownerDocument.body).getByRole('alertdialog', {
      name: 'Remove management PIN?',
    });
    await expect(
      within(confirmation).getByText(/Anyone with dashboard access can change chores/)
    ).toBeVisible();
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
    await userEvent.click(within(protectionPanel).getByRole('button', { name: 'Change PIN' }));
    const dialog = within(canvasElement.ownerDocument.body).getByRole('dialog', {
      name: 'Change PIN',
    });
    await waitFor(() => expect(within(dialog).getByLabelText('New management PIN')).toBeVisible());
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Confirm new management PIN')).toBeVisible()
    );
  },
};

function UpcomingChoresStory({ library = false, days = 3 }: { library?: boolean; days?: number }) {
  const data = createChoreDemoWorkspace({ copy: DEMO_COPY, mode: 'off' });
  const next = new Date();
  next.setDate(next.getDate() + days);
  next.setHours(16, 30, 0, 0);
  const occurrence = data.occurrencesById['today-dishwasher'];
  data.participantsById.maya.color = '#f97316';
  data.definitionsById.dishwasher.description = 'Put the clean dishes back in their cupboards.';
  data.occurrencesById = {
    future: {
      ...occurrence,
      id: 'future',
      scheduledAt: next.toISOString(),
      dueAt: next.toISOString(),
      status: 'available',
    },
  };
  if (library)
    return (
      <AllChoresView
        data={data}
        onAdd={() => {}}
        onEdit={() => {}}
        onDuplicate={() => {}}
        onToggleEnabled={() => {}}
        onArchive={() => {}}
        onDelete={() => {}}
        onRestore={() => {}}
      />
    );
  return (
    <ChoreTodayView
      data={data}
      participants={Object.values(data.participantsById)}
      selectedParticipantId="all"
      onSelectedParticipantChange={() => {}}
      execute={async () => true}
      onAddChore={() => {}}
    />
  );
}

export const EmptyTodayWithUpcomingChore: Story = {
  render: () => <UpcomingChoresStory />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Next 7 days')).toBeVisible();
    const upcoming = within(canvas.getByRole('region', { name: 'Next 7 days' }));
    await expect(upcoming.getByText('Unload dishwasher')).toBeVisible();
    const next = new Date();
    next.setDate(next.getDate() + 3);
    await expect(
      upcoming.getByText(
        new RegExp(
          next.toLocaleDateString('en', {
            month: 'short',
            day: 'numeric',
          })
        )
      )
    ).toBeVisible();
    await expect(upcoming.queryByRole('button', { name: 'Mark done' })).not.toBeInTheDocument();
  },
};

export const UpcomingChoreMobile: Story = {
  ...EmptyTodayWithUpcomingChore,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

export const LibraryNextScheduledDate: Story = {
  render: () => <UpcomingChoresStory library days={12} />,
  play: async ({ canvas }) => {
    const next = canvas.getByText(/^Next: /);
    await expect(next).toBeVisible();
    await expect(next.closest('.navet-entity-card-header')).toBeInTheDocument();
  },
};

export const LaterChoresStayOutOfToday: Story = {
  render: () => <UpcomingChoresStory days={12} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Nothing needs doing today')).toBeVisible();
    await expect(canvas.queryByText('Next 7 days')).not.toBeInTheDocument();
    await expect(canvas.queryByText('Unload dishwasher')).not.toBeInTheDocument();
  },
};

export const MissedScheduledHistory: Story = {
  render: () => <HouseholdPointsStory missedHistory />,
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole('region', { name: 'Today' });
    const data = useChoreWorkspaceStore.getState().data;
    if (!data) throw new Error('Expected chore workspace');
    const schedule = data.definitionsById.dishwasher.schedule;
    const todayIds = [
      ...canvas.getByRole('region', { name: 'Today' }).querySelectorAll('[data-chore-status]'),
    ].map((element) => element.textContent);
    await expect(todayIds).not.toContain('Missed');
    await userEvent.click(canvas.getByRole('button', { name: 'Progress' }));
    const history = within(await canvas.findByRole('region', { name: 'History and export' }));
    await expect(history.getByText('Missed')).toBeVisible();
    await expect(history.getByRole('heading', { name: 'Unload dishwasher' })).toBeVisible();
    await userEvent.click(history.getByRole('button', { name: 'Mark done' }));
    await waitFor(() =>
      expect(
        useChoreWorkspaceStore.getState().data?.occurrencesById['missed-history-dishwasher'].status
      ).toBe('done')
    );
    await expect(
      useChoreWorkspaceStore.getState().data?.definitionsById.dishwasher.schedule
    ).toEqual(schedule);
  },
};
