import { homeAssistantStore } from '@navet/app/stores/home-assistant-store';
import { integrationStore } from '@navet/app/stores/integration-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import type { NavetTodoItem, NavetTodoList } from '@navet/core/todo-types';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TasksSection } from '../tasks-section';
import TodoListsSection, { TodoListItems } from '../todo-lists-section';

const mocks = vi.hoisted(() => ({
  getLists: vi.fn(),
  subscribeLists: vi.fn(),
  getItems: vi.fn(),
  subscribeItems: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@navet/app/services/integration-todo.service', () => ({
  getIntegrationTodoLists: mocks.getLists,
  subscribeIntegrationTodoLists: mocks.subscribeLists,
  getIntegrationTodoItems: mocks.getItems,
  subscribeIntegrationTodoItems: mocks.subscribeItems,
  addIntegrationTodoItem: mocks.add,
  updateIntegrationTodoItem: mocks.update,
  removeIntegrationTodoItem: mocks.remove,
}));
const list: NavetTodoList = {
  id: 'home_assistant:todo.shopping',
  providerId: 'home_assistant',
  externalId: 'todo.shopping',
  name: 'Shopping',
  available: true,
  capabilities: {
    add: true,
    update: true,
    remove: true,
    description: true,
    dueDate: true,
    dueDateTime: true,
  },
};
const secondList: NavetTodoList = {
  ...list,
  id: 'home_assistant:todo.weekend',
  externalId: 'todo.weekend',
  name: 'Weekend',
};
const initialItems: NavetTodoItem[] = [
  { uid: 'stable-1', summary: 'Milk', completed: false },
  { uid: 'stable-2', summary: 'Bread', completed: true },
];
let items: NavetTodoItem[];
let publish: (items: NavetTodoItem[]) => void;
let listError: () => void;
let publishLists: (lists: NavetTodoList[]) => void;
beforeEach(async () => {
  await resetAppStores();
  vi.clearAllMocks();
  items = initialItems.map((item) => ({ ...item }));
  mocks.getLists.mockResolvedValue([list, secondList]);
  mocks.subscribeLists.mockImplementation(async (_ids, listener, onError) => {
    publishLists = listener;
    listError = onError;
    listener([list, secondList]);
    return () => {};
  });
  mocks.getItems.mockImplementation(async () => items);
  mocks.subscribeItems.mockImplementation(async (_list, listener) => {
    publish = listener;
    listener(items);
    return () => {};
  });
  mocks.add.mockImplementation(async (_list, input) => {
    items = [...items, { uid: 'stable-3', completed: false, ...input }];
  });
  mocks.update.mockImplementation(async (_list, uid, input) => {
    items = items.map((item) => (item.uid === uid ? { ...item, ...input } : item));
  });
  mocks.remove.mockImplementation(async (_list, uid) => {
    items = items.filter((item) => item.uid !== uid);
  });
});

