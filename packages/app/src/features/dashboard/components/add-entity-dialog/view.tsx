import { HeaderSearchInput } from '@navet/app/components/layout/header-search-input';
import { CardDialogHeader, NavigationWorkspace } from '@navet/app/components/patterns';
import {
  BaseCardDialog,
  Button,
  coverSheetHeaderClassName,
  DialogFooter,
  IconButton,
  InteractivePill,
} from '@navet/app/components/primitives';
import { type CardSize, getCardSizeRatio } from '@navet/app/components/shared/card-size-selector';
import { getAddCardDialogSurfaceTokens } from '@navet/app/components/shared/theme/add-card-dialog-surface-tokens';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { getThemeFocusRingClassName } from '@navet/app/components/system/tokens';
import { getUiKitGlassSurfaceFoundationStyle } from '@navet/app/components/system/tokens/ui-kit-surfaces';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@navet/app/components/ui/dropdown-menu';
import { cn } from '@navet/app/components/ui/utils';
import { isAllRooms } from '@navet/app/constants/rooms';
import { type ThemeType, useI18n } from '@navet/app/hooks';
import {
  ArrowDownAZ,
  ArrowLeft,
  ArrowUpDown,
  ArrowUpZA,
  ChevronRight,
  Layers2,
  ListFilter,
  Sparkles,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import {
  type DashboardLibraryCard,
  type DashboardLibraryEntityType,
  DashboardLibraryList,
  type DashboardLibraryRemoval,
} from '../dashboard-library-list';
import type { CardTemplate, CardTemplateId } from './types';

function cardSizeKey(size: CardSize): `dashboard.addCard.size.${CardSize}` {
  return `dashboard.addCard.size.${size}`;
}

interface AddEntityDialogViewProps {
  libraryRemoval?: DashboardLibraryRemoval;
  open: boolean;
  onClose: () => void;
  currentRoom: string;
  activeTab: 'cards' | 'widgets';
  setActiveTab: (tab: 'cards' | 'widgets') => void;
  showCardsTab: boolean;
  libraryOnly?: boolean;
  libraryAddDisabled?: boolean;
  title?: string;
  description?: string;
  actionLabel?: string;
  libraryEmptyText?: string;
  footer?: ReactNode;
  libraryQuery: string;
  setLibraryQuery: (query: string) => void;
  hasLibraryQuery: boolean;
  libraryCount: number;
  filteredLibraryCards: DashboardLibraryCard[];
  libraryEntityTypes: DashboardLibraryEntityType[];
  selectedLibraryEntityType: string | null;
  setSelectedLibraryEntityType: (entityType: string | null) => void;
  libraryRooms: string[];
  selectedLibraryRoom: string | null;
  setSelectedLibraryRoom: (room: string | null) => void;
  librarySortDirection: 'asc' | 'desc' | null;
  setLibrarySortDirection: (direction: 'asc' | 'desc' | null) => void;
  customCardQuery: string;
  setCustomCardQuery: (query: string) => void;
  customCardSortDirection: 'asc' | 'desc' | null;
  setCustomCardSortDirection: (direction: 'asc' | 'desc' | null) => void;
  customCardSizes: CardSize[];
  selectedCustomCardSize: CardSize | null;
  setSelectedCustomCardSize: (size: CardSize | null) => void;
  theme: ThemeType;
  primaryColor: string;
  cardTemplates: CardTemplate[];
  filteredCardTemplates: CardTemplate[];
  selectedType: CardTemplateId | null;
  setSelectedType: (type: CardTemplateId | null) => void;
  selectedSize: CardSize;
  setSelectedSize: (size: CardSize) => void;
  getColorValue: (color: string) => string;
  handleAdd: () => void;
  handleAddFromLibrary: (cardId: string) => void;
}

export function AddEntityDialogView({
  open,
  onClose,
  currentRoom,
  activeTab,
  setActiveTab,
  showCardsTab,
  libraryOnly = false,
  libraryAddDisabled,
  libraryRemoval,
  title,
  description,
  actionLabel,
  libraryEmptyText,
  footer,
  libraryQuery,
  setLibraryQuery,
  hasLibraryQuery,
  libraryCount,
  filteredLibraryCards,
  libraryEntityTypes,
  selectedLibraryEntityType,
  setSelectedLibraryEntityType,
  libraryRooms,
  selectedLibraryRoom,
  setSelectedLibraryRoom,
  librarySortDirection,
  setLibrarySortDirection,
  customCardQuery,
  setCustomCardQuery,
  customCardSortDirection,
  setCustomCardSortDirection,
  customCardSizes,
  selectedCustomCardSize,
  setSelectedCustomCardSize,
  theme,
  primaryColor,
  cardTemplates,
  filteredCardTemplates,
  selectedType,
  setSelectedType,
  selectedSize,
  setSelectedSize,
  getColorValue,
  handleAdd,
  handleAddFromLibrary,
}: AddEntityDialogViewProps) {
  const { t } = useI18n();
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  if (!open) return null;

  const surface = getThemeSurfaceTokens(theme);
  const dialogSurface = getAddCardDialogSurfaceTokens(theme);
  const textColor = surface.textPrimary;
  const mutedColor = surface.textSecondary;
  const borderColor = surface.border;
  const hoverBg = surface.hoverBg;
  const accent = getColorValue(primaryColor);
  const sizePreviewTileBg = dialogSurface.sizePreviewTileBg;
  const inactiveSizeSwatchBg = dialogSurface.inactiveSizeSwatchBg;
  const cardBg = surface.panelMuted;
  const cardsTabActive = activeTab === 'cards';
  const libraryEntityCount = libraryEntityTypes.reduce((total, type) => total + type.count, 0);
  const searchCountLabel = t('dashboard.addCard.librarySummary.available', { count: libraryCount });
  const SortIcon =
    librarySortDirection === 'asc'
      ? ArrowDownAZ
      : librarySortDirection === 'desc'
        ? ArrowUpZA
        : ArrowUpDown;
  const sortStateLabel =
    librarySortDirection === 'asc'
      ? t('dashboard.addCard.sort.ascending')
      : librarySortDirection === 'desc'
        ? t('dashboard.addCard.sort.descending')
        : t('dashboard.addCard.sort.default');
  const customCardCountLabel = t(
    cardTemplates.length === 1
      ? 'dashboard.multiple.manager.card'
      : 'dashboard.multiple.manager.cards',
    { count: cardTemplates.length }
  );
  const filteredCustomCardCountLabel = t(
    filteredCardTemplates.length === 1
      ? 'dashboard.multiple.manager.card'
      : 'dashboard.multiple.manager.cards',
    { count: filteredCardTemplates.length }
  );
  const CustomSortIcon =
    customCardSortDirection === 'asc'
      ? ArrowDownAZ
      : customCardSortDirection === 'desc'
        ? ArrowUpZA
        : ArrowUpDown;
  const customSortStateLabel =
    customCardSortDirection === 'asc'
      ? t('dashboard.addCard.sort.ascending')
      : customCardSortDirection === 'desc'
        ? t('dashboard.addCard.sort.descending')
        : t('dashboard.addCard.sort.default');
  const selectedTemplate = cardTemplates.find((template) => template.id === selectedType);
  const sizeOptions = selectedTemplate?.supportedSizes ?? [];
  const roomLabel = isAllRooms(currentRoom) ? t('dashboard.addCard.allRooms') : currentRoom;
  const dialogTitle = title ?? t('dashboard.addCard.title');
  const heroTitle =
    description ??
    (cardsTabActive
      ? t('dashboard.addCard.libraryDescription')
      : t('dashboard.addCard.description', { room: roomLabel }));

  return (
    <BaseCardDialog
      variant="fullscreen"
      titleInContent
      isOpen={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      title={dialogTitle}
      description={heroTitle}
      theme={theme}
      disableOpenAutoFocus
      contentClassName={`md:left-1/2 md:right-auto md:w-[calc(100%-4rem)] md:max-w-[1200px] md:-translate-x-1/2 ${surface.shellPanel} ${surface.border}`}
      contentStyle={getUiKitGlassSurfaceFoundationStyle(theme)}
      shellBodyClassName="h-full min-h-0"
    >
      <NavigationWorkspace.Frame
        aria-label={dialogTitle}
        className="h-full max-h-full rounded-none border-0 bg-none bg-transparent shadow-none"
      >
        <NavigationWorkspace.Header
          data-add-card-header
          className={cn(
            coverSheetHeaderClassName,
            'z-10 shrink-0 border-b max-sm:pt-2 max-sm:pr-4',
            borderColor,
            theme === 'glass' ? 'bg-transparent' : 'bg-inherit/95 backdrop-blur-xl'
          )}
        >
          <CardDialogHeader
            title={dialogTitle}
            description={heroTitle}
            theme={theme}
            editableTitle={false}
            showRoomSelector={false}
            className="mb-0"
          />

          {showCardsTab && !libraryOnly ? (
            <div className="mt-3 flex flex-wrap gap-2 md:hidden">
              <InteractivePill
                active={activeTab === 'cards'}
                icon={Layers2}
                intent="navigation"
                size="compact"
                onClick={() => {
                  setActiveTab('cards');
                  setSelectedLibraryEntityType(null);
                }}
                className="justify-start rounded-full px-3.5 text-left"
              >
                <span className="font-normal">{t('dashboard.addCard.tab.cards')}</span>
              </InteractivePill>

              <InteractivePill
                active={activeTab === 'widgets'}
                icon={Sparkles}
                intent="navigation"
                size="compact"
                onClick={() => setActiveTab('widgets')}
                className="justify-start rounded-full px-3.5 text-left"
              >
                <span className="font-normal">{t('dashboard.addCard.tab.widgets')}</span>
              </InteractivePill>
            </div>
          ) : null}
        </NavigationWorkspace.Header>

        <NavigationWorkspace.Body className="grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)]">
          <NavigationWorkspace.Sidebar className="hidden md:block">
            <NavigationWorkspace.ScrollArea className="p-4">
              <nav aria-label={dialogTitle} className="grid gap-1">
                {showCardsTab ? (
                  <NavigationWorkspace.Item
                    active={cardsTabActive && selectedLibraryEntityType === null}
                    accentColor={accent}
                  >
                    <NavigationWorkspace.ItemButton
                      aria-current={
                        cardsTabActive && selectedLibraryEntityType === null ? 'page' : undefined
                      }
                      onClick={() => {
                        setActiveTab('cards');
                        setSelectedLibraryEntityType(null);
                      }}
                    >
                      <NavigationWorkspace.ItemIcon>
                        <Layers2 className="h-4 w-4" />
                      </NavigationWorkspace.ItemIcon>
                      <NavigationWorkspace.ItemText
                        title={
                          <span className="font-normal">{t('dashboard.addCard.tab.cards')}</span>
                        }
                        description={t('dashboard.addCard.librarySummary.available', {
                          count: libraryEntityCount,
                        })}
                      />
                    </NavigationWorkspace.ItemButton>
                  </NavigationWorkspace.Item>
                ) : null}

                {!libraryOnly ? (
                  <NavigationWorkspace.Item active={!cardsTabActive} accentColor={accent}>
                    <NavigationWorkspace.ItemButton
                      aria-current={!cardsTabActive ? 'page' : undefined}
                      onClick={() => setActiveTab('widgets')}
                    >
                      <NavigationWorkspace.ItemIcon>
                        <Sparkles className="h-4 w-4" />
                      </NavigationWorkspace.ItemIcon>
                      <NavigationWorkspace.ItemText
                        title={
                          <span className="font-normal">{t('dashboard.addCard.tab.widgets')}</span>
                        }
                        description={customCardCountLabel}
                      />
                    </NavigationWorkspace.ItemButton>
                  </NavigationWorkspace.Item>
                ) : null}

                {showCardsTab ? <NavigationWorkspace.Separator className="my-2" /> : null}

                {showCardsTab &&
                  libraryEntityTypes.map((entityType) => {
                    const EntityTypeIcon = entityType.icon ?? Layers2;
                    const active = cardsTabActive && selectedLibraryEntityType === entityType.key;

                    return (
                      <NavigationWorkspace.Item
                        key={entityType.key}
                        active={active}
                        accentColor={accent}
                      >
                        <NavigationWorkspace.ItemButton
                          aria-current={active ? 'page' : undefined}
                          onClick={() => {
                            setActiveTab('cards');
                            setSelectedLibraryEntityType(entityType.key);
                          }}
                        >
                          <NavigationWorkspace.ItemIcon>
                            <EntityTypeIcon className="h-4 w-4" />
                          </NavigationWorkspace.ItemIcon>
                          <NavigationWorkspace.ItemText
                            title={entityType.label}
                            description={t('dashboard.addCard.librarySummary.available', {
                              count: entityType.count,
                            })}
                          />
                        </NavigationWorkspace.ItemButton>
                      </NavigationWorkspace.Item>
                    );
                  })}
              </nav>
            </NavigationWorkspace.ScrollArea>
          </NavigationWorkspace.Sidebar>

          <NavigationWorkspace.Content className="flex min-h-0 flex-col px-4 py-4 sm:px-5 sm:py-5">
            <div className="min-h-0 flex-1">
              {activeTab === 'cards' ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex shrink-0 items-center gap-2.5">
                    <div className="relative min-w-0 flex-1">
                      <HeaderSearchInput
                        activeColorValue={accent}
                        hoverBg={hoverBg}
                        inputBg={cardBg}
                        isSearchActive={hasLibraryQuery}
                        isSearchFocused={isSearchFocused}
                        onBlur={() => setIsSearchFocused(false)}
                        onChange={setLibraryQuery}
                        onClear={() => setLibraryQuery('')}
                        onFocus={() => setIsSearchFocused(true)}
                        placeholder={t('dashboard.addCard.searchPlaceholder')}
                        query={libraryQuery}
                        textPrimary={textColor}
                        textSecondary={mutedColor}
                        widthClassName={`rounded-[18px] !text-sm !font-normal placeholder:font-normal sm:pr-40 ${borderColor}`}
                      />
                      {!hasLibraryQuery ? (
                        <span
                          className={`pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 text-[0.7rem] font-medium sm:block ${mutedColor}`}
                        >
                          {searchCountLabel}
                        </span>
                      ) : null}
                    </div>

                    <IconButton
                      label={`${t('dashboard.addCard.sort.label')}: ${sortStateLabel}`}
                      icon={<SortIcon className="h-4 w-4" aria-hidden="true" />}
                      size="small"
                      variant={librarySortDirection === null ? 'subtle' : 'secondary'}
                      data-sort-direction={librarySortDirection ?? 'none'}
                      aria-pressed={librarySortDirection !== null}
                      onClick={() =>
                        setLibrarySortDirection(
                          librarySortDirection === null
                            ? 'asc'
                            : librarySortDirection === 'asc'
                              ? 'desc'
                              : null
                        )
                      }
                      className="shrink-0"
                    />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton
                          label={
                            selectedLibraryRoom
                              ? `${t('dashboard.addCard.filter.label')}: ${selectedLibraryRoom}`
                              : t('dashboard.addCard.filter.label')
                          }
                          icon={<ListFilter className="h-4 w-4" aria-hidden="true" />}
                          size="small"
                          variant={selectedLibraryRoom === null ? 'subtle' : 'secondary'}
                          className="shrink-0"
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" sideOffset={8} className="min-w-48">
                        <DropdownMenuLabel>{t('dashboard.addCard.filter.label')}</DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                          value={selectedLibraryRoom ?? '__all__'}
                          onValueChange={(room) =>
                            setSelectedLibraryRoom(room === '__all__' ? null : room)
                          }
                        >
                          <DropdownMenuRadioItem value="__all__">
                            {t('dashboard.addCard.tab.cards')}
                          </DropdownMenuRadioItem>
                          {libraryRooms.map((room) => (
                            <DropdownMenuRadioItem key={room} value={room}>
                              {room}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="min-h-0 flex-1 pt-3">
                    <DashboardLibraryList
                      cards={filteredLibraryCards}
                      surface={surface}
                      addLabel={actionLabel ?? t('dashboard.addEntity.action')}
                      emptyText={libraryEmptyText ?? t('dashboard.addCard.libraryEmpty')}
                      onAdd={handleAddFromLibrary}
                      addDisabled={libraryAddDisabled}
                      removal={libraryRemoval}
                      fillAvailable
                    />
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-0 overflow-y-auto">
                  {selectedTemplate ? (
                    <div className="animate-in slide-in-from-right-4 fade-in mx-auto max-w-4xl space-y-5 duration-200">
                      <div
                        className="flex items-start gap-3.5 rounded-[18px] border px-3.5 py-3"
                        style={{
                          backgroundColor: cardBg,
                          borderColor: dialogSurface.tileBorder,
                        }}
                      >
                        <NavigationWorkspace.ItemIcon>
                          <span className="[&_svg]:h-4 [&_svg]:w-4">{selectedTemplate.icon}</span>
                        </NavigationWorkspace.ItemIcon>
                        <div className="min-w-0 flex-1">
                          <h3 className={`truncate text-sm font-semibold ${textColor}`}>
                            {t(selectedTemplate.nameKey)}
                          </h3>
                          <p className={`mt-1.5 text-xs ${mutedColor}`}>
                            {t(selectedTemplate.descriptionKey)}
                          </p>
                        </div>
                      </div>

                      <h3 className={`text-sm font-medium ${textColor}`}>
                        {t('dashboard.addCard.chooseSize')}
                      </h3>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {sizeOptions.map((size) => (
                          <button
                            type="button"
                            key={size}
                            onClick={() => setSelectedSize(size)}
                            className={`rounded-[20px] border p-3 transition-[color,background-color,border-color,box-shadow,opacity,transform,filter] ${hoverBg}`}
                            style={{
                              borderColor:
                                selectedSize === size ? `${accent}55` : dialogSurface.tileBorder,
                              backgroundColor: selectedSize === size ? `${accent}10` : cardBg,
                            }}
                          >
                            <div className="text-center">
                              <div
                                className="mx-auto mb-2.5 flex h-12 items-center justify-center rounded-[14px]"
                                style={{ backgroundColor: sizePreviewTileBg }}
                              >
                                <div
                                  className="rounded"
                                  style={{
                                    ...(() => {
                                      const { cols, rows } = getCardSizeRatio(size);
                                      return { width: cols * 18, height: rows * 18 };
                                    })(),
                                    backgroundColor:
                                      selectedSize === size ? accent : inactiveSizeSwatchBg,
                                  }}
                                />
                              </div>
                              <p className={`text-xs font-medium ${textColor}`}>
                                {t(cardSizeKey(size))}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="animate-in slide-in-from-left-4 fade-in flex h-full min-h-0 flex-col duration-200">
                      <div className="flex shrink-0 items-center gap-2.5">
                        <div className="relative min-w-0 flex-1">
                          <HeaderSearchInput
                            activeColorValue={accent}
                            hoverBg={hoverBg}
                            inputBg={cardBg}
                            isSearchActive={customCardQuery.trim().length > 0}
                            isSearchFocused={isSearchFocused}
                            onBlur={() => setIsSearchFocused(false)}
                            onChange={setCustomCardQuery}
                            onClear={() => setCustomCardQuery('')}
                            onFocus={() => setIsSearchFocused(true)}
                            placeholder={t('sidebar.search')}
                            query={customCardQuery}
                            textPrimary={textColor}
                            textSecondary={mutedColor}
                            widthClassName={`rounded-[18px] !text-sm !font-normal placeholder:font-normal sm:pr-40 ${borderColor}`}
                          />
                          {customCardQuery.trim().length === 0 ? (
                            <span
                              className={`pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 text-[0.7rem] font-medium sm:block ${mutedColor}`}
                            >
                              {filteredCustomCardCountLabel}
                            </span>
                          ) : null}
                        </div>

                        <IconButton
                          label={`${t('dashboard.addCard.sort.label')}: ${customSortStateLabel}`}
                          icon={<CustomSortIcon className="h-4 w-4" aria-hidden="true" />}
                          size="small"
                          variant={customCardSortDirection === null ? 'subtle' : 'secondary'}
                          data-sort-direction={customCardSortDirection ?? 'none'}
                          aria-pressed={customCardSortDirection !== null}
                          onClick={() =>
                            setCustomCardSortDirection(
                              customCardSortDirection === null
                                ? 'asc'
                                : customCardSortDirection === 'asc'
                                  ? 'desc'
                                  : null
                            )
                          }
                          className="shrink-0"
                        />

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              label={
                                selectedCustomCardSize
                                  ? `${t('dashboard.addCard.filter.label')}: ${t(cardSizeKey(selectedCustomCardSize))}`
                                  : t('dashboard.addCard.filter.label')
                              }
                              icon={<ListFilter className="h-4 w-4" aria-hidden="true" />}
                              size="small"
                              variant={selectedCustomCardSize === null ? 'subtle' : 'secondary'}
                              className="shrink-0"
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" sideOffset={8} className="min-w-48">
                            <DropdownMenuLabel>
                              {t('dashboard.addCard.filter.label')}
                            </DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                              value={selectedCustomCardSize ?? '__all__'}
                              onValueChange={(size) =>
                                setSelectedCustomCardSize(
                                  size === '__all__' ? null : (size as CardSize)
                                )
                              }
                            >
                              <DropdownMenuRadioItem value="__all__">
                                {t('dashboard.addCard.tab.widgets')}
                              </DropdownMenuRadioItem>
                              {customCardSizes.map((size) => (
                                <DropdownMenuRadioItem key={size} value={size}>
                                  {t(cardSizeKey(size))}
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="min-h-0 flex-1 overflow-y-auto pt-3">
                        <div
                          className={cn('overflow-hidden rounded-[24px] border', surface.border)}
                          data-custom-card-list
                        >
                          {filteredCardTemplates.map((template, index) => (
                            <button
                              type="button"
                              key={template.id}
                              onClick={() => {
                                setSelectedType(template.id);
                                setSelectedSize(template.defaultSize);
                              }}
                              className={cn(
                                'flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left transition-colors motion-reduce:transition-none',
                                hoverBg,
                                getThemeFocusRingClassName(theme),
                                index > 0 ? `border-t ${surface.border}` : ''
                              )}
                            >
                              <span
                                className={cn(
                                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border [&_svg]:h-4 [&_svg]:w-4',
                                  surface.iconBg,
                                  surface.borderStrong,
                                  surface.textSecondary
                                )}
                                aria-hidden="true"
                              >
                                {template.icon}
                              </span>
                              <div className="min-w-0 flex-1">
                                <h4 className={`truncate text-sm font-medium ${textColor}`}>
                                  {t(template.nameKey)}
                                </h4>
                                <p
                                  className={`mt-1 whitespace-normal break-words text-xs leading-4 ${surface.textMuted}`}
                                >
                                  {t(template.descriptionKey)}
                                </p>
                              </div>
                              <ChevronRight
                                className={cn('mt-2.5 h-4 w-4 shrink-0', surface.textMuted)}
                                aria-hidden="true"
                              />
                            </button>
                          ))}
                          {filteredCardTemplates.length === 0 ? (
                            <p className={`px-4 py-8 text-center text-sm ${surface.textMuted}`}>
                              {t('household.filters.tryAgain')}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {footer ? <DialogFooter className="mt-4 shrink-0">{footer}</DialogFooter> : null}

            {activeTab === 'widgets' && selectedTemplate ? (
              <DialogFooter
                className={`mt-4 shrink-0 !flex-nowrap !justify-between border-t pt-4 ${borderColor}`}
              >
                <Button
                  type="button"
                  variant="secondary"
                  size="default"
                  leading={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => setSelectedType(null)}
                  className="shrink-0"
                >
                  {t('dashboard.onboarding.back')}
                </Button>
                <Button type="button" size="default" onClick={handleAdd} className="shrink-0">
                  {t('dashboard.addCard.action')}
                </Button>
              </DialogFooter>
            ) : null}
          </NavigationWorkspace.Content>
        </NavigationWorkspace.Body>
      </NavigationWorkspace.Frame>
    </BaseCardDialog>
  );
}
