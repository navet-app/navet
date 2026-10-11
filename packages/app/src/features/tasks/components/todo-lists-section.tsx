import {
  SelectableCheckboxList,
  SelectableCheckboxRow,
} from '@navet/app/components/patterns/selectable-checkbox-row';
import { Button, Select } from '@navet/app/components/primitives';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useI18n, useTheme } from '@navet/app/hooks';
import {
  addIntegrationTodoItem,
  getIntegrationTodoItems,
  removeIntegrationTodoItem,
  subscribeIntegrationTodoItems,
  updateIntegrationTodoItem,
} from '@navet/app/services/integration-todo.service';
import type { IntegrationProviderId } from '@navet/core/integration-providers';
import type { NavetTodoItem, NavetTodoItemInput, NavetTodoList } from '@navet/core/todo-types';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTodoLists } from '../hooks/use-todo-lists';
import { TodoItemEditor } from './todo-item-editor';

function formatDueTime(value: string | undefined, locale: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : value;
}

const DEFAULT_TODO_SERVICE = {
  getItems: getIntegrationTodoItems,
  subscribeItems: subscribeIntegrationTodoItems,
  add: addIntegrationTodoItem,
  update: updateIntegrationTodoItem,
  remove: removeIntegrationTodoItem,
};
export type TodoItemService = typeof DEFAULT_TODO_SERVICE;

export function TodoListItems(props: { list: NavetTodoList; service?: TodoItemService }) {
  return (
    <TodoListItemsContent
      key={JSON.stringify([props.list.providerId, props.list.id, props.list.sessionKey])}
      {...props}
    />
  );
}