describe('shared list workflow', () => {
  it('keeps Lists accessible without routines across disconnect and reconnect', async () => {
    homeAssistantStore.setState({ connected: true, entities: {} });
    integrationStore.setState({ selectedProviderIds: ['home_assistant'] });
    renderWithProviders(<TasksSection />);
    expect(screen.getByText('No routines')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lists' }));
    await screen.findByRole('checkbox', { name: 'Milk' });
    act(() => {
      homeAssistantStore.setState({ connected: false });
      publishLists([{ ...list, available: false }, secondList]);
    });
    expect(screen.getByRole('button', { name: 'Lists' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('This list is unavailable.')).toBeInTheDocument();
    act(() => {
      homeAssistantStore.setState({ connected: true });
      publishLists([list, secondList]);
    });
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Milk' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Lists' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('preserves the routines surface for selected providers without list support', () => {
    integrationStore.setState({ selectedProviderIds: ['homey'] });
    renderWithProviders(<TasksSection />);
    expect(screen.queryByRole('button', { name: 'Lists' })).not.toBeInTheDocument();
    expect(mocks.getLists).not.toHaveBeenCalled();
  });

  it('keeps useful lists and items when a live list refresh fails', async () => {
    renderWithProviders(<TodoListsSection providerIds={['home_assistant']} />);
    await screen.findByRole('checkbox', { name: 'Milk' });
    act(() => listError());
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load');
    expect(screen.getByRole('checkbox', { name: 'Milk' })).toBeInTheDocument();
    act(() => publishLists([{ ...list, name: 'Groceries' }, secondList]));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Groceries' })).toBeInTheDocument();
  });
  it('uses only the explicitly selected providers and handles no supported lists', async () => {
    mocks.getLists.mockResolvedValue([]);
    mocks.subscribeLists.mockImplementation(async (_ids, listener) => {
      listener([]);
      return () => {};
    });
    renderWithProviders(<TodoListsSection providerIds={['homey', 'openhab']} />);
    expect(await screen.findByText('No shared lists are available.')).toBeInTheDocument();
    expect(mocks.getLists).toHaveBeenCalledWith(['homey', 'openhab']);
  });
  it('ignores an older fetch after a newer subscription snapshot', async () => {
    let resolveInitial: (items: NavetTodoItem[]) => void = () => {};
    mocks.getItems.mockImplementation(
      () =>
        new Promise<NavetTodoItem[]>((resolve) => {
          resolveInitial = resolve;
        })
    );
    renderWithProviders(<TodoListItems list={list} />);
    await screen.findByRole('checkbox', { name: 'Milk' });
    act(() => publish([{ ...items[0], summary: 'Updated on another device' }]));
    await act(async () => resolveInitial(initialItems));
    expect(screen.getByRole('checkbox', { name: 'Updated on another device' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Milk' })).not.toBeInTheDocument();
  });

  it('completes and restores an item using its stable UID', async () => {
    renderWithProviders(<TodoListItems list={list} />);
    const checkbox = await screen.findByRole('checkbox', { name: 'Milk' });
    fireEvent.click(checkbox);
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(list, 'stable-1', { completed: true })
    );
    await waitFor(() => expect(checkbox).toBeChecked());
    await waitFor(() => expect(checkbox).toBeEnabled());
    fireEvent.click(checkbox);
    await waitFor(() =>
      expect(mocks.update).toHaveBeenLastCalledWith(list, 'stable-1', { completed: false })
    );
  });
  it('adds an item with optional details and one due-date field', async () => {
    renderWithProviders(<TodoListItems list={list} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Item name'), { target: { value: ' Apples ' } });
    fireEvent.change(within(dialog).getByLabelText('Description'), { target: { value: 'Green' } });
    fireEvent.change(within(dialog).getByLabelText('Due'), { target: { value: 'date' } });
    fireEvent.change(within(dialog).getByLabelText('Due date'), {
      target: { value: '2026-10-15' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add item' }));
    await waitFor(() =>
      expect(mocks.add).toHaveBeenCalledWith(list, {
        summary: 'Apples',
        description: 'Green',
        dueDate: '2026-10-15',
      })
    );
    expect(await screen.findByRole('checkbox', { name: /Apples/ })).toBeInTheDocument();
  });
  it('preserves untouched due timestamps with seconds and offsets during summary-only edits', async () => {
    const originalTimestamp = '2026-10-25T02:30:45+01:00';
    items = [
      {
        uid: 'stable-1',
        summary: 'Reminder',
        completed: false,
        description: 'Keep this detail',
        dueDateTime: originalTimestamp,
      },
    ];
    renderWithProviders(<TodoListItems list={list} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit item: Reminder' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Item name'), {
      target: { value: 'Updated reminder' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(list, 'stable-1', { summary: 'Updated reminder' })
    );
    expect(items[0].dueDateTime).toBe(originalTimestamp);
    expect(items[0].description).toBe('Keep this detail');
  });
  it('writes explicitly edited date-times and clears only the original due field', async () => {
    items = [
      {
        uid: 'stable-1',
        summary: 'Reminder',
        completed: false,
        dueDateTime: '2026-10-25T02:30:45+01:00',
      },
    ];
    renderWithProviders(<TodoListItems list={list} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit item: Reminder' }));
    let dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Due date and time'), {
      target: { value: '2026-10-27T10:15:30' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(list, 'stable-1', {
        summary: 'Reminder',
        dueDateTime: new Date('2026-10-27T10:15:30').toISOString(),
      })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit item: Reminder' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit item: Reminder' }));
    dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Due'), { target: { value: 'none' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenLastCalledWith(list, 'stable-1', {
        summary: 'Reminder',
        dueDateTime: null,
      })
    );
  });

  it.each(['success', 'failure'] as const)(
    'resets same-ID household drafts and ignores late old-session %s',
    async (outcome) => {
      const householdA = { ...list, sessionKey: 'household-a' };
      const householdB = { ...list, sessionKey: 'household-b' };
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      mocks.update.mockImplementationOnce(
        () =>
          new Promise<void>((done, fail) => {
            resolve = done;
            reject = fail;
          })
      );
      const { rerender } = renderWithProviders(<TodoListItems list={householdA} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Edit item: Milk' }));
      fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'A draft' } });
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
      expect(mocks.update).toHaveBeenCalledWith(householdA, 'stable-1', { summary: 'A draft' });
      items = [{ uid: 'b-uid', summary: 'B item', completed: false }];
      rerender(<TodoListItems list={householdB} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      fireEvent.click(await screen.findByRole('button', { name: 'Edit item: B item' }));
      expect(screen.getByLabelText('Item name')).toHaveValue('B item');
      fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'B draft' } });
      await act(async () => {
        if (outcome === 'success') resolve();
        else reject(new Error('Old session failed'));
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Item name')).toHaveValue('B draft');
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(mocks.update).toHaveBeenLastCalledWith(householdB, 'b-uid', { summary: 'B draft' })
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
  );

  it('keeps the editor draft after a failure and retries the stable item', async () => {
    mocks.update.mockRejectedValueOnce(new Error('Disconnected'));
    renderWithProviders(<TodoListItems list={list} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit item: Milk' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Item name'), { target: { value: 'Oat milk' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your changes are kept');
    expect(within(dialog).getByLabelText('Item name')).toHaveValue('Oat milk');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenLastCalledWith(list, 'stable-1', { summary: 'Oat milk' })
    );
  });
  it('reflects same-count remote changes and removes only the selected UID', async () => {
    renderWithProviders(<TodoListItems list={list} />);
    await screen.findByRole('checkbox', { name: 'Milk' });
    act(() => publish([{ ...items[0], summary: 'Oat milk', completed: true }, items[1]]));
    expect(screen.getByRole('checkbox', { name: 'Oat milk' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Remove item: Oat milk' }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(list, 'stable-1'));
  });
  it('hides removal for non-removable items while retaining editing and completion', async () => {
    items = [{ ...items[0], removable: false }, items[1]];
    renderWithProviders(<TodoListItems list={list} />);
    expect(await screen.findByRole('checkbox', { name: 'Milk' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Edit item: Milk' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Remove item: Milk' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove item: Bread' })).toBeEnabled();
  });
  it('disables completion and hides editing for items that cannot be updated', async () => {
    items = [{ ...items[0], removable: false, updatable: false }, items[1]];
    renderWithProviders(<TodoListItems list={list} />);
    expect(await screen.findByRole('checkbox', { name: 'Milk' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Edit item: Milk' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove item: Milk' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Bread' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Edit item: Bread' })).toBeEnabled();
  });
  it('hides unsupported mutations and optional fields', async () => {
    const readonly = {
      ...list,
      capabilities: { ...list.capabilities, add: false, update: false, remove: false },
    };
    renderWithProviders(<TodoListItems list={readonly} />);
    expect(await screen.findByRole('checkbox', { name: 'Milk' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit item|Remove item/ })).not.toBeInTheDocument();
  });
  it('does not offer unsupported fields in the add dialog', async () => {
    renderWithProviders(
      <TodoListItems
        list={{
          ...list,
          capabilities: {
            ...list.capabilities,
            description: false,
            dueDate: false,
            dueDateTime: false,
          },
        }}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
    expect(screen.queryByLabelText('Description')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Due')).not.toBeInTheDocument();
  });
  it('does not render stale items when switching lists during a fetch', async () => {
    let resolveFirst: (items: NavetTodoItem[]) => void = () => {};
    mocks.getItems.mockImplementation((selected) =>
      selected.id === list.id
        ? new Promise<NavetTodoItem[]>((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve([{ uid: 'weekend-1', summary: 'Clean garage', completed: false }])
    );
    mocks.subscribeItems.mockImplementation(async () => () => {});
    renderWithProviders(<TodoListsSection providerIds={['home_assistant']} />);
    fireEvent.change(await screen.findByLabelText('Choose a list'), {
      target: { value: secondList.id },
    });
    expect(await screen.findByRole('checkbox', { name: 'Clean garage' })).toBeInTheDocument();
    await act(async () => resolveFirst(initialItems));
    expect(screen.queryByRole('checkbox', { name: 'Milk' })).not.toBeInTheDocument();
  });
  it('shows loading, empty, unavailable and recoverable errors', async () => {
    mocks.getItems.mockRejectedValue(new Error('Offline'));
    mocks.subscribeItems.mockRejectedValue(new Error('Offline'));
    const view = renderWithProviders(<TodoListItems list={list} />);
    expect(screen.getByText('Loading items…')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load');
    items = [];
    mocks.getItems.mockResolvedValue([]);
    mocks.subscribeItems.mockImplementation(async (_list, listener) => {
      listener([]);
      return () => {};
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('This list is empty.')).toBeInTheDocument();
    view.rerender(<TodoListItems list={{ ...list, available: false }} />);
    expect(screen.getByText('This list is unavailable.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add item' })).toBeDisabled();
  });
});
