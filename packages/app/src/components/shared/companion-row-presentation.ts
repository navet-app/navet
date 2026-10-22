/** Compact card presentation; the owning card retains its commands and dialog. */
export interface CompanionRowPresentation {
  disabled: boolean;
  value: string;
}

/** Extend the hover surface into the gutter without moving the row content. */
export const companionRowHighlight = '-mx-2 w-[calc(100%+1rem)] rounded-lg px-2';
