import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { getThemeColorValue } from '@navet/app/components/shared/theme/theme-colors';
import { useI18n, useTheme } from '@navet/app/hooks';
import { useIntegrationStore } from '@navet/app/hooks/use-integration-store';
import { integrationSelectors } from '@navet/app/stores/selectors';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DashboardLibraryCard, DashboardLibraryEntityType } from '../dashboard-library-list';
import { createCardTemplates } from './templates';
import type { AddEntityDialogPrimitiveProps, CardTemplateId } from './types';
import { AddEntityDialogView } from './view';

function resolveLibraryEntityType(card: DashboardLibraryCard) {
  const explicitType = card.entityType?.trim().toLowerCase();
  const nativeId = card.id.includes(':') ? card.id.slice(card.id.lastIndexOf(':') + 1) : card.id;
  const domain = nativeId.includes('.') ? nativeId.slice(0, nativeId.indexOf('.')) : '';
  const key = explicitType || domain || card.meta.trim().toLowerCase() || 'other';
  const label = card.entityTypeLabel?.trim() || card.meta.trim() || key;

  return { key, label };
}

function resolveLibraryRoom(card: DashboardLibraryCard) {
  return card.room?.trim() || card.subtitle.trim();
}

export function AddEntityDialogPrimitive({
  open,
  onClose,
  onAddCard,
  onAddLibraryCard,
  currentRoom,
  libraryCards,
  showCardsTab = true,
  libraryOnly = false,
  libraryAddDisabled,
  libraryRemoval,
  title,
  description,
  actionLabel,
  libraryEmptyText,
  footer,
  allowedTemplateIds,
}: AddEntityDialogPrimitiveProps) {
  const { locale, t } = useI18n();
  const { theme, primaryColor } = useTheme();
  const providerSessions = useIntegrationStore(integrationSelectors.providerSessions);
  const hasHomeAssistantSession = Boolean(providerSessions.home_assistant);
  const [activeTab, setActiveTab] = useState<'cards' | 'widgets'>(
    showCardsTab || libraryOnly ? 'cards' : 'widgets'
  );
  const [libraryQuery, setLibraryQuery] = useState('');
  const [recentlyAddedLibraryCardIds, setRecentlyAddedLibraryCardIds] = useState<string[]>([]);
  const [selectedLibraryEntityType, setSelectedLibraryEntityType] = useState<string | null>(null);
  const [selectedLibraryRoom, setSelectedLibraryRoom] = useState<string | null>(null);
  const [librarySortDirection, setLibrarySortDirection] = useState<'asc' | 'desc' | null>(null);
  const [customCardQuery, setCustomCardQuery] = useState('');
  const [customCardSortDirection, setCustomCardSortDirection] = useState<'asc' | 'desc' | null>(
    null
  );
  const [selectedCustomCardSize, setSelectedCustomCardSize] = useState<CardSize | null>(null);
  const [selectedType, setSelectedType] = useState<CardTemplateId | null>(null);
  const [selectedSize, setSelectedSize] = useState<CardSize>('medium');
  const resolveColorValue = (color: string) => getThemeColorValue(color as typeof primaryColor);
  const cardTemplates = useMemo(() => {
    if (libraryOnly) return [];
    const templates = createCardTemplates(t);
    const allowedIds = allowedTemplateIds?.length ? new Set(allowedTemplateIds) : null;
    const providerEligibleTemplates = hasHomeAssistantSession
      ? templates
      : templates.filter((template) => template.id !== 'assist');
    const visibleTemplates = allowedIds
      ? providerEligibleTemplates.filter((template) => allowedIds.has(template.id))
      : providerEligibleTemplates;

    return visibleTemplates.sort((left, right) =>
      t(left.nameKey).localeCompare(t(right.nameKey), locale)
    );
  }, [allowedTemplateIds, hasHomeAssistantSession, libraryOnly, locale, t]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveTab(showCardsTab || libraryOnly ? 'cards' : 'widgets');
    setLibraryQuery('');
    setRecentlyAddedLibraryCardIds([]);
    setSelectedLibraryEntityType(null);
    setSelectedLibraryRoom(null);
    setLibrarySortDirection(null);
    setCustomCardQuery('');
    setCustomCardSortDirection(null);
    setSelectedCustomCardSize(null);
    setSelectedType(null);
    setSelectedSize('medium');
  }, [open, showCardsTab, libraryOnly]);

  const handleAdd = () => {
    const selectedTemplate = cardTemplates.find((template) => template.id === selectedType);
    if (!selectedTemplate) return;

    onAddCard(selectedTemplate, selectedSize);
    setSelectedType(null);
    setSelectedSize('medium');
  };

  const handleAddFromLibrary = (cardId: string) => {
    if (libraryAddDisabled) return;
    onAddLibraryCard(cardId);
    setRecentlyAddedLibraryCardIds((current) =>
      current.includes(cardId) ? current : [...current, cardId]
    );
  };

  const normalizeSearchText = useCallback(
    (value: string) =>
      value
        .toLowerCase()
        .replace(/[._-]+/g, ' ')
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    []
  );

  const visibleLibraryCards = useMemo(() => {
    if (libraryRemoval || recentlyAddedLibraryCardIds.length === 0) {
      return libraryCards;
    }

    const recentlyAddedIds = new Set(recentlyAddedLibraryCardIds);
    return libraryCards.filter((card) => !recentlyAddedIds.has(card.id));
  }, [libraryCards, recentlyAddedLibraryCardIds, libraryRemoval]);

  const libraryEntityTypes = useMemo<DashboardLibraryEntityType[]>(() => {
    const groups = new Map<string, DashboardLibraryEntityType>();

    for (const card of visibleLibraryCards) {
      const { key, label } = resolveLibraryEntityType(card);
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        groups.set(key, { key, label, count: 1, icon: card.icon });
      }
    }

    return [...groups.values()].sort((left, right) =>
      left.label.localeCompare(right.label, locale)
    );
  }, [locale, visibleLibraryCards]);

  const effectiveSelectedLibraryEntityType = libraryEntityTypes.some(
    ({ key }) => key === selectedLibraryEntityType
  )
    ? selectedLibraryEntityType
    : null;

  const libraryRooms = useMemo(
    () =>
      [...new Set(visibleLibraryCards.map(resolveLibraryRoom).filter(Boolean))].sort(
        (left, right) => left.localeCompare(right, locale)
      ),
    [locale, visibleLibraryCards]
  );

  const effectiveSelectedLibraryRoom = libraryRooms.includes(selectedLibraryRoom ?? '')
    ? selectedLibraryRoom
    : null;

  const filteredLibraryCards = useMemo(() => {
    const cardsInSelectedRoom = effectiveSelectedLibraryRoom
      ? visibleLibraryCards.filter(
          (card) => resolveLibraryRoom(card) === effectiveSelectedLibraryRoom
        )
      : visibleLibraryCards;
    const cardsInSelectedType = effectiveSelectedLibraryEntityType
      ? cardsInSelectedRoom.filter(
          (card) => resolveLibraryEntityType(card).key === effectiveSelectedLibraryEntityType
        )
      : cardsInSelectedRoom;
    const rawTerms = libraryQuery.trim().split(/\s+/).filter(Boolean);

    const matchingCards =
      rawTerms.length === 0
        ? cardsInSelectedType
        : cardsInSelectedType.filter((card) => {
            const rawVisibleSearchableText =
              `${card.title} ${card.subtitle} ${card.meta} ${card.kind}`.toLowerCase().trim();
            const rawIdSearchableText = (card.idSearchText ?? card.id).toLowerCase();
            const searchableText = normalizeSearchText(rawVisibleSearchableText);

            return rawTerms.every((rawTerm) => {
              const loweredRawTerm = rawTerm.toLowerCase();
              const normalizedTerm = normalizeSearchText(rawTerm);
              const hasDotSyntax = loweredRawTerm.includes('.');

              if (hasDotSyntax) {
                return (
                  rawVisibleSearchableText.includes(loweredRawTerm) ||
                  rawIdSearchableText.includes(loweredRawTerm)
                );
              }

              return (
                rawVisibleSearchableText.includes(loweredRawTerm) ||
                (!!normalizedTerm && searchableText.includes(normalizedTerm))
              );
            });
          });

    if (librarySortDirection === null) {
      return matchingCards;
    }

    return [...matchingCards].sort((left, right) => {
      const titleOrder = left.title.localeCompare(right.title, locale);
      const stableOrder = titleOrder || left.id.localeCompare(right.id, locale);
      return librarySortDirection === 'asc' ? stableOrder : -stableOrder;
    });
  }, [
    effectiveSelectedLibraryEntityType,
    effectiveSelectedLibraryRoom,
    librarySortDirection,
    libraryQuery,
    locale,
    normalizeSearchText,
    visibleLibraryCards,
  ]);

  const hasLibraryQuery = libraryQuery.trim().length > 0;
  const customCardSizes = useMemo(
    () =>
      (
        [
          'tiny',
          'extra-small',
          'small',
          'medium',
          'medium-vertical',
          'large',
          'extra-large',
          'extra-wide',
        ] as CardSize[]
      ).filter((size) => cardTemplates.some((template) => template.supportedSizes.includes(size))),
    [cardTemplates]
  );
  const effectiveSelectedCustomCardSize = customCardSizes.includes(
    selectedCustomCardSize as CardSize
  )
    ? selectedCustomCardSize
    : null;
  const filteredCardTemplates = useMemo(() => {
    const normalizedQuery = normalizeSearchText(customCardQuery);
    const matches = cardTemplates.filter((template) => {
      if (
        effectiveSelectedCustomCardSize &&
        !template.supportedSizes.includes(effectiveSelectedCustomCardSize)
      ) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return normalizeSearchText(`${t(template.nameKey)} ${t(template.descriptionKey)}`).includes(
        normalizedQuery
      );
    });
    if (customCardSortDirection === null) {
      return matches;
    }
    return [...matches].sort((left, right) => {
      const order = t(left.nameKey).localeCompare(t(right.nameKey), locale);
      return customCardSortDirection === 'asc' ? order : -order;
    });
  }, [
    cardTemplates,
    customCardQuery,
    customCardSortDirection,
    effectiveSelectedCustomCardSize,
    locale,
    normalizeSearchText,
    t,
  ]);

  return (
    <AddEntityDialogView
      open={open}
      onClose={onClose}
      currentRoom={currentRoom}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      showCardsTab={showCardsTab || libraryOnly}
      libraryOnly={libraryOnly}
      libraryAddDisabled={libraryAddDisabled}
      libraryRemoval={libraryRemoval}
      title={title}
      description={description}
      actionLabel={actionLabel}
      libraryEmptyText={libraryEmptyText}
      footer={footer}
      libraryQuery={libraryQuery}
      setLibraryQuery={setLibraryQuery}
      hasLibraryQuery={hasLibraryQuery}
      libraryCount={filteredLibraryCards.length}
      filteredLibraryCards={filteredLibraryCards}
      libraryEntityTypes={libraryEntityTypes}
      selectedLibraryEntityType={effectiveSelectedLibraryEntityType}
      setSelectedLibraryEntityType={setSelectedLibraryEntityType}
      libraryRooms={libraryRooms}
      selectedLibraryRoom={effectiveSelectedLibraryRoom}
      setSelectedLibraryRoom={setSelectedLibraryRoom}
      librarySortDirection={librarySortDirection}
      setLibrarySortDirection={setLibrarySortDirection}
      customCardQuery={customCardQuery}
      setCustomCardQuery={setCustomCardQuery}
      customCardSortDirection={customCardSortDirection}
      setCustomCardSortDirection={setCustomCardSortDirection}
      customCardSizes={customCardSizes}
      selectedCustomCardSize={effectiveSelectedCustomCardSize}
      setSelectedCustomCardSize={setSelectedCustomCardSize}
      theme={theme}
      primaryColor={primaryColor}
      cardTemplates={cardTemplates}
      filteredCardTemplates={filteredCardTemplates}
      selectedType={selectedType}
      setSelectedType={setSelectedType}
      selectedSize={selectedSize}
      setSelectedSize={setSelectedSize}
      getColorValue={resolveColorValue}
      handleAdd={handleAdd}
      handleAddFromLibrary={handleAddFromLibrary}
    />
  );
}
