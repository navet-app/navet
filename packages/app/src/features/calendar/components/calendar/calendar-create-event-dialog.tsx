import { FieldBlock } from '@navet/app/components/patterns';
import { CardDialogFooter } from '@navet/app/components/patterns/card-dialog';
import { BaseCardDialog, Button, Input, Select, Textarea } from '@navet/app/components/primitives';
import { DialogHeader } from '@navet/app/components/shared/device-editor';
import { DeviceControlRow } from '@navet/app/components/shared/device-editor/device-control-row';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { navetTypographyTokens } from '@navet/app/components/system/tokens';
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
  const surface = getThemeSurfaceTokens(theme);
  const fieldLabelClassName = `${navetTypographyTokens.caption} ${surface.textSecondary}`;
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
      mobileCoverSheet
      persistentMobileDismiss
      titleInContent
      height="capped"
      contentClassName="flex flex-col"
      shellBodyClassName="flex min-h-0 min-w-0 flex-1 flex-col"
      bodyClassName="flex min-h-0 min-w-0 flex-1 flex-col"
      isOpen
      onOpenChange={(open) => {
        if (!open && !submitting.current) onClose();
      }}
      title={t('calendar.create.title')}
      theme={theme}
    >
      <div className="shrink-0">
        <DialogHeader title={t('calendar.create.title')} isOn={theme !== 'light'} />
      </div>
      <form
        className={`flex min-h-0 min-w-0 flex-1 flex-col ${surface.textPrimary}`}
        aria-busy={pending}
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
        <section
          aria-label={t('calendar.event.details')}
          className="min-h-0 min-w-0 max-w-full space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain"
        >
          <div className="min-w-0 space-y-3">
            <FieldBlock
              label={t('calendar.create.name')}
              htmlFor={`${prefix}-title`}
              labelClassName={fieldLabelClassName}
            >
              <Input
                id={`${prefix}-title`}
                value={title}
                required
                disabled={pending}
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
            </FieldBlock>
            <FieldBlock
              label={t('calendar.defaultSourceName')}
              htmlFor={`${prefix}-source`}
              labelClassName={fieldLabelClassName}
            >
              <Select
                id={`${prefix}-source`}
                containerClassName="min-w-0 max-w-full"
                selectClassName="min-w-0 max-w-full"
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
          </div>
          <div className={`min-w-0 space-y-3 border-t pt-3 ${surface.dividerBorder}`}>
            <DeviceControlRow
              kind="toggle"
              label={t('calendar.allDay')}
              theme={theme}
              checked={allDay}
              disabled={pending}
              onCheckedChange={(checked) => {
                setAllDay(checked);
                setStart('');
                setEnd('');
                setError('');
              }}
            />
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <FieldBlock
                label={t('calendar.create.start')}
                htmlFor={`${prefix}-start`}
                className="min-w-0"
                labelClassName={fieldLabelClassName}
              >
                <Input
                  id={`${prefix}-start`}
                  type={allDay ? 'date' : 'datetime-local'}
                  inputClassName="calendar-event-native-input"
                  style={{ colorScheme: theme === 'light' ? 'light' : 'dark' }}
                  aria-describedby={allDay ? undefined : `${prefix}-time-zone`}
                  value={start}
                  required
                  disabled={pending}
                  onChange={(event) => setStart(event.currentTarget.value)}
                />
              </FieldBlock>
              <FieldBlock
                label={t(allDay ? 'calendar.create.lastDay' : 'calendar.create.end')}
                htmlFor={`${prefix}-end`}
                className="min-w-0"
                labelClassName={fieldLabelClassName}
              >
                <Input
                  id={`${prefix}-end`}
                  type={allDay ? 'date' : 'datetime-local'}
                  inputClassName="calendar-event-native-input"
                  style={{ colorScheme: theme === 'light' ? 'light' : 'dark' }}
                  aria-describedby={allDay ? undefined : `${prefix}-time-zone`}
                  value={end}
                  required
                  disabled={pending}
                  onChange={(event) => setEnd(event.currentTarget.value)}
                />
              </FieldBlock>
            </div>
            {!allDay ? (
              <p
                id={`${prefix}-time-zone`}
                className={`${navetTypographyTokens.compactHelper} ${surface.textSecondary}`}
              >
                {t('calendar.create.timeZone', { timeZone })}
              </p>
            ) : null}
          </div>
          <div className={`min-w-0 space-y-3 border-t pt-4 ${surface.dividerBorder}`}>
            <FieldBlock
              label={t('calendar.create.location')}
              htmlFor={`${prefix}-location`}
              labelClassName={fieldLabelClassName}
            >
              <Input
                id={`${prefix}-location`}
                value={location}
                disabled={pending}
                onChange={(event) => setLocation(event.currentTarget.value)}
              />
            </FieldBlock>
            <FieldBlock
              label={t('calendar.create.description')}
              htmlFor={`${prefix}-description`}
              labelClassName={fieldLabelClassName}
            >
              <Textarea
                id={`${prefix}-description`}
                containerClassName="min-w-0 max-w-full"
                textareaClassName="min-w-0 max-w-full resize-y"
                rows={3}
                value={description}
                disabled={pending}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </FieldBlock>
          </div>
        </section>
        {!canSubmit ? (
          <p
            role="status"
            className={`mt-3 shrink-0 ${navetTypographyTokens.compactHelper} ${surface.textSecondary}`}
          >
            {t('calendar.create.unavailable')}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className={`mt-3 shrink-0 ${navetTypographyTokens.compactHelper}`}>
            {error}
          </p>
        ) : null}
        <CardDialogFooter className={`mt-4 shrink-0 border-t pt-4 ${surface.dividerBorder}`}>
          <Button type="button" variant="soft" disabled={pending} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={pending || !canSubmit}>
            {t(pending ? 'calendar.create.saving' : 'calendar.create.save')}
          </Button>
        </CardDialogFooter>
      </form>
    </BaseCardDialog>
  );
}
