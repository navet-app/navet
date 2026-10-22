import { RoomNav } from '@navet/app/components/layout/room-nav';
import { RoomNavActionsContext } from '@navet/app/components/layout/room-nav-actions-context';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

describe('RoomNav', () => {
  it('hosts shared app actions beside rooms without duplicating Customize', () => {
    renderWithProviders(
      <RoomNavActionsContext.Provider value={<button type="button">Customize</button>}>
        <RoomNav
          rooms={['Kitchen']}
          activeRoom="All"
          onRoomChange={() => {}}
          isEditMode={false}
          onToggleEditMode={() => {}}
        />
      </RoomNavActionsContext.Provider>
    );
    expect(screen.getAllByRole('button', { name: 'Customize' })).toHaveLength(1);
  });

  beforeEach(async () => {
    await resetAppStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockRoomLayout({
    containerWidth = 280,
    overflowWidth = 64,
    roomWidths = {},
  }: {
    containerWidth?: number;
    overflowWidth?: number;
    roomWidths?: Record<string, number>;
  }) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const element = this as HTMLElement;

      if (element === document.body) {
        return originalGetBoundingClientRect.call(element);
      }

      if (element.getAttribute('aria-hidden') === 'true') {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          width: 0,
          height: 0,
          toJSON: () => ({}),
        };
      }

      if (element.classList.contains('min-w-0') && element.classList.contains('flex-1')) {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: 40,
          right: containerWidth,
          width: containerWidth,
          height: 40,
          toJSON: () => ({}),
        };
      }

      const label = element.textContent?.trim() ?? '';

      if (label === '+99 rooms') {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: 32,
          right: overflowWidth,
          width: overflowWidth,
          height: 32,
          toJSON: () => ({}),
        };
      }

      if (label.length > 0 && roomWidths[label] !== undefined) {
        const width = roomWidths[label];
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: 32,
          right: width,
          width,
          height: 32,
          toJSON: () => ({}),
        };
      }

      return originalGetBoundingClientRect.call(element);
    });
  }

  it('renders a direct add entity action in edit mode', () => {
    const onAddEntity = vi.fn();

    renderWithProviders(
      <RoomNav
        rooms={['All', 'Living Room', 'Kitchen']}
        activeRoom="All"
        onRoomChange={() => undefined}
        isEditMode
        onToggleEditMode={() => undefined}
        onAddEntity={onAddEntity}
        addEntityLabel="Add Entity"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Add Entity/i }));

    expect(onAddEntity).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows one active room with its display casing when group and hidden labels differ in case', async () => {
    mockRoomLayout({ containerWidth: 800 });
    renderWithProviders(
      <RoomNav
        rooms={['Kitchen', 'kitchen', 'Bedroom']}
        roomGroups={[{ id: 'downstairs', name: 'Downstairs', rooms: ['KITCHEN'] }]}
        hiddenRoomNames={['BEDROOM']}
        activeRoom="kitchen"
        onRoomChange={() => undefined}
        isEditMode={false}
        onToggleEditMode={() => undefined}
      />
    );

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Kitchen' })).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Kitchen' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Bedroom' })).not.toBeInTheDocument();
  });

  it('keeps all rooms inline when there is enough width', async () => {
    mockRoomLayout({
      containerWidth: 600,
      roomWidths: {
        Home: 72,
        'Living Room': 104,
        Kitchen: 88,
        Bedroom: 92,
      },
    });

    renderWithProviders(
      <RoomNav
        rooms={['Living Room', 'Kitchen', 'Bedroom']}
        activeRoom="All"
        onRoomChange={() => undefined}
        isEditMode={false}
        onToggleEditMode={() => undefined}
      />
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Kitchen' })).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Kitchen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bedroom' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rooms' })).not.toBeInTheDocument();
  });

  it('navigates from a grouped room label and always opens the group from its chevron', async () => {
    mockRoomLayout({
      containerWidth: 600,
      roomWidths: {
        Home: 72,
        'Living Room': 112,
        Office: 86,
        Kitchen: 88,
      },
    });

    function GroupedRoomNav() {
      const [activeRoom, setActiveRoom] = useState('Living Room');

      return (
        <RoomNav
          rooms={['Living Room', 'Kitchen', 'Guest Room', 'Office']}
          roomGroups={[
            {
              id: 'upstairs',
              name: 'Upstairs',
              rooms: ['Living Room', 'Guest Room', 'Office'],
            },
          ]}
          activeRoom={activeRoom}
          onRoomChange={setActiveRoom}
          isEditMode={false}
          onToggleEditMode={() => undefined}
        />
      );
    }

    renderWithProviders(<GroupedRoomNav />);

    const livingRoom = await screen.findByRole('button', { name: 'Living Room' });
    expect(livingRoom).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Guest Room' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Office' })).not.toBeInTheDocument();

    fireEvent.pointerDown(livingRoom);
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Office' }));

    const office = await screen.findByRole('button', { name: 'Office' });
    expect(office).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
    expect(office).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Kitchen' })).toHaveAttribute('aria-current', 'page');

    fireEvent.click(office);
    expect(office).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
    const chevron = office.querySelector('[data-room-group-chevron]');
    expect(chevron).not.toBeNull();
    fireEvent.pointerDown(chevron as Element);
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
  });

  it('collapses overflow rooms into a dropdown when width runs out', async () => {
    mockRoomLayout({
      containerWidth: 320,
      roomWidths: {
        Home: 72,
        'Living Room': 104,
        Kitchen: 88,
        Bedroom: 92,
      },
    });

    renderWithProviders(
      <RoomNav
        rooms={['Living Room', 'Kitchen', 'Bedroom']}
        activeRoom="All"
        onRoomChange={() => undefined}
        isEditMode={false}
        onToggleEditMode={() => undefined}
      />
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Rooms' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Kitchen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bedroom' })).not.toBeInTheDocument();
    expect(screen.getByText('+2 rooms')).toBeInTheDocument();
  });

  it.each(['Bedroom', 'BEDROOM'])(
    'keeps the active room %s visible when it would otherwise overflow',
    async (activeRoom) => {
      mockRoomLayout({
        containerWidth: 320,
        roomWidths: {
          Home: 72,
          'Living Room': 104,
          Kitchen: 88,
          Bedroom: 92,
        },
      });

      renderWithProviders(
        <RoomNav
          rooms={['Living Room', 'Kitchen', 'Bedroom']}
          activeRoom={activeRoom}
          onRoomChange={() => undefined}
          isEditMode={false}
          onToggleEditMode={() => undefined}
        />
      );

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Rooms' })).toBeInTheDocument()
      );
      expect(screen.getByRole('button', { name: 'Bedroom' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Kitchen' })).not.toBeInTheDocument();
      expect(screen.getByText('+2 rooms')).toBeInTheDocument();
    }
  );

  it('does not render a duplicate interactive tree just to measure room labels', async () => {
    mockRoomLayout({
      containerWidth: 600,
      roomWidths: {
        Home: 72,
        'Living Room': 104,
        Kitchen: 88,
        Bedroom: 92,
      },
    });

    renderWithProviders(
      <RoomNav
        rooms={['Living Room', 'Kitchen', 'Bedroom']}
        activeRoom="All"
        onRoomChange={() => undefined}
        isEditMode={false}
        onToggleEditMode={() => undefined}
      />
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Living Room' })).toBeInTheDocument()
    );
    expect(screen.getAllByText('Living Room')).toHaveLength(1);
    expect(screen.getAllByText('Kitchen')).toHaveLength(1);
    expect(screen.getAllByText('Bedroom')).toHaveLength(1);
  });

  it('selects an overflow room from the dropdown', async () => {
    const onRoomChange = vi.fn();

    mockRoomLayout({
      containerWidth: 260,
      roomWidths: {
        Home: 72,
        'Living Room': 104,
        Kitchen: 88,
        Bedroom: 92,
      },
    });

    renderWithProviders(
      <RoomNav
        rooms={['Living Room', 'Kitchen', 'Bedroom']}
        activeRoom="All"
        onRoomChange={onRoomChange}
        isEditMode={false}
        onToggleEditMode={() => undefined}
      />
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Rooms' })).toBeInTheDocument());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Rooms' }));
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Kitchen' }));

    expect(onRoomChange).toHaveBeenCalledWith('Kitchen');
  });

  it('uses the normal overflow menu for 10 or fewer overflow rooms', async () => {
    mockRoomLayout({
      containerWidth: 220,
      roomWidths: {
        Home: 72,
        'Living Room': 104,
        Kitchen: 88,
        Bedroom: 92,
        Office: 86,
        Garage: 88,
        Patio: 84,
        Hallway: 92,
        Laundry: 94,
        Nursery: 90,
        Basement: 98,
      },
    });

    renderWithProviders(
      <RoomNav
        rooms={[
          'Living Room',
          'Kitchen',
          'Bedroom',
          'Office',
          'Garage',
          'Patio',
          'Hallway',
          'Laundry',
          'Nursery',
          'Basement',
        ]}
        activeRoom="All"
        onRoomChange={() => undefined}
        isEditMode={false}
        onToggleEditMode={() => undefined}
      />
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Rooms' })).toBeInTheDocument());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Rooms' }));
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());

    expect(within(screen.getByRole('menu')).queryByText('Rooms')).not.toBeInTheDocument();
  });

  it('uses the megamenu for more than 10 overflow rooms', async () => {
    mockRoomLayout({
      containerWidth: 220,
      roomWidths: {
        Home: 72,
        'Living Room': 104,
        Kitchen: 88,
        Bedroom: 92,
        Office: 86,
        Garage: 88,
        Patio: 84,
        Hallway: 92,
        Laundry: 94,
        Nursery: 90,
        Basement: 98,
        Loft: 80,
        Studio: 88,
      },
    });

    renderWithProviders(
      <RoomNav
        rooms={[
          'Living Room',
          'Kitchen',
          'Bedroom',
          'Office',
          'Garage',
          'Patio',
          'Hallway',
          'Laundry',
          'Nursery',
          'Basement',
          'Loft',
          'Studio',
        ]}
        activeRoom="All"
        onRoomChange={() => undefined}
        isEditMode={false}
        onToggleEditMode={() => undefined}
      />
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Rooms' })).toBeInTheDocument());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Rooms' }));
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());

    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Rooms')).toBeInTheDocument();
    expect(menu).toHaveClass('overflow-hidden');
    expect(within(menu).getByRole('menuitem', { name: 'Studio' }).parentElement).toHaveClass(
      'overflow-y-auto',
      'md:grid-cols-3',
      'min-[1025px]:grid-cols-4'
    );
  });

  it('keeps hidden rooms out of the strip and overflow menu', async () => {
    mockRoomLayout({
      containerWidth: 220,
      roomWidths: {
        Home: 72,
        'Living Room': 104,
        Bedroom: 92,
      },
    });

    renderWithProviders(
      <RoomNav
        rooms={['Living Room', 'Kitchen', 'Bedroom']}
        hiddenRoomNames={['Kitchen']}
        activeRoom="All"
        onRoomChange={() => undefined}
        isEditMode={false}
        onToggleEditMode={() => undefined}
      />
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Rooms' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Kitchen' })).not.toBeInTheDocument();

    expect(screen.getByText('+2 rooms')).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Rooms' }));
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
    expect(
      within(screen.getByRole('menu')).queryByRole('menuitem', { name: 'Kitchen' })
    ).not.toBeInTheDocument();
  });
});
