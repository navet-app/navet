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
import { Button } from '@navet/app/components/primitives/button';
import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import { Input } from '@navet/app/components/primitives/input';
import { Select } from '@navet/app/components/primitives/select';
import { getDndTransformStyle } from '@navet/app/components/shared/dnd-transform-style';
import { getThemeDropdownSurfaceClasses } from '@navet/app/components/shared/theme/dropdown-surface-tokens';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@navet/app/components/ui/dropdown-menu';
import { useI18n, useTheme } from '@navet/app/hooks';
import type { NavetEntity } from '@navet/core/types';
import { ArrowDown, ArrowUp, GripVertical, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import type { CompanionCard, CompanionCardType } from '../dashboards/dashboard-collection';

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
  open,
  onOpenChange,
}: {
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
      style={{ ...getDndTransformStyle(transform), transition }}
      className="space-y-2"
    >
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="compact"
          iconOnly
          label={t('sidebar.companion.drag', { name: label })}
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="touch-none"
        >
          <GripVertical className="h-4 w-4" />
        </Button>
        <p className="min-w-0 flex-1 truncate text-xs font-medium">{label}</p>
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
      </div>
      {children}
      <BaseCardDialog
        variant="modal"
        isOpen={open}
        onOpenChange={onOpenChange}
        title={t('common.editItem', { item: label })}
        theme={theme}
      >
        <div className="space-y-4 p-5">
          {card.type === 'entity' ||
          card.type === 'camera' ||
          card.type === 'weather' ||
          card.type === 'calendar' ? (
            <div className="space-y-2 text-sm">
              <label htmlFor={`${formId}-source`}>{t('sidebar.companion.source')}</label>
              <Select
                id={`${formId}-source`}
                value={card.entityId ?? ''}
                onChange={(event) =>
                  onChange({ ...card, entityId: event.target.value || undefined })
                }
              >
                {card.type !== 'entity' ? (
                  <option value="">{t('sidebar.companion.automatic')}</option>
                ) : null}
                {card.entityId &&
                !sources.some((source) => source.canonicalId === card.entityId) ? (
                  <option value={card.entityId}>{t('common.unavailable')}</option>
                ) : null}
                {sources.map((entity) => (
                  <option key={entity.canonicalId} value={entity.canonicalId}>
                    {entity.name} · {entity.room ?? entity.providerId}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          {card.type === 'note' || card.type === 'greeting' ? (
            <div className="space-y-2 text-sm">
              <label htmlFor={`${formId}-text`}>
                {t(
                  card.type === 'note' ? 'sidebar.companion.noteText' : 'sidebar.companion.greeting'
                )}
              </label>
              <textarea
                id={`${formId}-text`}
                value={card.text ?? ''}
                maxLength={4000}
                rows={4}
                className={`w-full rounded-xl border p-3 ${surface.inputBg} ${surface.border}`}
                onChange={(event) => onChange({ ...card, text: event.target.value })}
              />
            </div>
          ) : null}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.done')}
          </Button>
        </div>
      </BaseCardDialog>
    </div>
  );
}

export function CompanionEditorList({
  cards,
  onChange,
  children,
}: {
  cards: CompanionCard[];
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
          const from = cards.findIndex((card) => card.id === active.id);
          const to = cards.findIndex((card) => card.id === over.id);
          if (from !== -1 && to !== -1) onChange(arrayMove(cards, from, to));
        }
      }}
    >
      <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function CompanionAddCardDialog({
  entities,
  onAdd,
  onClose,
}: {
  entities: NavetEntity[];
  onAdd: (card: CompanionCard) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const label = useCompanionCardLabel();
  const formId = useId();
  const [type, setType] = useState<CompanionCardType>('entity');
  const [query, setQuery] = useState('');
  const [entityId, setEntityId] = useState('');
  const needsSource =
    type === 'entity' || type === 'camera' || type === 'weather' || type === 'calendar';
  const sources = entities.filter(
    (entity) =>
      (type === 'entity' || entity.type === type) &&
      `${entity.name} ${entity.room ?? ''} ${entity.providerId}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase())
  );
  const selected =
    sources.find((entity) => entity.canonicalId === entityId)?.canonicalId ??
    sources[0]?.canonicalId;
  return (
    <BaseCardDialog
      variant="modal"
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('sidebar.companion.addCard')}
      theme={theme}
    >
      <form
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (needsSource && !selected) return;
          onAdd({
            id: crypto.randomUUID(),
            type,
            ...(needsSource ? { entityId: selected } : {}),
            ...(type === 'note' ? { text: '' } : {}),
          });
          onClose();
        }}
      >
        <div className="space-y-2">
          <label htmlFor={`${formId}-type`}>{t('sidebar.companion.cardType')}</label>
          <Select
            id={`${formId}-type`}
            value={type}
            onChange={(event) => {
              setType(event.target.value as CompanionCardType);
              setEntityId('');
              setQuery('');
            }}
          >
            {COMPANION_CARD_TYPES.map((type) => (
              <option key={type} value={type}>
                {label(type)}
              </option>
            ))}
          </Select>
        </div>
        {needsSource ? (
          <>
            <div className="space-y-2">
              <label htmlFor={`${formId}-search`}>{t('sidebar.companion.search')}</label>
              <Input
                id={`${formId}-search`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor={`${formId}-entity`}>{t('sidebar.companion.source')}</label>
              <Select
                id={`${formId}-entity`}
                value={selected ?? ''}
                disabled={!sources.length}
                onChange={(event) => setEntityId(event.target.value)}
              >
                {!sources.length ? (
                  <option value="">{t('sidebar.companion.noMatches')}</option>
                ) : null}
                {sources.map((entity) => (
                  <option key={entity.canonicalId} value={entity.canonicalId}>
                    {entity.name} · {entity.room ?? entity.providerId}
                  </option>
                ))}
              </Select>
            </div>
          </>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={needsSource && !selected}>
            {t('sidebar.companion.addCard')}
          </Button>
        </div>
      </form>
    </BaseCardDialog>
  );
}
