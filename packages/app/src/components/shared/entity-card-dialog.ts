import { useState } from 'react';

/** Lets another surface open the card's own dialog without rendering its card face. */
export interface EntityCardDialogControl {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export function useEntityCardDialogState(dialog?: EntityCardDialogControl) {
  const [open, setOpen] = useState(false);
  return dialog ? ([dialog.isOpen, dialog.onOpenChange] as const) : ([open, setOpen] as const);
}
