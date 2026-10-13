import { BaseCard, Button } from '@navet/app/components/primitives';
import {
  type CardSize,
  getCompactCardSize,
  isCompactCardSize,
} from '@navet/app/components/shared/card-size-selector';
import { useEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import { getCustomCardTintSurface } from '@navet/app/components/shared/theme/custom-card-tint-surface';
import { useI18n, useTheme } from '@navet/app/hooks';
import { integrationCalendarFeatureService } from '@navet/app/services/integration-calendar-feature.service';
import { memo, useState } from 'react';
import { CalendarCreateEventDialog } from './calendar/calendar-create-event-dialog';
import { CalendarEventDialog } from './calendar/calendar-event-dialog';
import { CalendarLargeView } from './calendar/calendar-large-view';
import { CalendarMediumView } from './calendar/calendar-medium-view';
import { CalendarSettingsDialog } from './calendar/calendar-settings-dialog';
import { CalendarSmallView } from './calendar/calendar-small-view';
import type { CalendarEvent } from './calendar/types';
import { useCalendarCardSources } from './calendar/use-calendar-card-sources';
import { useCalendarData } from './calendar/use-calendar-data';
import { useCalendarTheme } from './calendar/use-calendar-theme';

interface CalendarCardProps {
  id?: string;
  name?: string;
  room?: string;
  events?: CalendarEvent[];
  inEditMode?: boolean;
  size?: CardSize;
  onSizeChange?: (size: CardSize) => void;
}

export const CalendarCard = memo(function CalendarCard({
  id,
  name,
  events,
  inEditMode = false,
  size = 'medium',
  onSizeChange: _onSizeChange,
}: CalendarCardProps) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const effectiveSize = getCompactCardSize(size);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const {
    availableCalendars,
    selectedCalendarIds,
    selectedEvents,
    setSelectedCalendarIds,
    setTintColor,
    setViewMode,
    tintColor,
    viewMode,
  } = useCalendarCardSources(id, events ?? []);
  const writableCalendars = availableCalendars.filter(
    (calendar) => selectedCalendarIds.includes(calendar.id) && calendar.canCreate
  );
  const { nextEvent, smallGroups, mediumGroups, largeGroups } = useCalendarData(selectedEvents);
  const tintSurface = getCustomCardTintSurface(theme, tintColor);
  const hasCustomTint = Boolean(tintSurface.panelStyle);
  const isGlassTheme = theme === 'glass';

  const { textPrimary, textSecondary, overlayBg, dividerColor, hoverBg, hoverText } =
    useCalendarTheme(
      theme,
      tintSurface.backgroundColor,
      tintSurface.textPrimaryColor,
      tintSurface.textSecondaryColor
    );

  const isSmall = isCompactCardSize(effectiveSize);
  const isMedium = effectiveSize === 'medium';
  const displayName = name ?? t('calendar.defaultTitle');
  useEditModeSettingsRequest(id ?? displayName, () => setIsSettingsOpen(true), inEditMode);

  return (
    <>
      <BaseCard
        size={effectiveSize}
        interactive={!inEditMode}
        className={`
          group transition-[color,background-color,border-color,box-shadow,opacity,transform,filter] duration-300
          ${!inEditMode ? 'cursor-pointer' : ''}
        `}
        style={hasCustomTint ? tintSurface.panelStyle : undefined}
        readableBackgroundColor={tintSurface.backgroundColor}
        disableDefaultSheen={!isGlassTheme}
        overlay={
          <>
            {hasCustomTint && !isGlassTheme ? (
              <div
                className={`pointer-events-none absolute inset-0 rounded-[inherit] ${overlayBg}`}
              />
            ) : null}
            {hasCustomTint && tintSurface.glowStyle ? (
              <div
                className="pointer-events-none absolute inset-0 rounded-[inherit]"
                style={tintSurface.glowStyle}
              />
            ) : null}
            {hasCustomTint && tintSurface.overlayClassName ? (
              <div
                className={`pointer-events-none absolute inset-0 rounded-[inherit] ${tintSurface.overlayClassName}`}
              />
            ) : null}
          </>
        }
        contentClassName="h-full"
      >
        <div className="relative flex h-full flex-col">
          {!inEditMode && writableCalendars.length > 0 ? (
            <div className="mb-2 flex justify-end">
              <Button
                size="small"
                variant="soft"
                disabled={!writableCalendars.some((calendar) => calendar.available)}
                onClick={() => setIsCreateOpen(true)}
              >
                {t('calendar.create.title')}
              </Button>
            </div>
          ) : null}
          {!nextEvent ? (
            <div
              className="flex flex-1 items-center justify-center text-sm"
              style={{ color: textSecondary }}
            >
              {t('calendar.noUpcomingEvents')}
            </div>
          ) : isSmall ? (
            <CalendarSmallView
              dayGroups={smallGroups}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              hoverText={hoverText}
              hoverBg={hoverBg}
              onEventClick={inEditMode ? undefined : setSelectedEvent}
            />
          ) : isMedium ? (
            <CalendarMediumView
              dayGroups={mediumGroups}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              hoverText={hoverText}
              hoverBg={hoverBg}
              dividerColor={dividerColor}
              onEventClick={inEditMode ? undefined : setSelectedEvent}
            />
          ) : (
            <CalendarLargeView
              dayGroups={largeGroups}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              hoverText={hoverText}
              hoverBg={hoverBg}
              dividerColor={dividerColor}
              onEventClick={inEditMode ? undefined : setSelectedEvent}
            />
          )}
        </div>
      </BaseCard>

      {isCreateOpen ? (
        <CalendarCreateEventDialog
          calendars={writableCalendars}
          theme={theme}
          onClose={() => setIsCreateOpen(false)}
          onCreate={(entityId, event) =>
            integrationCalendarFeatureService.createEvent(entityId, event)
          }
        />
      ) : null}

      {isSettingsOpen ? (
        <CalendarSettingsDialog
          entityId={id}
          isOpen={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          theme={theme}
          title={displayName}
          calendars={availableCalendars.map((calendar) => ({
            id: calendar.id,
            name: calendar.name,
            room: calendar.room,
            color: calendar.color,
          }))}
          selectedCalendarIds={selectedCalendarIds}
          onSelectedCalendarIdsChange={setSelectedCalendarIds}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          tintColor={tintColor}
          onTintColorChange={setTintColor}
        />
      ) : null}

      {selectedEvent ? (
        <CalendarEventDialog
          event={selectedEvent}
          isOpen={selectedEvent !== null}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedEvent(null);
            }
          }}
          theme={theme}
        />
      ) : null}
    </>
  );
});
