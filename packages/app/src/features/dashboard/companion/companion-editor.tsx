import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  CardDialogBody,
  CardDialogDoneFooter,
  CardDialogHeader,
  CardDialogSection,
} from '@navet/app/components/patterns/card-dialog';
import { FolderTabHandle } from '@navet/app/components/patterns/folder-tab-handle';
import { Button } from '@navet/app/components/primitives/button';
import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import { Select } from '@navet/app/components/primitives/select';
import { Textarea } from '@navet/app/components/primitives/textarea';
import { getDndTransformStyle } from '@navet/app/components/shared/dnd-transform-style';
import { getThemeDropdownSurfaceClasses } from '@navet/app/components/shared/theme/dropdown-surface-tokens';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@navet/app/components/ui/dropdown-menu';
import { getDeviceTypeIcon } from '@navet/app/constants/device-type-icons';
import { getDeviceTypeLabel } from '@navet/app/constants/device-type-labels';
import { isLawnMowerEntityId } from '@navet/app/features/vacuum/components/vacuum/vacuum-utils';
import { useI18n, useTheme } from '@navet/app/hooks';
import type { NavetEntity } from '@navet/core/types';
import { ArrowDown, ArrowUp, GripVertical, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { toast } from 'sonner';
import { AddEntityDialogPrimitive } from '../components/add-entity-dialog/primitive';
import type { DashboardLibraryCard } from '../components/dashboard-library-list';
import {
  type CompanionCard,
  type CompanionCardType,
  createDashboardId,
} from '../dashboards/dashboard-collection';

export const COMPANION_CARD_TYPES: CompanionCardType[] = [
  'entity',
  'camera',
  'weather',
  'calendar',
  'chores',
  'security',
  'clock',
  'greeting',
  'note',
];

export function useCompanionCardLabel() {
  const { t } = useI18n();
  return (type: CompanionCardType) =>
    type === 'security'
      ? t('sidebar.companion.securityCard')
      : type === 'calendar'
        ? t('deviceType.calendar')
        : type === 'chores'
          ? t('household.tabs.chores')
          : t(`sidebar.companion.${type}`);
}

export function CompanionCardEditor({
  card,
  label,
  index,
  count,
  entities,
  onChange,
  onMove,
  onRemove,
  children,
  className,
  open,
  onOpenChange,
  groupCards,
  onRemoveCard,
}: {
  groupCards?: CompanionCard[];
  onRemoveCard?: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: CompanionCard;
  label: string;
  index: number;
  count: number;
  entities: NavetEntity[];
  onChange: (card: CompanionCard) => void;
  onMove: (index: number) => void;
  onRemove: () => void;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);
  const formId = useId();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({ id: card.id });
  const sources = entities.filter((entity) => card.type === 'entity' || entity.type === card.type);
  return (
    <div
      ref={setNodeRef}
      data-companion-card-id={card.id}
      style={{ ...getDndTransformStyle(transform), transition }}
      className={`space-y-2 ${className ?? ''}`}
    >
      <FolderTabHandle
        size="compact"
        title={label}
        handle={
          <Button
            variant="ghost"
            size="compact"
            iconOnly
            label={t('sidebar.companion.drag', { name: label })}
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="shrink-0 touch-none cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </Button>
        }
        actions={
          <>
            {card.type !== 'clock' && card.type !== 'security' && card.type !== 'chores' ? (
              <Button
                variant="ghost"
                size="compact"
                iconOnly
                label={t('common.editItem', { item: label })}
                onClick={() => onOpenChange(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="compact"
                  iconOnly
                  label={`${t('common.moreActions')}: ${label}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={getThemeDropdownSurfaceClasses(theme)}>
                <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(index - 1)}>
                  <ArrowUp className="h-4 w-4" />
                  {t('sidebar.companion.moveUp', { name: label })}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(index + 1)}>
                  <ArrowDown className="h-4 w-4" />
                  {t('sidebar.companion.moveDown', { name: label })}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onRemove}>
                  <Trash2 className="h-4 w-4" />
                  {t('sidebar.companion.remove', { name: label })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      {children}
      <BaseCardDialog
        variant="modal"
        isOpen={open}
        onOpenChange={onOpenChange}
        title={t('common.editItem', { item: label })}
        titleInContent
        theme={theme}
        maxWidth="sm"
        bodyPadding={false}
        mobileCoverSheet
        persistentMobileDismiss
      >
        <CardDialogBody className={surface.textPrimary}>
          <CardDialogHeader
            title={t('common.editItem', { item: label })}
            theme={theme}
            editableTitle={false}
            showRoomSelector={false}
          />
          {card.type === 'entity' ||
          card.type === 'camera' ||
          card.type === 'weather' ||
          card.type === 'calendar'
            ? (groupCards ?? [card]).map((sourceCard) => (
                <CardDialogSection
                  key={sourceCard.id}
                  label={
                    <label htmlFor={`${formId}-${sourceCard.id}-source`}>
                      {t('sidebar.companion.source')}
                    </label>
                  }
                >
                  <div className="flex items-center gap-2">
                    <Select
                      id={`${formId}-${sourceCard.id}-source`}
                      value={sourceCard.entityId ?? ''}
                      onChange={(event) =>
                        onChange({ ...sourceCard, entityId: event.target.value || undefined })
                      }
                    >
                      {card.type !== 'entity' ? (
                        <option value="">{t('sidebar.companion.automatic')}</option>
                      ) : null}
                      {sourceCard.entityId &&
                      !sources.some((source) => source.canonicalId === sourceCard.entityId) ? (
                        <option value={sourceCard.entityId}>{t('common.unavailable')}</option>
                      ) : null}
                      {sources.map((entity) => (
                        <option key={entity.canonicalId} value={entity.canonicalId}>
                          {entity.name} · {entity.room ?? entity.providerId}
                        </option>
                      ))}
                    </Select>
                    {groupCards && onRemoveCard ? (
                      <Button
                        variant="ghost"
                        size="compact"
                        iconOnly
                        label={t('sidebar.companion.remove', {
                          name:
                            entities.find((entity) => entity.canonicalId === sourceCard.entityId)
                              ?.name ?? label,
                        })}
                        onClick={() => onRemoveCard(sourceCard.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </CardDialogSection>
              ))
            : null}
          {card.type === 'note' || card.type === 'greeting' ? (
            <CardDialogSection
              label={
                <label htmlFor={`${formId}-text`}>
                  {t(
                    card.type === 'note'
                      ? 'sidebar.companion.noteText'
                      : 'sidebar.companion.greeting'
                  )}
                </label>
              }
            >
              <Textarea
                id={`${formId}-text`}
                value={card.text ?? ''}
                maxLength={4000}
                rows={4}
                onChange={(event) => onChange({ ...card, text: event.target.value })}
              />
            </CardDialogSection>
          ) : null}
          <CardDialogDoneFooter label={t('common.done')} />
        </CardDialogBody>
      </BaseCardDialog>
    </div>
  );
}

export function CompanionEditorList({
  cards,
  groups = cards.map((card) => [card]),
  onChange,
  children,
}: {
  cards: CompanionCard[];
  groups?: CompanionCard[][];
  onChange: (cards: CompanionCard[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) {
          const from = groups.findIndex((group) => group[0].id === active.id);
          const to = groups.findIndex((group) => group[0].id === over.id);
          if (from !== -1 && to !== -1) onChange(arrayMove(groups, from, to).flat());
        }
      }}
    >
      <SortableContext
        items={groups.map((group) => group[0].id)}
        strategy={verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function CompanionAddCardDialog({
  entities,
  cards = [],
  onRemove,
  remainingCapacity = 64,
  onAdd,
  onClose,
}: {
  entities: NavetEntity[];
  cards?: CompanionCard[];
  onRemove?: (ids: string[]) => void;
  remainingCapacity?: number;
  onAdd: (cards: CompanionCard[]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const label = useCompanionCardLabel();
  const items = new Map<string, Omit<CompanionCard, 'id'>>();
  const libraryCards: DashboardLibraryCard[] = entities.map((entity) => {
    const type =
      entity.type === 'camera' || entity.type === 'weather' || entity.type === 'calendar'
        ? entity.type
        : 'entity';
    items.set(entity.canonicalId, { type, entityId: entity.canonicalId });
    const isLawnMower = entity.type === 'vacuum' && isLawnMowerEntityId(entity.canonicalId);
    const typeLabel = isLawnMower
      ? t('lawnMower.subtitle')
      : getDeviceTypeLabel(
          entity.type === 'media_player'
            ? 'media'
            : entity.type === 'switch'
              ? 'switches'
              : entity.type === 'binary_sensor'
                ? 'sensors'
                : entity.type === 'climate' || entity.type === 'weather' || entity.type === 'hvac'
                  ? entity.type
                  : `${entity.type}s`,
          t
        );
    return {
      icon: getDeviceTypeIcon(entity.type),
      id: entity.canonicalId,
      title: entity.name,
      subtitle: entity.room ?? entity.providerId,
      room: entity.room,
      meta: typeLabel,
      entityType: isLawnMower ? 'lawn_mower' : entity.type,
      entityTypeLabel: typeLabel,
      kind: 'device',
    };
  });
  for (const type of COMPANION_CARD_TYPES) {
    if (type === 'entity' || type === 'camera' || type === 'weather' || type === 'calendar')
      continue;
    const id = `companion-${type}`;
    items.set(id, { type, ...(type === 'note' ? { text: '' } : {}) });
    libraryCards.push({
      id,
      title: label(type),
      subtitle: '',
      meta: label(type),
      entityType: type,
      entityTypeLabel: label(type),
      kind: 'widget',
    });
  }
  const libraryId = (card: CompanionCard) =>
    card.entityId ??
    (card.type === 'camera' || card.type === 'weather' || card.type === 'calendar'
      ? entities.find((entity) => entity.type === card.type)?.canonicalId
      : undefined) ??
    `companion-${card.type}`;
  return (
    <AddEntityDialogPrimitive
      open
      onClose={onClose}
      title={t('sidebar.companion.addCard')}
      description={t('sidebar.companion.chooseItems')}
      currentRoom="All"
      libraryOnly
      libraryCards={libraryCards}
      libraryEmptyText={t('sidebar.companion.noMatches')}
      actionLabel={t('sidebar.companion.addCard')}
      libraryAddDisabled={remainingCapacity < 1}
      libraryRemoval={
        onRemove
          ? {
              ids: cards.map(libraryId),
              label: t('todo.removeItem'),
              onRemove: (id) => {
                onRemove(cards.filter((card) => libraryId(card) === id).map((card) => card.id));
                const name = libraryCards.find((card) => card.id === id)?.title;
                if (name) toast.success(t('sidebar.companion.removed', { name }));
              },
            }
          : undefined
      }
      onAddCard={() => {}}
      onAddLibraryCard={(id) => {
        const item = items.get(id);
        if (!item || remainingCapacity < 1 || cards.some((card) => libraryId(card) === id)) return;
        onAdd([{ ...item, id: createDashboardId('companion') }]);
        const name = libraryCards.find((card) => card.id === id)?.title;
        if (name) toast.success(t('sidebar.companion.added', { name }));
        if (item.type === 'note' || item.type === 'greeting') onClose();
      }}
      footer={
        <>
          {remainingCapacity < 1 ? <p role="status">{t('sidebar.companion.limit')}</p> : null}
          <Button onClick={onClose}>{t('common.done')}</Button>
        </>
      }
    />
  );
}