function TodoListItemsContent({
  list,
  service = DEFAULT_TODO_SERVICE,
}: {
  list: NavetTodoList;
  service?: TodoItemService;
}) {
  const { t, locale } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const [items, setItems] = useState<NavetTodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'load' | 'action' | null>(null);
  const [pending, setPending] = useState(false);
  const [editor, setEditor] = useState<NavetTodoItem | 'new' | null>(null);
  const [editorError, setEditorError] = useState(false);
  const [retry, setRetry] = useState(0);
  const mounted = useRef(false);
  const operation = useRef(false);
  const sequence = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current++;
    };
  }, []);
  useEffect(() => {
    let active = true;
    let subscriptionSeen = false;
    let unsubscribe: (() => void) | undefined;
    if (!list.available) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const request = ++sequence.current;
    void service
      .getItems(list)
      .then((next) => {
        if (active && !subscriptionSeen && request === sequence.current) {
          setItems(next);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active && !subscriptionSeen) {
          setError('load');
          setLoading(false);
        }
      });
    void service
      .subscribeItems(
        list,
        (next) => {
          subscriptionSeen = true;
          sequence.current++;
          if (active) {
            setItems(next);
            setLoading(false);
            setError(null);
          }
        },
        () => {
          if (active) {
            setError('load');
            setLoading(false);
          }
        }
      )
      .then((stop) => {
        if (active) unsubscribe = stop;
        else stop();
      })
      .catch(() => {
        if (active) {
          setError('load');
          setLoading(false);
        }
      });
    return () => {
      active = false;
      sequence.current++;
      unsubscribe?.();
    };
  }, [list.id, list.available, service, retry]);

  async function mutate(action: () => Promise<void>, editing = false) {
    if (operation.current || !list.available) return;
    operation.current = true;
    setPending(true);
    setError(null);
    setEditorError(false);
    let saved = false;
    try {
      await action();
      saved = true;
      if (!mounted.current) return;
      if (editing) setEditor(null);
      const request = ++sequence.current;
      const next = await service.getItems(list);
      if (mounted.current && request === sequence.current) setItems(next);
    } catch {
      if (mounted.current) {
        if (saved) setError('load');
        else if (editing) setEditorError(true);
        else setError('action');
      }
    } finally {
      operation.current = false;
      if (mounted.current) setPending(false);
    }
  }
  function save(input: NavetTodoItemInput) {
    if (editor === 'new' && list.capabilities.add)
      void mutate(() => service.add(list, input), true);
    else if (editor && editor !== 'new' && list.capabilities.update) {
      const item = editor;
      void mutate(() => service.update(list, item.uid, input), true);
    }
  }
  return (
    <section
      className={`min-w-0 space-y-4 ${surface.textPrimary}`}
      aria-label={list.name}
      aria-busy={pending || loading}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="min-w-0 break-words text-lg font-semibold">{list.name}</h2>
        {list.capabilities.add ? (
          <Button
            disabled={pending || !list.available}
            leading={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditorError(false);
              setEditor('new');
            }}
          >
            {t('todo.addItem')}
          </Button>
        ) : null}
      </div>
      {!list.available ? (
        <p role="status">{t('todo.unavailable')}</p>
      ) : loading ? (
        <p role="status">{t('todo.loadingItems')}</p>
      ) : null}
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span>{t(error === 'load' ? 'todo.loadFailed' : 'todo.actionFailed')}</span>
          {error === 'load' ? (
            <Button
              variant="secondary"
              size="small"
              disabled={!list.available}
              onClick={() => setRetry((value) => value + 1)}
            >
              {t('todo.retry')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {!loading && !error && list.available && items.length === 0 ? (
        <p className={surface.textSecondary}>{t('todo.emptyItems')}</p>
      ) : null}
      {items.length ? (
        <SelectableCheckboxList aria-label={t('todo.items')}>
          {items.map((item) => (
            <li key={item.uid}>
              <SelectableCheckboxRow
                checked={item.completed}
                disabled={
                  pending ||
                  !list.available ||
                  !list.capabilities.update ||
                  item.updatable === false
                }
                onCheckedChange={(completed) => {
                  if (list.capabilities.update && item.updatable !== false)
                    void mutate(() => service.update(list, item.uid, { completed }));
                }}
                label={
                  <span
                    className={`block break-words [overflow-wrap:anywhere] ${item.completed ? 'line-through' : ''}`}
                  >
                    {item.summary}
                  </span>
                }
                description={
                  <span className="block break-words [overflow-wrap:anywhere]">
                    {item.description}
                    {item.dueDate || item.dueDateTime ? (
                      <span className="block">
                        {t('todo.due')}: {item.dueDate ?? formatDueTime(item.dueDateTime, locale)}
                      </span>
                    ) : null}
                  </span>
                }
                action={
                  <div className="flex gap-1">
                    {list.capabilities.update && item.updatable !== false ? (
                      <Button
                        variant="ghost"
                        size="small"
                        aria-label={`${t('todo.editItem')}: ${item.summary}`}
                        disabled={pending || !list.available}
                        onClick={() => {
                          setEditorError(false);
                          setEditor(item);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {list.capabilities.remove && item.removable !== false ? (
                      <Button
                        variant="ghost"
                        size="small"
                        aria-label={`${t('todo.removeItem')}: ${item.summary}`}
                        disabled={pending || !list.available}
                        onClick={() => {
                          void mutate(() => service.remove(list, item.uid));
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                }
              />
            </li>
          ))}
        </SelectableCheckboxList>
      ) : null}
      <div role="status" aria-live="polite" className="text-sm">
        {pending ? t('todo.saving') : ''}
      </div>
      {editor ? (
        <TodoItemEditor
          key={editor === 'new' ? 'new' : editor.uid}
          list={list}
          item={editor === 'new' ? undefined : editor}
          pending={pending}
          error={editorError}
          onSave={save}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </section>
  );
}

export default function TodoListsSection({
  providerIds,
}: {
  providerIds: IntegrationProviderId[];
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const { lists, loading, error, retry } = useTodoLists(providerIds);
  const [selectedId, setSelectedId] = useState<string>();
  const selectionId = useId();
  const list = lists.find((entry) => entry.id === selectedId) ?? lists[0];
  return (
    <div className={`min-w-0 space-y-4 pb-24 md:pb-0 ${surface.textPrimary}`}>
      <h1 className="text-xl font-semibold md:text-2xl">{t('todo.lists')}</h1>
      {loading ? <p role="status">{t('todo.loadingLists')}</p> : null}
      {error ? (
        <div role="alert" className="space-y-2">
          <p>{t('todo.loadFailed')}</p>
          <Button variant="secondary" onClick={retry}>
            {t('todo.retry')}
          </Button>
        </div>
      ) : null}
      {!loading && !error && !list ? (
        <p className={surface.textSecondary}>{t('todo.emptyLists')}</p>
      ) : null}
      {list ? (
        <>
          <label className="block space-y-1 text-sm" htmlFor={selectionId}>
            <span>{t('todo.chooseList')}</span>
            <Select
              id={selectionId}
              value={list.id}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {lists.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
          </label>
          <TodoListItems key={list.id} list={list} />
        </>
      ) : null}
    </div>
  );
}
