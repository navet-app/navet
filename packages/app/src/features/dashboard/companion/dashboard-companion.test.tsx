import { mapNavetEntitiesToDeviceCollection } from '@navet/app/core/navet-device-collections';
import { DemoChoreWorkspace } from '@navet/app/demo/demo-chore-workspace';
import * as deviceCollections from '@navet/app/hooks/use-devices';
import {
  getPreviewRuntimeScenario,
  installPreviewRuntime,
  resetPreviewRuntime,
  withPreviewEntities,
} from '@navet/app/preview/runtime';
import { useEditModeStore } from '@navet/app/stores/edit-mode-store';
import { integrationStore } from '@navet/app/stores/integration-store';
import { useNavigationStore } from '@navet/app/stores/navigation-store';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardCollectionStore } from '../dashboards/dashboard-collection-store';
import { useRoomWorkspaceStore } from '../rooms/room-workspace-store';
import {
  createEmptyRoomWorkspaceV2,
  createNavetRoomWorkspaceRoomV2,
  type RoomWorkspaceRoomId,
  renameRoomWorkspaceRoomV2,
} from '../rooms/room-workspace-v2';
import { CompanionAddCardDialog } from './companion-editor';
import { DashboardCompanion } from './dashboard-companion';

vi.mock('@navet/app/hooks/use-resource-url', () => ({
  useResourceUrl: (url: string | null) => url,
}));

const KITCHEN_ROOM_ID = 'room_kitchen1' as RoomWorkspaceRoomId;

