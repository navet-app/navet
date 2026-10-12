import { CardDialogHeader, CardDialogTabTrigger } from '@navet/app/components/patterns/card-dialog';
import { renderWithProviders } from '@navet/app/test/render';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Sliders } from 'lucide-react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BaseCardDialog } from '.';

describe('BaseCardDialog', () => {
  it('preserves compact pill triggers unless segmented styling is requested', () => {
    renderWithProviders(
      <>
        <CardDialogTabTrigger active icon={Sliders}>
          Playback
        </CardDialogTabTrigger>
        <CardDialogTabTrigger active segmented icon={Sliders}>
          Controls
        </CardDialogTabTrigger>
      </>
    );
    expect(screen.getByRole('button', { name: 'Playback' })).toHaveClass('h-9', 'px-3');
    expect(screen.getByRole('button', { name: 'Playback' })).not.toHaveClass('flex-1');
    expect(screen.getByRole('button', { name: 'Controls' })).toHaveClass('flex-1', 'min-h-9');
  });

  it.each([
    [true, false],
    [false, false],
    [false, true],
  ])(
    'moves focus inside and restores the opener with disableOpenAutoFocus=%s and autoFocus child=%s',
    async (disableOpenAutoFocus, autoFocusChild) => {
      function Fixture() {
        const [open, setOpen] = useState(false);
        return (
          <>
            <button type="button" onClick={() => setOpen(true)}>
              Open fan controls
            </button>
            <button type="button">Background climate</button>
            <BaseCardDialog
              isOpen={open}
              onOpenChange={setOpen}
              title="Bedroom fan"
              theme="dark"
              disableOpenAutoFocus={disableOpenAutoFocus}
              tabs={[
                {
                  key: 'controls',
                  label: 'Controls',
                  icon: Sliders,
                  content: autoFocusChild ? (
                    // biome-ignore lint/a11y/noAutofocus: Reproduce existing autofocus form consumers for restoration regression.
                    <input aria-label="Target" autoFocus />
                  ) : (
                    <button type="button">Fan speed</button>
                  ),
                },
              ]}
            />
          </>
        );
      }
      renderWithProviders(<Fixture />);
      const opener = screen.getByRole('button', { name: 'Open fan controls' });
      opener.focus();
      fireEvent.click(opener);
      const dialog = screen.getByRole('dialog', { name: 'Bedroom fan' });
      expect(dialog.contains(document.activeElement)).toBe(true);
      if (disableOpenAutoFocus) expect(dialog).toHaveFocus();
      fireEvent.keyDown(dialog, { key: 'Escape' });
      await waitFor(() => expect(opener).toHaveFocus());
      fireEvent.click(opener);
      expect(
        screen.getByRole('dialog', { name: 'Bedroom fan' }).contains(document.activeElement)
      ).toBe(true);
      fireEvent.click(screen.getAllByRole('button', { name: /^Close$/ })[0]);
      await waitFor(() => expect(opener).toHaveFocus());
    }
  );

  it('keeps primary controls visible and returns to them after secondary navigation and reopening', () => {
    const onRoomChange = vi.fn();
    const props = {
      isOpen: true,
      onOpenChange: vi.fn(),
      title: 'Photo settings',
      theme: 'dark' as const,
      roomSelector: {
        value: 'kitchen',
        label: 'Kitchen',
        options: [
          { label: 'Kitchen', value: 'kitchen' },
          { label: 'Office', value: 'office' },
        ],
        onChange: onRoomChange,
      },
      tabs: [
        { key: 'controls', label: 'Controls', icon: Sliders, content: <p>Photo sources</p> },
        {
          key: 'customize',
          label: 'Customize',
          icon: Sliders,
          content: <p>Appearance settings</p>,
        },
      ],
    };
    const { rerender } = renderWithProviders(<BaseCardDialog {...props} />);
    expect(screen.getByText('Photo sources')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Customize' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Room' })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getAllByRole('button', { name: 'More actions' })[0], { key: 'Enter' });
    expect(screen.queryByRole('menuitem', { name: 'Edit card name' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit room' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Room' }), {
      target: { value: 'office' },
    });
    expect(onRoomChange).toHaveBeenCalledWith('office');
    fireEvent.click(screen.getByRole('button', { name: 'Back to controls' }));
    expect(screen.getByText('Photo sources')).toBeVisible();
    fireEvent.keyDown(screen.getAllByRole('button', { name: 'More actions' })[0], { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Customize' }));
    expect(screen.getByText('Appearance settings')).toBeVisible();
    rerender(<BaseCardDialog {...props} isOpen={false} />);
    rerender(<BaseCardDialog {...props} />);
    expect(screen.getByText('Photo sources')).toBeVisible();
    expect(screen.getByText('Appearance settings')).not.toBeVisible();
  });

  it.each([
    ['home_assistant:sensor.office_temperature', 'sensor.office_temperature'],
    ['sensor.office_temperature', 'sensor.office_temperature'],
    ['homey:device-123#measure_temperature', 'device-123#measure_temperature'],
    ['openhab:Office_Temperature', 'Office_Temperature'],
  ])('shows the native provider ID for %s while editing', (entityId, nativeId) => {
    renderWithProviders(
      <BaseCardDialog
        navigation="tabs"
        isOpen
        onOpenChange={vi.fn()}
        title="Temperature"
        entityId={entityId}
        theme="dark"
        tabs={[{ key: 'controls', label: 'Controls', icon: Sliders, content: null }]}
      />
    );

    expect(screen.getByText(nativeId, { selector: 'code' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Temperature' }));
    expect(screen.getByText(nativeId, { selector: 'code' })).toBeVisible();
  });

  it('uses one title ID when the visible content supplies the dialog title', () => {
    renderWithProviders(
      <BaseCardDialog
        variant="modal"
        isOpen
        onOpenChange={vi.fn()}
        title="Add card"
        description="Choose a card"
        titleInContent
        theme="dark"
      >
        <CardDialogHeader
          title="Add card"
          description="Choose a card"
          editableTitle={false}
          showRoomSelector={false}
        />
      </BaseCardDialog>
    );

    expect(screen.queryByText('Entity id:')).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'Add card' });
    expect(within(dialog).getByRole('heading', { name: 'Add card' })).toBeInTheDocument();
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(
      Array.from(document.querySelectorAll('[id]')).filter((node) => node.id === titleId)
    ).toHaveLength(1);
  });

  it('anchors the mobile sheet dismiss independently from its header', () => {
    const onOpenChange = vi.fn();
    renderWithProviders(
      <BaseCardDialog
        variant="sheet"
        isOpen
        onOpenChange={onOpenChange}
        title="Sections"
        description="Jump between every top-level area"
        theme="dark"
      >
        <button type="button" data-cover-sheet-inline-dismiss>
          Inline close
        </button>
      </BaseCardDialog>
    );

    const dialog = screen.getByRole('dialog', { name: 'Sections' });
    expect(dialog).toHaveClass('max-sm:!h-[80dvh]', 'max-sm:!rounded-t-[30px]');
    const dragHandle = screen.getByRole('button', {
      name: 'Drag dialog to fullscreen or close',
    });
    expect(dragHandle).toHaveClass('mt-1', 'mb-0', 'h-9', 'w-20');
    expect(dragHandle.firstElementChild).toHaveClass('h-1', 'w-10');
    const dismissButton = dialog.querySelector('[data-mobile-cover-sheet-dismiss]');
    expect(dismissButton?.parentElement).toHaveClass('absolute', 'top-3', 'right-3', 'z-30');
    expect(dialog).toHaveClass('max-sm:[&_[data-cover-sheet-inline-dismiss]]:!hidden');

    fireEvent.click(dismissButton as HTMLButtonElement);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('presents fullscreen workspaces as cover sheets on phones', () => {
    const onOpenChange = vi.fn();
    renderWithProviders(
      <BaseCardDialog
        variant="fullscreen"
        isOpen
        onOpenChange={onOpenChange}
        title="Add card"
        description="Choose a card"
        theme="dark"
      >
        <div>Add card workspace</div>
      </BaseCardDialog>
    );

    const dialog = screen.getByRole('dialog', { name: 'Add card' });
    expect(dialog).toHaveClass(
      'max-sm:!right-0',
      'max-sm:!bottom-0',
      'max-sm:!left-0',
      'max-sm:!h-[80dvh]',
      'max-sm:[--navet-safe-area-top-offset:0px]',
      'max-sm:!rounded-t-[30px]',
      'max-sm:!rounded-b-none'
    );
    expect(dialog.style.getPropertyValue('--mobile-cover-sheet-top')).toBe('auto');
    const dragHandle = screen.getByRole('button', {
      name: 'Drag dialog to fullscreen or close',
    });
    expect(dragHandle).toHaveClass('mt-1', 'mb-0', 'h-9');
    expect(dragHandle.firstElementChild).toHaveClass('w-10');
    const dismissButton = dialog.querySelector('[data-mobile-cover-sheet-dismiss]');
    expect(dismissButton).toHaveAccessibleName('Close');
    expect(dismissButton?.parentElement).toHaveClass('absolute', 'top-3', 'right-3', 'z-30');

    fireEvent.click(dismissButton as HTMLButtonElement);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();

    fireEvent.pointerDown(dragHandle, { clientY: 600, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerMove(window, { clientY: 500, pointerId: 1, pointerType: 'touch' });
    expect(dialog.style.getPropertyValue('--mobile-cover-sheet-top')).toContain(
      'env(safe-area-inset-top, 0px)'
    );
    fireEvent.pointerUp(window, { clientY: 500, pointerId: 1, pointerType: 'touch' });

    expect(dialog).toHaveClass('max-sm:!h-auto');
    expect(dialog.style.getPropertyValue('--mobile-cover-sheet-top')).toBe(
      'calc(max(env(safe-area-inset-top, 0px), 0px) + 0.5rem)'
    );
    const fullscreenDragHandle = screen.getByRole('button', { name: 'Close dialog' });
    expect(fullscreenDragHandle).toBeInTheDocument();

    onOpenChange.mockClear();
    fireEvent.pointerDown(fullscreenDragHandle, {
      clientY: 100,
      pointerId: 2,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(window, { clientY: 700, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerUp(window, { clientY: 700, pointerId: 2, pointerType: 'touch' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders the room selector as a plain eyebrow and keeps actions palette-aware', () => {
    renderWithProviders(
      <BaseCardDialog
        navigation="tabs"
        isOpen
        onOpenChange={vi.fn()}
        title="Plant Light"
        description="Light"
        theme="dark"
        tabs={[
          { key: 'controls', label: 'Controls', icon: Sliders, content: <div>Controls</div> },
          { key: 'customize', label: 'Customize', icon: Sliders, content: <div>Customize</div> },
        ]}
        tintColor="#ff6600"
        onTitleChange={vi.fn()}
        roomSelector={{
          value: 'kitchen',
          label: 'Kitchen',
          options: [{ label: 'Kitchen', value: 'kitchen' }],
          onChange: vi.fn(),
        }}
      />
    );

    expect(screen.getByRole('button', { name: 'Controls' })).toHaveClass('flex-1', 'min-h-9');

    const editButton = screen.getByRole('button', { name: /edit plant light/i });
    expect(editButton.parentElement).toHaveClass('items-center');
    expect(editButton).toHaveClass('h-7', 'after:-inset-y-2');
    expect(editButton).not.toHaveClass('min-h-9');
    expect(editButton.parentElement?.parentElement?.parentElement).toHaveClass('max-sm:pr-0');

    const dialog = screen.getByRole('dialog', { name: 'Plant Light' });
    const wholeSheetScrollArea = dialog.querySelector('[dir="ltr"]');
    expect(wholeSheetScrollArea).toHaveClass('max-sm:min-h-0', 'max-sm:flex-1');
    expect(wholeSheetScrollArea).not.toHaveClass('max-sm:-mt-5');
    expect(wholeSheetScrollArea?.parentElement).toHaveClass(
      'max-sm:flex',
      'max-sm:min-h-0',
      'max-sm:flex-1',
      'max-sm:flex-col'
    );
    const header = dialog.querySelector('[data-card-dialog-header]');
    expect(header).toHaveClass('border-b', 'px-4', 'py-3', 'max-sm:pt-2');
    expect(header?.nextElementSibling).toHaveClass('p-6', 'max-sm:p-4');
    expect(within(header as HTMLElement).getByRole('button', { name: 'Controls' })).toBeVisible();
    expect(within(header as HTMLElement).getByRole('combobox', { name: 'Room' })).toBeVisible();
    const mobileDismissButton = dialog.querySelector('[data-mobile-cover-sheet-dismiss]');
    expect(mobileDismissButton?.parentElement).toHaveClass('absolute', 'top-3', 'right-3', 'z-30');
    expect(mobileDismissButton).toHaveStyle({
      backgroundColor: 'rgba(255, 102, 0, 0.14)',
      borderColor: 'rgba(255, 102, 0, 0.24)',
    });
    expect(dialog.querySelector('[data-cover-sheet-inline-dismiss]')).toBeInTheDocument();
    expect(dialog).toHaveClass('max-sm:[&_[data-cover-sheet-inline-dismiss]]:!hidden');

    const roomSelect = within(header as HTMLElement).getByRole('combobox', { name: 'Room' });
    expect(roomSelect.parentElement?.parentElement).toHaveClass('text-xs', 'font-medium');
    expect(roomSelect.parentElement?.parentElement).not.toHaveClass('rounded-full', 'border');
    const title = within(header as HTMLElement).getByText('Plant Light');
    expect(
      roomSelect.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    expect(screen.getByRole('button', { name: 'Done' })).toHaveStyle({
      backgroundColor: 'rgba(255, 102, 0, 0.14)',
      borderColor: 'rgba(255, 102, 0, 0.24)',
    });
  });

  it('renders entity-backed room selectors as plain eyebrows above the title', () => {
    renderWithProviders(
      <BaseCardDialog
        navigation="tabs"
        isOpen
        onOpenChange={vi.fn()}
        title="Window Lamp"
        entityId="light.window_lamp"
        description="Light"
        theme="dark"
        tabs={[{ key: 'controls', label: 'Controls', icon: Sliders, content: <div>Controls</div> }]}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Window Lamp' });
    const header = dialog.querySelector('[data-card-dialog-header]');
    const headerRoomSelect = header?.querySelector('select[aria-label="Room"]');
    const roomEyebrow = headerRoomSelect?.previousElementSibling;
    expect(roomEyebrow).not.toHaveClass('rounded-full', 'h-9', 'px-3');
    expect(
      (headerRoomSelect?.compareDocumentPosition(screen.getByText('Window Lamp')) ?? 0) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(dialog.querySelector('[data-mobile-cover-sheet-actions]')).not.toBeInTheDocument();
  });
});
