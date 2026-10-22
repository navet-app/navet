import { Button } from '@navet/app/components/primitives/button';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { HeaderSearchInput } from './header-search-input';
import type { HeaderController } from './use-header-controller';

/** Shared click-to-open search for the greeting and room-navigation rows. */
export function HeaderSearchAction({ controller }: { controller: HeaderController }) {
  const {
    activeColorValue,
    hoverBg,
    inputBg,
    isSearchActive,
    isSearchFocused,
    searchQuery,
    handleClearSearch,
    handleSearchChange,
    setIsSearchFocused,
    textPrimary,
    textSecondary,
    t,
  } = controller;
  const [isDesktopSearchOpen, setIsDesktopSearchOpen] = useState(false);
  const desktopSearchContainerRef = useRef<HTMLDivElement | null>(null);
  const desktopSearchLauncherRef = useRef<HTMLButtonElement | null>(null);
  const restoreDesktopSearchFocusRef = useRef(false);
  const desktopSearchInputRef = useRef<HTMLInputElement | null>(null);
  const openDesktopSearch = () => {
    setIsDesktopSearchOpen(true);
    window.setTimeout(() => desktopSearchInputRef.current?.focus(), 0);
  };

  const closeDesktopSearch = () => {
    handleClearSearch();
    restoreDesktopSearchFocusRef.current = true;
    setIsDesktopSearchOpen(false);
  };

  useEffect(() => {
    if (!isDesktopSearchOpen && restoreDesktopSearchFocusRef.current) {
      restoreDesktopSearchFocusRef.current = false;
      desktopSearchLauncherRef.current?.focus();
    }
  }, [isDesktopSearchOpen]);

  useEffect(() => {
    if (!isDesktopSearchOpen) {
      return undefined;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      if (desktopSearchContainerRef.current?.contains(event.target as Node)) {
        return;
      }

      handleClearSearch();
      setIsDesktopSearchOpen(false);
    };

    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, [handleClearSearch, isDesktopSearchOpen]);

  return (
    <div ref={desktopSearchContainerRef} className="flex items-center">
      {isDesktopSearchOpen ? (
        <div className="relative flex-1 md:flex-none">
          <HeaderSearchInput
            activeColorValue={activeColorValue}
            hoverBg={hoverBg}
            inputBg={inputBg}
            inputRef={desktopSearchInputRef}
            isSearchActive={isSearchActive}
            isSearchFocused={isSearchFocused}
            onBlur={() => setIsSearchFocused(false)}
            onChange={handleSearchChange}
            onClear={closeDesktopSearch}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeDesktopSearch();
              }
            }}
            onFocus={() => setIsSearchFocused(true)}
            placeholder={t('header.searchPlaceholder')}
            query={searchQuery}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            widthClassName="w-full md:w-64"
          />
        </div>
      ) : (
        <Button
          variant="ghost"
          size="compact"
          iconOnly
          ref={desktopSearchLauncherRef}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openDesktopSearch();
          }}
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[22px] ${hoverBg} transition-colors`}
          label={t('header.searchPlaceholder')}
          aria-expanded={false}
        >
          <Search className={`h-5 w-5 ${textSecondary}`} />
        </Button>
      )}
    </div>
  );
}