describe('dashboard companion connected state', () => {
  beforeEach(async () => {
    await resetAppStores();
    installPreviewRuntime(getPreviewRuntimeScenario('demo'));
  });
  afterEach(() => {
    cleanup();
    resetPreviewRuntime();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function selectKitchen() {
    const { workspace, roomId } = createNavetRoomWorkspaceRoomV2(
      createEmptyRoomWorkspaceV2(),
      { displayName: 'Kitchen' },
      () => KITCHEN_ROOM_ID
    );
    useRoomWorkspaceStore.getState().replaceWorkspace(workspace);
    useNavigationStore.setState({
      currentRoom: 'Kitchen',
      currentRoomId: roomId,
      activeSection: 'home',
    });
    const store = useDashboardCollectionStore.getState();
    store.updateCompanion(store.activeDashboardId, {
      showSecurity: false,
      cards: [{ id: 'common-note', type: 'note', text: 'Common panel note' }],
    });
    return store;
  }

  async function openPanelMenu(room = 'Kitchen') {
    fireEvent.pointerDown(screen.getByRole('button', { name: `Panel for ${room}` }), {
      button: 0,
      ctrlKey: false,
    });
    return within(await screen.findByRole('menu'));
  }

  async function createRoomPanel(room = 'Kitchen') {
    const menu = await openPanelMenu(room);
    fireEvent.click(menu.getByRole('menuitem', { name: 'Create room panel' }));
  }

  async function editNote(text: string) {
    fireEvent.click(screen.getByRole('button', { name: 'Edit Note' }));
    fireEvent.change(screen.getByLabelText('Note text'), { target: { value: text } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }));
  }

  it.each(['greeting', 'camera'] as const)(
    'uses the standard visible editor header and dismissal controls for %s',
    async (type) => {
      const store = useDashboardCollectionStore.getState();
      store.updateCompanion(store.activeDashboardId, {
        showSecurity: false,
        cards: [{ id: 'editable', type, ...(type === 'greeting' ? { text: 'Hello' } : {}) }],
      });
      renderWithProviders(<DashboardCompanion editing />);
      const title = type === 'greeting' ? 'Edit Greeting' : 'Edit Camera';
      const opener = screen.getByRole('button', { name: title });
      opener.focus();
      fireEvent.click(opener);
      const dialog = await screen.findByRole('dialog', { name: title });
      expect(within(dialog).getByRole('heading', { name: title })).toBeVisible();
      expect(within(dialog).getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0);
      if (type === 'greeting') {
        fireEvent.change(within(dialog).getByRole('textbox', { name: 'Greeting' }), {
          target: { value: 'Good evening' },
        });
        expect(
          useDashboardCollectionStore.getState().collection.dashboardsById[store.activeDashboardId]
            .companion?.cards?.[0].text
        ).toBe('Good evening');
      } else {
        const source = Object.values(
          integrationStore.getState().providerEntitiesByCanonicalId
        ).find((entity) => entity.type === 'camera');
        if (!source) throw new Error('Missing preview camera');
        const field = within(dialog).getByRole('combobox', { name: 'Device' });
        expect(field).toHaveValue('');
        fireEvent.change(field, { target: { value: source.canonicalId } });
        expect(
          useDashboardCollectionStore.getState().collection.dashboardsById[store.activeDashboardId]
            .companion?.cameraEntityId
        ).toBe(source.canonicalId);
      }
      fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
      await waitFor(() => expect(opener).toHaveFocus());
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
  );

  it.each(['camera', 'weather'] as const)(
    'edits and moves %s sources as one group',
    async (type) => {
      const source = getPreviewRuntimeScenario('demo').entities.find(
        (entity) => entity.type === type
      );
      if (!source) throw new Error(`Missing preview ${type}`);
      const secondSource = { ...source, canonicalId: `${source.canonicalId}_second` };
      installPreviewRuntime(
        withPreviewEntities(getPreviewRuntimeScenario('demo'), [
          ...getPreviewRuntimeScenario('demo').entities,
          secondSource,
        ])
      );
      const store = useDashboardCollectionStore.getState();
      store.updateCompanion(store.activeDashboardId, {
        showSecurity: false,
        cards: [
          { id: 'first', type, entityId: source.canonicalId },
          { id: 'note', type: 'note', text: 'Keep this note' },
          { id: 'second', type, entityId: secondSource.canonicalId },
        ],
      });
      renderWithProviders(<DashboardCompanion editing />);
      const title = type === 'camera' ? 'Camera' : 'Weather';
      expect(screen.getAllByRole('button', { name: `Reorder ${title}` })).toHaveLength(1);
      fireEvent.pointerDown(screen.getByRole('button', { name: `More actions: ${title}` }), {
        button: 0,
        ctrlKey: false,
      });
      fireEvent.click(
        within(await screen.findByRole('menu')).getByRole('menuitem', {
          name: `Move ${title} down`,
        })
      );
      const saved = () =>
        useDashboardCollectionStore.getState().collection.dashboardsById[store.activeDashboardId]
          .companion?.cards;
      expect(saved()?.map((card) => card.id)).toEqual(['note', 'first', 'second']);
      fireEvent.click(screen.getByRole('button', { name: `Edit ${title}` }));
      const dialog = within(await screen.findByRole('dialog', { name: `Edit ${title}` }));
      expect(dialog.getAllByRole('combobox', { name: 'Device' })).toHaveLength(2);
      fireEvent.click(dialog.getAllByRole('button', { name: `Remove ${source.name}` })[1]);
      expect(saved()?.map((card) => card.id)).toEqual(['note', 'first']);
    }
  );

  it.each(['camera', 'weather'] as const)(
    'recognizes the automatic %s source and removes duplicate entries with a toast',
    (type) => {
      const source = getPreviewRuntimeScenario('demo').entities.find(
        (entity) => entity.type === type
      );
      if (!source) throw new Error(`Missing preview ${type}`);
      const success = vi.spyOn(toast, 'success').mockReturnValue('removed');
      const store = useDashboardCollectionStore.getState();
      store.updateCompanion(store.activeDashboardId, {
        showSecurity: false,
        cards: [
          { id: 'automatic', type },
          { id: 'duplicate', type, entityId: source.canonicalId },
        ],
      });
      const { container } = renderWithProviders(<DashboardCompanion editing />);
      expect(container.querySelector('[data-companion-card-id="automatic"]')).toBeInTheDocument();
      expect(
        container.querySelector('[data-companion-card-id="duplicate"]')
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
      const dialog = within(screen.getByRole('dialog'));
      fireEvent.change(dialog.getByPlaceholderText('Search entities'), {
        target: { value: source.name },
      });
      expect(dialog.getByRole('button', { name: `Remove item: ${source.name}` })).toBeEnabled();
      fireEvent.click(dialog.getByRole('button', { name: `Remove item: ${source.name}` }));
      expect(
        useDashboardCollectionStore.getState().collection.dashboardsById[store.activeDashboardId]
          .companion?.cards
      ).toEqual([]);
      expect(success).toHaveBeenCalledWith(`Removed ${source.name}`);
      expect(
        dialog
          .getAllByRole('button', { name: `Add item: ${source.name}` })
          .every((button) => !button.hasAttribute('disabled'))
      ).toBe(true);
    }
  );

  it.each([false, true])(
    'renders individually selected locks only once alongside the security summary (editing=%s)',
    (editing) => {
      const lock = getPreviewRuntimeScenario('demo').entities.find(
        (entity) => entity.type === 'lock'
      );
      if (!lock) throw new Error('Missing preview lock');
      const store = useDashboardCollectionStore.getState();
      store.updateCompanion(store.activeDashboardId, {
        showSecurity: true,
        cards: [
          { id: 'security', type: 'security' },
          { id: 'lock', type: 'entity', entityId: lock.canonicalId },
          { id: 'duplicate-lock', type: 'entity', entityId: lock.canonicalId },
        ],
      });
      const { container } = renderWithProviders(<DashboardCompanion editing={editing} />);
      expect(
        screen.getAllByRole('button', { name: `Open settings for ${lock.name}` })
      ).toHaveLength(1);
      expect(
        container.querySelector('[data-companion-card-id="duplicate-lock"]')
      ).not.toBeInTheDocument();
    }
  );

  it('finishes customization from the panel without changing saved content', () => {
    const store = selectKitchen();
    const before =
      useDashboardCollectionStore.getState().collection.dashboardsById[store.activeDashboardId];
    useEditModeStore.getState().setEditMode(true);
    renderWithProviders(<DashboardCompanion />);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(useEditModeStore.getState().isEditMode).toBe(false);
    expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeInTheDocument();
    expect(screen.getByText('Common panel note')).toBeInTheDocument();
    expect(
      useDashboardCollectionStore.getState().collection.dashboardsById[store.activeDashboardId]
    ).toEqual(before);
  });

  it.each(['Kitchen', 'Unassigned'])(
    'can customize %s before room management has ever been opened',
    async (roomName) => {
      useRoomWorkspaceStore.setState({ workspace: null });
      useNavigationStore.setState({
        currentRoom: roomName,
        currentRoomId: null,
        activeSection: 'home',
      });
      renderWithProviders(<DashboardCompanion editing />);
      const scope = await screen.findByRole('button', { name: `Panel for ${roomName}` });
      expect(scope).toHaveTextContent('Dashboard panel');
      expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument();
      await createRoomPanel(roomName);
      expect(scope).toHaveTextContent(`${roomName} panel`);
      const room = useRoomWorkspaceStore
        .getState()
        .workspace?.rooms.find((item) => item.displayName === roomName);
      if (!room) throw new Error('Expected a stable room identity');
      const store = useDashboardCollectionStore.getState();
      expect(
        store.collection.dashboardsById[store.activeDashboardId].roomCompanions?.[room.id]
      ).toBeDefined();
    }
  );

  it('resolves a saved room panel on reload from a legacy name-only selection without entering edit mode', () => {
    const store = selectKitchen();
    store.updateRoomCompanion(store.activeDashboardId, KITCHEN_ROOM_ID, {
      showSecurity: false,
      cards: [{ id: 'saved', type: 'note', text: 'Saved kitchen panel' }],
    });
    useNavigationStore.setState({ currentRoomId: null });
    renderWithProviders(<DashboardCompanion />);
    expect(screen.getByText('Saved kitchen panel')).toBeInTheDocument();
  });

  it('edits the shared dashboard panel directly from a room without creating a room panel', async () => {
    const store = selectKitchen();
    const view = renderWithProviders(<DashboardCompanion />);
    expect(screen.getByText('Common panel note')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Panel for Kitchen' })).not.toBeInTheDocument();
    view.rerender(<DashboardCompanion editing />);
    expect(screen.getByRole('button', { name: 'Panel for Kitchen' })).toHaveTextContent(
      'Dashboard panel'
    );
    expect(screen.getByRole('button', { name: 'Panel for Kitchen' })).toHaveAccessibleDescription(
      'Dashboard panel Changes apply wherever this dashboard panel is used.'
    );
    expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions: Note' })).toBeInTheDocument();
    await editNote('Updated common note');
    const dashboard =
      useDashboardCollectionStore.getState().collection.dashboardsById[store.activeDashboardId];
    expect(dashboard.companion?.cards?.[0].text).toBe('Updated common note');
    expect(dashboard.roomCompanions?.[KITCHEN_ROOM_ID]).toBeUndefined();
    act(() => useNavigationStore.getState().setCurrentRoom('All'));
    expect(screen.getByText('Updated common note')).toBeInTheDocument();
  });

  it('starts a custom room panel from common content and keeps an empty override independent', async () => {
    const store = selectKitchen();
    renderWithProviders(<DashboardCompanion editing />);
    await createRoomPanel();
    expect(screen.getByText('Common panel note')).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions: Note' }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove Note' }));
    expect(screen.getByText('Add items to your side panel.')).toBeInTheDocument();
    const dashboard =
      useDashboardCollectionStore.getState().collection.dashboardsById[store.activeDashboardId];
    expect(dashboard.roomCompanions?.room_kitchen1.cards).toEqual([]);
    expect(dashboard.companion?.cards?.[0].text).toBe('Common panel note');
    act(() => useNavigationStore.getState().setCurrentRoom('All'));
    expect(screen.getByText('Common panel note')).toBeInTheDocument();
    act(() => useNavigationStore.getState().setCurrentRoom('Kitchen', { roomId: KITCHEN_ROOM_ID }));
    expect(screen.getByText('Add items to your side panel.')).toBeInTheDocument();
  });

  it('switches panels without confirmation or deletion and routes edits to the selected panel', async () => {
    const store = selectKitchen();
    store.updateRoomCompanion(store.activeDashboardId, KITCHEN_ROOM_ID, {
      showSecurity: false,
      cards: [{ id: 'room-note', type: 'note', text: 'Kitchen only' }],
    });
    const view = renderWithProviders(<DashboardCompanion editing />);
    fireEvent.click(
      (await openPanelMenu()).getByRole('menuitemradio', { name: 'Dashboard panel' })
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByText('Common panel note')).toBeInTheDocument();
    await editNote('New common panel');
    expect(
      useDashboardCollectionStore.getState().collection.dashboardsById[store.activeDashboardId]
        .roomCompanions?.[KITCHEN_ROOM_ID].cards?.[0].text
    ).toBe('Kitchen only');
    fireEvent.click((await openPanelMenu()).getByRole('menuitemradio', { name: 'Kitchen panel' }));
    expect(screen.getByText('Kitchen only')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Panel for Kitchen' })).toHaveAccessibleDescription(
      'Kitchen panel'
    );
    await editNote('Updated Kitchen only');
    expect(
      useDashboardCollectionStore.getState().collection.dashboardsById[store.activeDashboardId]
        .companion?.cards?.[0].text
    ).toBe('New common panel');
    fireEvent.click(
      (await openPanelMenu()).getByRole('menuitemradio', { name: 'Dashboard panel' })
    );
    view.rerender(<DashboardCompanion />);
    expect(screen.getByText('New common panel')).toBeInTheDocument();
    view.rerender(<DashboardCompanion editing />);
    fireEvent.click((await openPanelMenu()).getByRole('menuitemradio', { name: 'Kitchen panel' }));
    expect(screen.getByText('Updated Kitchen only')).toBeInTheDocument();
  });

  it.each(['room', 'dashboard'] as const)(
    'deletes a saved room panel only after confirmation while using the %s panel',
    async (mode) => {
      const store = selectKitchen();
      store.updateRoomCompanion(store.activeDashboardId, KITCHEN_ROOM_ID, {
        showSecurity: false,
        cards: [{ id: 'room-note', type: 'note', text: 'Kitchen only' }],
      });
      store.selectRoomCompanion(store.activeDashboardId, KITCHEN_ROOM_ID, mode);
      renderWithProviders(<DashboardCompanion editing />);
      fireEvent.click((await openPanelMenu()).getByRole('menuitem', { name: 'Delete room panel' }));
      fireEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' })
      );
      expect(
        useDashboardCollectionStore.getState().collection.dashboardsById[store.activeDashboardId]
          .roomCompanions?.[KITCHEN_ROOM_ID]
      ).toBeDefined();
      fireEvent.click((await openPanelMenu()).getByRole('menuitem', { name: 'Delete room panel' }));
      fireEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete room panel' })
      );
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Panel for Kitchen' })).toHaveFocus()
      );
      expect(screen.getByText('Common panel note')).toBeInTheDocument();
      expect(
        useDashboardCollectionStore.getState().collection.dashboardsById[store.activeDashboardId]
          .roomCompanions?.[KITCHEN_ROOM_ID]
      ).toBeUndefined();
    }
  );

  it('keeps a room panel through renaming, uses common content in feature sections and isolates saved dashboards', () => {
    const store = selectKitchen();
    store.updateRoomCompanion(store.activeDashboardId, KITCHEN_ROOM_ID, {
      showSecurity: false,
      cards: [{ id: 'room-note', type: 'note', text: 'Kitchen only' }],
    });
    renderWithProviders(<DashboardCompanion editing />);
    act(() =>
      useRoomWorkspaceStore
        .getState()
        .replaceWorkspace(
          renameRoomWorkspaceRoomV2(
            useRoomWorkspaceStore.getState().workspace,
            KITCHEN_ROOM_ID,
            'Family kitchen'
          )
        )
    );
    expect(screen.getByRole('button', { name: 'Panel for Family kitchen' })).toHaveTextContent(
      'Family kitchen panel'
    );
    expect(screen.getByText('Kitchen only')).toBeInTheDocument();
    act(() => useNavigationStore.getState().setActiveSection('energy'));
    expect(screen.getByText('Common panel note')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Panel for Family kitchen' })
    ).not.toBeInTheDocument();
    act(() => {
      const { dashboardId } = store.createDashboard({
        name: 'Upstairs',
        source: { kind: 'blank' },
      });
      store.updateCompanion(dashboardId, {
        showSecurity: false,
        cards: [{ id: 'other', type: 'note', text: 'Other dashboard' }],
      });
      store.activateDashboard(dashboardId);
      useNavigationStore.getState().setActiveSection('home');
    });
    expect(screen.getByText('Other dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Kitchen only')).not.toBeInTheDocument();
  });

  it.each(['camera', 'weather'] as const)(
    'adds several %s sources immediately without leaving the picker',
    (type) => {
      const scenario = getPreviewRuntimeScenario('demo');
      const source = scenario.entities.find((entity) => entity.type === type);
      if (!source) throw new Error(`Missing preview ${type}`);
      const sources = ['Alpha', 'Beta'].map((name) => ({
        ...source,
        name: `${name} source`,
        id: `${type}.bulk_${name.toLowerCase()}`,
        externalId: `${type}.bulk_${name.toLowerCase()}`,
        canonicalId: `${source.providerId}:${type}.bulk_${name.toLowerCase()}`,
      }));
      installPreviewRuntime(withPreviewEntities(scenario, [...scenario.entities, ...sources]));
      const store = useDashboardCollectionStore.getState();
      store.updateCompanion(store.activeDashboardId, {
        showSecurity: false,
        cards: [{ id: 'existing', type: 'note', text: 'Keep this note' }],
      });
      renderWithProviders(<DashboardCompanion editing />);
      fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
      fireEvent.change(screen.getByPlaceholderText('Search entities'), {
        target: { value: 'Alpha source' },
      });
      const dialog = within(screen.getByRole('dialog'));
      fireEvent.click(dialog.getByRole('button', { name: 'Add item: Alpha source' }));
      fireEvent.change(dialog.getByPlaceholderText('Search entities'), {
        target: { value: 'Beta source' },
      });
      fireEvent.click(dialog.getByRole('button', { name: 'Add item: Beta source' }));
      fireEvent.change(dialog.getByPlaceholderText('Search entities'), {
        target: { value: 'Alpha source' },
      });
      expect(
        dialog.queryByRole('button', { name: 'Add item: Alpha source' })
      ).not.toBeInTheDocument();
      const state = useDashboardCollectionStore.getState();
      const cards = state.collection.dashboardsById[state.activeDashboardId].companion?.cards;
      expect(cards).toHaveLength(3);
      expect(cards?.[0]).toMatchObject({ id: 'existing', text: 'Keep this note' });
      expect(cards?.slice(1)).toEqual(
        sources.map((entity) => ({
          id: expect.any(String),
          type,
          entityId: entity.canonicalId,
        }))
      );
      expect(new Set(cards?.map((card) => card.id)).size).toBe(3);
      expect(screen.getByRole('dialog', { name: 'Add item' })).toBeInTheDocument();
      fireEvent.click(dialog.getByRole('button', { name: 'Remove item: Alpha source' }));
      expect(
        useDashboardCollectionStore.getState().collection.dashboardsById[state.activeDashboardId]
          .companion?.cards
      ).toHaveLength(2);
      fireEvent.click(dialog.getByRole('button', { name: 'Add item: Alpha source' }));
      fireEvent.click(dialog.getByRole('button', { name: 'Done' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
      fireEvent.change(screen.getByPlaceholderText('Search entities'), {
        target: { value: 'Alpha source' },
      });
      expect(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: 'Remove item: Alpha source',
        })
      ).toBeEnabled();
    }
  );

  it('lists lawn mowers separately from vacuums in the picker', () => {
    const vacuum = getPreviewRuntimeScenario('demo').entities.find(
      (entity) => entity.type === 'vacuum'
    );
    if (!vacuum) throw new Error('Missing preview vacuum');
    renderWithProviders(
      <CompanionAddCardDialog
        entities={[
          vacuum,
          {
            ...vacuum,
            canonicalId: 'home_assistant:lawn_mower.navimow',
            externalId: 'lawn_mower.navimow',
            name: 'Navimow',
          },
        ]}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Lawn mower/ }));
    expect(screen.getByRole('button', { name: 'Add item: Navimow' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: `Add item: ${vacuum.name}` })
    ).not.toBeInTheDocument();
  });

  it('disables additions but allows removal when the panel reaches its item limit', () => {
    const source = getPreviewRuntimeScenario('demo').entities.find(
      (entity) => entity.type === 'camera'
    );
    if (!source) throw new Error('Missing preview camera');
    const entities = ['Alpha', 'Beta'].map((name) => ({
      ...source,
      name,
      canonicalId: `${source.canonicalId}_${name}`,
    }));
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const onClose = vi.fn();
    const { rerender } = renderWithProviders(
      <CompanionAddCardDialog
        entities={entities}
        remainingCapacity={1}
        onAdd={onAdd}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add item: Alpha' }));
    expect(onAdd).toHaveBeenCalledWith([
      { id: expect.any(String), type: 'camera', entityId: entities[0].canonicalId },
    ]);
    expect(onClose).not.toHaveBeenCalled();
    rerender(
      <CompanionAddCardDialog
        entities={entities}
        remainingCapacity={0}
        cards={[{ id: 'existing-camera', type: 'camera', entityId: entities[0].canonicalId }]}
        onRemove={onRemove}
        onAdd={onAdd}
        onClose={onClose}
      />
    );
    expect(screen.getByRole('button', { name: 'Add item: Beta' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove item: Alpha' }));
    expect(onRemove).toHaveBeenCalledWith(['existing-camera']);
    fireEvent.click(screen.getByRole('button', { name: 'Add item: Beta' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('You can add up to 64 items.');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes a room editor before changing panel context', async () => {
    selectKitchen();
    renderWithProviders(<DashboardCompanion editing />);
    await createRoomPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => useNavigationStore.getState().setCurrentRoom('All'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useDashboardCollectionStore.getState().companionCustomizationOpen).toBe(false);
  });

  it('loads weather from the feature collection when the provider does not index weather entities', async () => {
    const source = Object.values(integrationStore.getState().providerEntitiesByCanonicalId).find(
      (entity) => entity.type === 'weather'
    );
    if (!source) throw new Error('Missing preview weather');
    const weather = mapNavetEntitiesToDeviceCollection([source]).weather;
    vi.spyOn(deviceCollections, 'useWeatherDevicesCollection').mockReturnValue(weather);
    integrationStore.setState((state) => ({
      providerEntitiesByCanonicalId: Object.fromEntries(
        Object.entries(state.providerEntitiesByCanonicalId).filter(
          ([id]) => id !== source.canonicalId
        )
      ),
      providerEntitiesByProviderId: {
        ...state.providerEntitiesByProviderId,
        [source.providerId]: Object.fromEntries(
          Object.entries(state.providerEntitiesByProviderId[source.providerId] ?? {}).filter(
            ([, entity]) => entity.canonicalId !== source.canonicalId
          )
        ),
      },
    }));
    const store = useDashboardCollectionStore.getState();
    store.updateCompanion(store.activeDashboardId, {
      showSecurity: false,
      cards: [{ id: 'weather', type: 'weather', entityId: source.canonicalId }],
    });
    renderWithProviders(<DashboardCompanion />);
    expect(screen.getByText('64.4°F')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Open settings for ${source.name}` }));
    const dialog = await screen.findByRole('dialog', { name: 'Stockholm' });
    expect(within(dialog).getByRole('radio', { name: 'Weekly' })).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it.each(['weather', 'camera', 'alarm'] as const)(
    'preserves an offline %s selection on reorder and clears it on removal',
    async (type) => {
      const source = Object.values(integrationStore.getState().providerEntitiesByCanonicalId).find(
        (entity) =>
          type === 'alarm' ? Boolean(entity.attributes.alarmState) : entity.type === type
      );
      if (!source) throw new Error(`Missing preview ${type}`);
      const store = useDashboardCollectionStore.getState();
      const selection =
        type === 'alarm'
          ? 'showSecurity'
          : type === 'weather'
            ? 'weatherEntityId'
            : 'cameraEntityId';
      store.updateCompanion(store.activeDashboardId, {
        showSecurity: false,
        [selection]: type === 'alarm' ? true : source.canonicalId,
        cards: [
          { id: 'source', type: 'entity', entityId: source.canonicalId },
          { id: 'clock', type: 'clock' },
        ],
      });
      integrationStore.setState({ selectedProviderIds: [] });
      renderWithProviders(<DashboardCompanion editing />);
      fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions: Clock and date' }), {
        button: 0,
        ctrlKey: false,
      });
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Move Clock and date up' }));
      expect(
        useDashboardCollectionStore.getState().collection.dashboardsById[store.activeDashboardId]
          .companion?.[selection]
      ).toBe(type === 'alarm' ? true : source.canonicalId);
      fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions: Device' }), {
        button: 0,
        ctrlKey: false,
      });
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove Device' }));
      expect(
        useDashboardCollectionStore.getState().collection.dashboardsById[store.activeDashboardId]
          .companion?.[selection]
      ).toBe(type === 'alarm' ? false : null);
    }
  );

  it.each(['lock', 'weather', 'alarm'])(
    'opens the selected %s card without navigating or changing its state',
    async (type) => {
      const entity = Object.values(integrationStore.getState().providerEntitiesByCanonicalId).find(
        (item) => (type === 'alarm' ? Boolean(item.attributes.alarmState) : item.type === type)
      );
      if (!entity) throw new Error(`Missing preview ${type}`);
      const store = useDashboardCollectionStore.getState();
      store.updateCompanion(store.activeDashboardId, {
        showSecurity: true,
        cards: [{ id: 'selected', type: 'entity', entityId: entity.canonicalId }],
      });
      const section = useNavigationStore.getState().activeSection;
      renderWithProviders(<DashboardCompanion />);
      const opener = screen.getByRole('button', { name: `Open settings for ${entity.name}` });
      fireEvent.click(opener);
      const dialog = await screen.findByRole('dialog');
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      if (type === 'weather') {
        expect(dialog).toHaveAccessibleName('Stockholm');
        expect(within(dialog).getByRole('radio', { name: 'Weekly' })).toBeInTheDocument();
      } else if (type === 'lock') {
        expect(
          within(dialog).getByRole('button', { name: /Slide to (un)?lock/ })
        ).toBeInTheDocument();
        expect(within(dialog).getAllByText(entity.name)).toHaveLength(1);
      } else {
        expect(within(dialog).getByRole('button', { name: 'Arm Away' })).toBeInTheDocument();
      }
      expect(useNavigationStore.getState().activeSection).toBe(section);
      expect(
        integrationStore.getState().providerEntitiesByCanonicalId[entity.canonicalId].primaryState
      ).toBe(entity.primaryState);
      fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]);
      await waitFor(() => expect(opener).toHaveFocus());
    }
  );

  it('disables security and weather dialog triggers while customizing', () => {
    renderWithProviders(<DashboardCompanion editing />);
    const openers = screen.getAllByRole('button', { name: /^Open settings for / });
    expect(openers.length).toBeGreaterThan(1);
    for (const opener of openers) expect(opener).toBeDisabled();
  });

  it('renders normalized weather, camera and security from the selected sources', () => {
    renderWithProviders(<DashboardCompanion />);
    expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit panel' })).not.toBeInTheDocument();
    expect(screen.getByText('64.4°F')).toBeInTheDocument();
    expect(screen.getByText('H:71.6° L:55.4°')).toBeInTheDocument();
    act(() => useSettingsStore.getState().updateSettings({ temperatureUnit: 'celsius' }));
    expect(screen.getByText('18°C')).toBeInTheDocument();
    expect(screen.getByText('H:22° L:13°')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Front Door snapshot' })).toBeEnabled();
    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.getByText('Armed Home')).toBeInTheDocument();
  });

  it('reports a disconnected source instead of showing cached weather and security as available', () => {
    integrationStore.setState((state) => ({
      providerRuntime: {
        ...state.providerRuntime,
        home_assistant: { ...state.providerRuntime.home_assistant, connected: false },
      },
    }));
    renderWithProviders(<DashboardCompanion />);
    expect(screen.queryByText('64.4°F')).not.toBeInTheDocument();
    expect(screen.queryByText(/^H:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Locked')).not.toBeInTheDocument();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Open Front Door snapshot' })).toBeDisabled();
  });

  it('keeps a missing selected camera unavailable rather than silently showing a different camera', () => {
    const store = useDashboardCollectionStore.getState();
    store.updateCompanion(store.activeDashboardId, {
      cameraEntityId: 'home_assistant:camera.removed',
      showSecurity: false,
      weatherEntityId: null,
    });
    renderWithProviders(<DashboardCompanion />);
    expect(screen.getByText('Camera is unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('reveals panel tools only during customization and retains an empty panel without changing dashboard content', async () => {
    const before = useDashboardCollectionStore.getState();
    const homeLayout = before.collection.dashboardsById[before.activeDashboardId].homeLayout;
    const view = renderWithProviders(<DashboardCompanion />);
    act(() => useEditModeStore.getState().setEditMode(true));
    while (screen.queryAllByRole('button', { name: /^More actions:/ }).length) {
      fireEvent.pointerDown(screen.getAllByRole('button', { name: /^More actions:/ })[0], {
        button: 0,
        ctrlKey: false,
      });
      fireEvent.click(await screen.findByRole('menuitem', { name: /^Remove / }));
    }
    const state = useDashboardCollectionStore.getState();
    expect(state.collection.dashboardsById[state.activeDashboardId].companion?.cards).toEqual([]);
    expect(state.collection.dashboardsById[state.activeDashboardId].homeLayout).toEqual(homeLayout);
    view.unmount();
    act(() => useEditModeStore.getState().setEditMode(false));
    renderWithProviders(<DashboardCompanion />);
    expect(screen.getByText('Add items to your side panel.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('uses a focused card editor and keyboard-accessible menu actions during customization', async () => {
    renderWithProviders(<DashboardCompanion />);
    act(() => useEditModeStore.getState().setEditMode(true));
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    fireEvent.change(screen.getByPlaceholderText('Search entities'), { target: { value: 'Note' } });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Add item: Note' })
    );
    fireEvent.change(screen.getByLabelText('Note text'), {
      target: { value: 'Remember the plants' },
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions: Note' }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move Note up' }));
    const state = useDashboardCollectionStore.getState();
    const cards = state.collection.dashboardsById[state.activeDashboardId].companion?.cards;
    expect(cards?.[cards.length - 2]).toMatchObject({ type: 'note', text: 'Remember the plants' });
    act(() => useEditModeStore.getState().setEditMode(false));
    expect(screen.getByText('Remember the plants')).toBeInTheDocument();
    expect(screen.queryByLabelText('Note text')).not.toBeInTheDocument();
  });

  it('can select a light from the full device catalog while customizing', () => {
    renderWithProviders(<DashboardCompanion />);
    act(() => useEditModeStore.getState().setEditMode(true));
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    const light = getPreviewRuntimeScenario('demo').entities.find(
      (entity) => entity.type === 'light'
    );
    if (!light) throw new Error('Expected a light in the device catalog');
    fireEvent.change(screen.getByPlaceholderText('Search entities'), {
      target: { value: light.name },
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: `Add item: ${light.name}` })
    );
    const state = useDashboardCollectionStore.getState();
    expect(
      state.collection.dashboardsById[state.activeDashboardId].companion?.cards?.slice(-1)[0]
    ).toMatchObject({ type: 'entity', entityId: light.canonicalId });
    expect(useEditModeStore.getState().isEditMode).toBe(true);
  });

  it('shows loading until the provider snapshot is initialized instead of displaying cached values', async () => {
    const store = useDashboardCollectionStore.getState();
    store.updateCompanion(store.activeDashboardId, {
      showSecurity: false,
      cards: [{ id: 'thermostat', type: 'entity', entityId: 'home_assistant:climate.main_floor' }],
    });
    act(() =>
      integrationStore.setState((state) => ({
        providerRuntime: {
          ...state.providerRuntime,
          home_assistant: {
            ...state.providerRuntime.home_assistant,
            connected: true,
            entitiesHydrated: false,
          },
        },
      }))
    );
    renderWithProviders(<DashboardCompanion />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading...');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    act(() =>
      integrationStore.setState((state) => ({
        providerRuntime: {
          ...state.providerRuntime,
          home_assistant: { ...state.providerRuntime.home_assistant, entitiesHydrated: true },
        },
      }))
    );
    expect(await screen.findByRole('button', { name: /^Toggle Main floor/ })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a thermostat value with separate power and dialog buttons', async () => {
    const store = useDashboardCollectionStore.getState();
    store.updateCompanion(store.activeDashboardId, {
      showSecurity: false,
      cards: [{ id: 'thermostat', type: 'entity', entityId: 'home_assistant:climate.main_floor' }],
    });
    useSettingsStore.getState().updateSettings({ temperatureUnit: 'celsius' });
    renderWithProviders(<DashboardCompanion />);
    expect(await screen.findByText('21°C')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^Toggle Main floor/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Open settings for Main floor/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Increase temperature/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('keeps humidifiers as state rows rather than inventing a thermostat target', () => {
    const store = useDashboardCollectionStore.getState();
    store.updateCompanion(store.activeDashboardId, {
      showSecurity: false,
      cards: [{ id: 'humidity', type: 'entity', entityId: 'home_assistant:humidifier.bedroom' }],
    });
    renderWithProviders(<DashboardCompanion />);
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Increase temperature/ })).not.toBeInTheDocument();
  });

  it('adds and renders chores on HTTP origins without crypto.randomUUID', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const success = vi.spyOn(toast, 'success').mockReturnValue('added-chores');
    renderWithProviders(
      <DemoChoreWorkspace>
        <DashboardCompanion />
      </DemoChoreWorkspace>
    );
    act(() => useEditModeStore.getState().setEditMode(true));
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    fireEvent.change(screen.getByPlaceholderText('Search entities'), {
      target: { value: 'Chores' },
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Add item: Chores' })
    );
    expect(success).toHaveBeenCalledWith('Added Chores');
    expect(within(screen.getByRole('dialog')).queryByText('Added Chores')).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Unload dishwasher')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions: Chores' })).toBeInTheDocument();
    act(() => useEditModeStore.getState().setEditMode(false));
    expect(screen.queryByRole('heading', { name: 'Chores' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark done: Unload dishwasher' })).toBeEnabled();
    expect(screen.getByText('Unload dishwasher')).toBeInTheDocument();
  });

  it.each(['calendar', 'chores'])('adds %s through the panel editor', (type) => {
    renderWithProviders(<DashboardCompanion editing />);
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    const name =
      type === 'calendar'
        ? getPreviewRuntimeScenario('demo').entities.find((entity) => entity.type === 'calendar')
            ?.name
        : 'Chores';
    if (!name) throw new Error('Expected a calendar source');
    fireEvent.change(screen.getByPlaceholderText('Search entities'), { target: { value: name } });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: `Add item: ${name}` })
    );
    const state = useDashboardCollectionStore.getState();
    expect(
      state.collection.dashboardsById[state.activeDashboardId].companion?.cards?.at(-1)
    ).toMatchObject({ type });
  });

  it('shows a fallback after an image failure and clears stale state on a source switch', () => {
    const { unmount } = renderWithProviders(<DashboardCompanion />);
    fireEvent.error(screen.getByRole('img', { name: 'Front Door' }));
    expect(screen.getByRole('button', { name: 'Open Front Door snapshot' })).toBeDisabled();
    unmount();
    act(() => {
      const state = useDashboardCollectionStore.getState();
      state.updateCompanion(state.activeDashboardId, {
        cameraEntityId: null,
        showSecurity: false,
        weatherEntityId: null,
      });
    });
    renderWithProviders(<DashboardCompanion />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
