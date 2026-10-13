import { FieldBlock } from '@navet/app/components/patterns';
import { BaseCardDialog, Button, Input, Select, Switch } from '@navet/app/components/primitives';
import { DialogHeader } from '@navet/app/components/shared/device-editor';
import { useI18n } from '@navet/app/hooks';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import type { PlatformCalendarCreateEvent } from '@navet/core/provider-feature-models';
import { useId, useRef, useState } from 'react';
import { buildCalendarCreateEvent } from './calendar-create-event';

export interface WritableCalendarSource {
  id: string;
  name: string;
  canCreate?: boolean;
  available?: boolean;
}

interface CalendarCreateEventDialogProps {
  calendars: WritableCalendarSource[];
  theme: ThemeType;
  onClose: () => void;
  onCreate: (entityId: string, event: PlatformCalendarCreateEvent) => Promise<void>;
}

export function CalendarCreateEventDialog({
  calendars,
  theme,
  onClose,
  onCreate,
}: CalendarCreateEventDialogProps) {
  const { t } = useI18n();
  const prefix = useId();
  const [sourceId, setSourceId] = useState(
    () => calendars.find((source) => source.canCreate && source.available)?.id ?? ''
  );
  const [title, setTitle] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const selectedSource = calendars.find((source) => source.id === sourceId);
  const canSubmit = Boolean(selectedSource?.canCreate && selectedSource.available);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <BaseCardDialog
      variant="modal"
      height="capped"
      contentClassName="flex flex-col"
      bodyClassName="min-h-0 overflow-y-auto overscroll-contain"
      isOpen
      onOpenChange={(open) => {
        if (!open && !submitting.current) onClose();
      }}
      title={t('calendar.create.title')}
      theme={theme}
    >
      <DialogHeader title={t('calendar.create.title')} isOn={theme !== 'light'} />
      <form
        className="space-y-4"
        onSubmit={async (submitEvent) => {
          submitEvent.preventDefault();
          if (submitting.current || !canSubmit) return;
          let event: PlatformCalendarCreateEvent;
          try {
            event = buildCalendarCreateEvent({ title, allDay, start, end, location, description });
          } catch {
            setError(t('calendar.create.invalid'));
            return;
          }
          submitting.current = true;
          setPending(true);
          setError('');
          try {
            await onCreate(sourceId, event);
            onClose();
          } catch {
            setError(t('calendar.create.failed'));
          } finally {
            submitting.current = false;
            setPending(false);
          }
        }}
      >
        <FieldBlock label={t('calendar.defaultSourceName')} htmlFor={`${prefix}-source`}>
          <Select
            id={`${prefix}-source`}
            value={sourceId}
            disabled={pending}
            onChange={(event) => setSourceId(event.currentTarget.value)}
          >
            {calendars
              .filter((source) => source.canCreate)
              .map((source) => (
                <option key={source.id} value={source.id} disabled={!source.available}>
                  {source.name}
                </option>
              ))}
          </Select>
        </FieldBlock>
        <FieldBlock label={t('calendar.create.name')} htmlFor={`${prefix}-title`} required>
          <Input
            id={`${prefix}-title`}
            value={title}
            required
            disabled={pending}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
        </FieldBlock>
        <FieldBlock label={t('calendar.allDay')} htmlFor={`${prefix}-all-day`}>
          <Switch
            id={`${prefix}-all-day`}
            checked={allDay}
            disabled={pending}
            onCheckedChange={(checked) => {
              setAllDay(checked);
              setStart('');
              setEnd('');
              setError('');
            }}
          />
        </FieldBlock>
        {!allDay ? <p>{t('calendar.create.timeZone', { timeZone })}</p> : null}
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <FieldBlock label={t('calendar.create.start')} htmlFor={`${prefix}-start`} required>
            <Input
              id={`${prefix}-start`}
              type={allDay ? 'date' : 'datetime-local'}
              value={start}
              required
              disabled={pending}
              onChange={(event) => setStart(event.currentTarget.value)}
            />
          </FieldBlock>
          <FieldBlock
            label={t(allDay ? 'calendar.create.lastDay' : 'calendar.create.end')}
            htmlFor={`${prefix}-end`}
            required
          >
            <Input
              id={`${prefix}-end`}
              type={allDay ? 'date' : 'datetime-local'}
              value={end}
              required
              disabled={pending}
              onChange={(event) => setEnd(event.currentTarget.value)}
            />
          </FieldBlock>
        </div>
        <FieldBlock label={t('calendar.create.location')} htmlFor={`${prefix}-location`}>
          <Input
            id={`${prefix}-location`}
            value={location}
            disabled={pending}
            onChange={(event) => setLocation(event.currentTarget.value)}
          />
        </FieldBlock>
        <FieldBlock label={t('calendar.create.description')} htmlFor={`${prefix}-description`}>
          <Input
            id={`${prefix}-description`}
            value={description}
            disabled={pending}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
        </FieldBlock>
        {!canSubmit ? <p role="status">{t('calendar.create.unavailable')}</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="soft" size="small" disabled={pending} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="small" disabled={pending || !canSubmit}>
            {t(pending ? 'calendar.create.saving' : 'calendar.create.save')}
          </Button>
        </div>
      </form>
    </BaseCardDialog>
  );
}
