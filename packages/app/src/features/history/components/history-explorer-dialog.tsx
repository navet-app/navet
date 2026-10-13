import { FieldBlock } from '@navet/app/components/patterns';
import {
  BaseCardDialog,
  Button,
  Input,
  InteractivePill,
  LoadingSpinner,
  MessageBar,
  Select,
} from '@navet/app/components/primitives';
import { DialogHeader } from '@navet/app/components/shared/device-editor';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { navetTypographyTokens } from '@navet/app/components/system/tokens';
import { useI18n, useTheme } from '@navet/app/hooks';
import { useId, useState } from 'react';
import {
  type HistoryMode,
  type HistoryQuery,
  historyRange,
  loadHistoryRecords,
  toLocalDateTime,
} from '../history-records';
import { useHistoryRecords } from '../hooks/use-history-records';

export interface HistoryEntityOption {
  id: string;
  name: string;
  source: string;
  connected: boolean;
}
interface Props {
  entities: HistoryEntityOption[];
  onClose: () => void;
  load?: typeof loadHistoryRecords;
}
const PAGE_SIZE = 50;
const RECORD_LIMIT = 1000;

export function HistoryExplorerDialog({ entities, onClose, load = loadHistoryRecords }: Props) {
  const { theme } = useTheme();
  const { t, locale } = useI18n();
  const surface = getThemeSurfaceTokens(theme);
  const prefix = useId();
  const [entityId, setEntityId] = useState('');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<HistoryMode>('states');
  const [start, setStart] = useState(() =>
    toLocalDateTime(new Date(Date.now() - 24 * 60 * 60 * 1000))
  );
  const [end, setEnd] = useState(() => toLocalDateTime(new Date()));
  const [query, setQuery] = useState<HistoryQuery | null>(null);
  const [validationError, setValidationError] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const selected = entities.find((entity) => entity.id === entityId);
  const result = useHistoryRecords(selected?.connected ? query : null, load);
  const filtered = entities.filter(
    (entity) =>
      entity.id === entityId ||
      `${entity.name} ${entity.source} ${entity.id}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase())
  );
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const reset = () => {
    setQuery(null);
    setValidationError(false);
    setVisibleCount(PAGE_SIZE);
  };
  const offline = Boolean(selected && !selected.connected);
  const records = offline ? [] : result.records;

  return (
    <BaseCardDialog
      variant="modal"
      height="capped"
      contentClassName="flex flex-col"
      bodyClassName="min-h-0 overflow-y-auto overscroll-contain"
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('history.title')}
      theme={theme}
    >
      <DialogHeader title={t('history.title')} isOn={theme !== 'light'} />
      <div className={`space-y-4 ${surface.textPrimary}`}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selected?.connected) return;
            try {
              const range = historyRange(start, end);
              setValidationError(false);
              setVisibleCount(PAGE_SIZE);
              setQuery({ entityId, mode, ...range });
            } catch {
              setValidationError(true);
              setQuery(null);
            }
          }}
        >
          <FieldBlock label={t('history.search')} htmlFor={`${prefix}-search`}>
            <Input
              id={`${prefix}-search`}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
          </FieldBlock>
          <FieldBlock label={t('history.entity')} htmlFor={`${prefix}-entity`} required>
            <Select
              id={`${prefix}-entity`}
              value={entityId}
              required
              onChange={(event) => {
                setEntityId(event.currentTarget.value);
                reset();
              }}
            >
              <option value="">{t('history.chooseEntity')}</option>
              {filtered.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.source} · {entity.name}
                </option>
              ))}
            </Select>
          </FieldBlock>
          <fieldset className="flex flex-wrap gap-2" aria-label={t('history.view')}>
            {(['states', 'activity'] as const).map((value) => (
              <InteractivePill
                key={value}
                type="button"
                active={mode === value}
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  reset();
                }}
              >
                {t(value === 'states' ? 'history.states' : 'history.activity')}
              </InteractivePill>
            ))}
          </fieldset>
          <p className={`${navetTypographyTokens.helper} ${surface.textSecondary}`}>
            {t('calendar.create.timeZone', { timeZone })}
          </p>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <FieldBlock label={t('calendar.create.start')} htmlFor={`${prefix}-start`} required>
              <Input
                id={`${prefix}-start`}
                type="datetime-local"
                style={{ colorScheme: theme === 'light' ? 'light' : 'dark' }}
                required
                value={start}
                onChange={(event) => {
                  setStart(event.currentTarget.value);
                  reset();
                }}
              />
            </FieldBlock>
            <FieldBlock label={t('calendar.create.end')} htmlFor={`${prefix}-end`} required>
              <Input
                id={`${prefix}-end`}
                type="datetime-local"
                style={{ colorScheme: theme === 'light' ? 'light' : 'dark' }}
                required
                value={end}
                onChange={(event) => {
                  setEnd(event.currentTarget.value);
                  reset();
                }}
              />
            </FieldBlock>
          </div>
          {validationError ? (
            <MessageBar tone="error">{t('history.invalidRange')}</MessageBar>
          ) : null}
          <Button
            type="submit"
            size="small"
            disabled={!selected?.connected || result.status === 'loading'}
          >
            {t('history.load')}
          </Button>
        </form>
        {entities.length === 0 ? (
          <MessageBar>{t('history.noEntities')}</MessageBar>
        ) : offline ? (
          <MessageBar tone="warning">{t('history.offline')}</MessageBar>
        ) : result.status === 'loading' ? (
          <div className="flex items-center gap-2" role="status">
            <LoadingSpinner message={t('history.loading')} />
          </div>
        ) : result.status === 'error' ? (
          <div className="space-y-2">
            <MessageBar tone="error">{t('history.failed')}</MessageBar>
            <Button
              size="small"
              variant="soft"
              onClick={() => {
                if (query) setQuery({ ...query });
              }}
            >
              {t('household.retry')}
            </Button>
          </div>
        ) : result.status === 'unavailable' ? (
          <MessageBar>
            {t(mode === 'states' ? 'history.unsupported' : 'history.activityUnsupported')}
          </MessageBar>
        ) : result.status === 'loaded' && records.length === 0 ? (
          <MessageBar>{t('history.empty')}</MessageBar>
        ) : null}
        {records.length > 0 ? (
          <div className="space-y-3">
            <p className={`${navetTypographyTokens.helper} ${surface.textSecondary}`}>
              {t('history.retention')}
            </p>
            <ol
              className={`divide-y ${surface.divider}`}
              aria-label={t(mode === 'states' ? 'history.states' : 'history.activity')}
            >
              {records.slice(0, Math.min(visibleCount, RECORD_LIMIT)).map((record, index) => (
                <li
                  key={`${record.timestamp}-${index}`}
                  className="flex flex-wrap items-start justify-between gap-2 py-3"
                >
                  <div className="min-w-0 flex-1 break-words">
                    <p className={navetTypographyTokens.body}>
                      {record.name ? `${record.name}: ` : ''}
                      {record.value || t('history.recordedEvent')}
                    </p>
                    {record.atStart ? (
                      <p className={`${navetTypographyTokens.helper} ${surface.textSecondary}`}>
                        {t('history.atStart')}
                      </p>
                    ) : null}
                  </div>
                  <time
                    dateTime={record.timestamp}
                    className={`${navetTypographyTokens.helper} ${surface.textSecondary}`}
                  >
                    {new Date(record.timestamp).toLocaleString(locale)}
                  </time>
                </li>
              ))}
            </ol>
            {visibleCount < Math.min(records.length, RECORD_LIMIT) ? (
              <Button
                variant="soft"
                size="small"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                {t('history.more')}
              </Button>
            ) : null}
            {records.length > RECORD_LIMIT && visibleCount >= RECORD_LIMIT ? (
              <MessageBar>{t('history.limited', { count: RECORD_LIMIT })}</MessageBar>
            ) : null}
          </div>
        ) : null}
      </div>
    </BaseCardDialog>
  );
}
