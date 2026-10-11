import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { type ThemeMode, useThemeStore } from '@navet/app/stores/theme-store';
import type { NavetTodoItem, NavetTodoItemInput, NavetTodoList } from '@navet/core/todo-types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useMemo } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { type TodoItemService, TodoListItems } from './todo-lists-section';

const list: NavetTodoList = {
  id: 'home_assistant:todo.household',
  externalId: 'todo.household',
  providerId: 'home_assistant',
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
const initialItems: NavetTodoItem[] = [
  { uid: 'milk', summary: 'Oat milk', completed: false, description: 'Two cartons' },
  { uid: 'apples', summary: 'Apples', completed: false, dueDate: '2026-10-15' },
  { uid: 'bread', summary: 'Wholegrain bread', completed: true },
];
type Mode =
  | 'default'
  | 'empty'
  | 'readonly'
  | 'unavailable'
  | 'loading'
  | 'error'
  | 'long'
  | 'nonremovable';
function createService(mode: Mode): TodoItemService {
  let items = mode === 'empty' ? [] : initialItems.map((item) => ({ ...item }));
  if (mode === 'nonremovable') items[0].removable = false;
  if (mode === 'long')
    items[0].summary =
      'Shopping list with a very long household item name and detailed instructions to check on a small phone screen';
  const listeners = new Set<(items: NavetTodoItem[]) => void>();
  const publish = () => {
    for (const listener of listeners) listener([...items]);
  };
  const optional = (input: Partial<NavetTodoItemInput>) => ({
    ...(input.description !== undefined ? { description: input.description ?? undefined } : {}),
    ...(input.dueDate !== undefined
      ? { dueDate: input.dueDate ?? undefined, dueDateTime: undefined }
      : {}),
    ...(input.dueDateTime !== undefined
      ? { dueDateTime: input.dueDateTime ?? undefined, dueDate: undefined }
      : {}),
  });
  return {
    getItems: async () => {
      if (mode === 'error') throw new Error('Offline');
      if (mode === 'loading') return new Promise(() => {});
      return [...items];
    },
    subscribeItems: async (_list, listener) => {
      if (mode === 'error') throw new Error('Offline');
      if (mode !== 'loading') listener([...items]);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    add: async (_list, input) => {
      items = [
        ...items,
        {
          uid: `new-${items.length}`,
          summary: input.summary,
          completed: false,
          ...optional(input),
        },
      ];
      publish();
    },
    update: async (_list, uid, input) => {
      items = items.map((item) =>
        item.uid === uid
          ? {
              ...item,
              ...(input.summary !== undefined ? { summary: input.summary } : {}),
              ...(input.completed !== undefined ? { completed: input.completed } : {}),
              ...optional(input),
            }
          : item
      );
      publish();
    },
    remove: async (_list, uid) => {
      items = items.filter((item) => item.uid !== uid);
      publish();
    },
  };
}

function ListsStory({ mode = 'default', theme = 'glass' }: { mode?: Mode; theme?: ThemeMode }) {
  const service = useMemo(() => createService(mode), [mode]);
  const surface = getThemeSurfaceTokens(theme);
  useEffect(() => {
    const previous = useThemeStore.getState();
    useThemeStore.setState({ theme, followSystemTheme: false, wallpaper: null });
    return () => {
      useThemeStore.setState(previous);
    };
  }, [theme]);
  const descriptor =
    mode === 'readonly'
      ? {
          ...list,
          capabilities: { ...list.capabilities, add: false, update: false, remove: false },
        }
      : { ...list, available: mode !== 'unavailable' };
  return (
    <div className={`min-h-screen min-w-0 p-3 md:p-6 ${surface.appBg}`}>
      <TodoListItems list={descriptor} service={service} />
    </div>
  );
}

const meta = {
  title: 'Pages/Tasks/Lists',
  component: ListsStory,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Extends the Routines workspace (pages-tasks-routines--desktop) with normalized shared lists. Reuses Selectable Checkbox Row and Controls-first BaseCardDialog. Priority: list identity, live items, complete/undo; secondary details use the existing dialog. Compact responsive rows preserve Navet theme surfaces. This arrangement requires rendered acceptance.',
      },
    },
  },
} satisfies Meta<typeof ListsStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const item = await canvas.findByRole('checkbox', { name: /Oat milk/ });
    await userEvent.click(item);
    await expect(item).toBeChecked();
    await userEvent.click(item);
    await expect(item).not.toBeChecked();
  },
};
export const Phone: Story = { globals: { viewport: { value: 'mobile1' } } };
export const Light: Story = { args: { theme: 'light' } };
export const Dark: Story = { args: { theme: 'dark' } };
export const Black: Story = { args: { theme: 'black' } };
export const Empty: Story = { args: { mode: 'empty' } };
export const ReadOnly: Story = { args: { mode: 'readonly' } };
export const Unavailable: Story = { args: { mode: 'unavailable' } };
export const Loading: Story = { args: { mode: 'loading' } };
export const ErrorState: Story = { args: { mode: 'error' } };
export const LongNames: Story = {
  args: { mode: 'long' },
  globals: { viewport: { value: 'mobile1' } },
};

export const NonRemovableItem: Story = {
  args: { mode: 'nonremovable' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('checkbox', { name: /Oat milk/ })).toBeEnabled();
    await expect(canvas.getByRole('button', { name: 'Edit item: Oat milk' })).toBeEnabled();
    await expect(
      canvas.queryByRole('button', { name: 'Remove item: Oat milk' })
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Remove item: Apples' })).toBeEnabled();
  },
};
