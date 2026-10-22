/** Compact card presentation; the owning card retains its commands and dialog. */
export interface CompanionRowPresentation {
  disabled: boolean;
  unavailable?: boolean;
  value: string;
}

/** Extend the hover surface into the gutter without moving the row content. */
export const companionRowHighlight = '-mx-2.5 w-[calc(100%+1.25rem)] rounded-lg px-2.5';

export const companionEntityNameTypography = 'text-xs font-medium';
export const companionEntityIconClassName = 'h-4 w-4 shrink-0';
export const companionEntityDisabledClassName = 'cursor-default opacity-60';
export const companionEntityRowClassName = 'flex min-h-10 items-center gap-2 py-0';
export const companionEntityValueClassName =
  'min-w-0 max-w-[45%] shrink-0 break-words text-right text-xs font-medium tabular-nums';
