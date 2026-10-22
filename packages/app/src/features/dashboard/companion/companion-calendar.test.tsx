import type { PlatformCalendarDevice } from '@navet/app/platform/provider-feature-models';
import { integrationStore } from '@navet/app/stores/integration-store';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import type { NavetEntity } from '@navet/core/types';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanionCalendar } from './companion-calendar';

const { calendars } = vi.hoisted(() => ({ calendars: vi.fn<() => PlatformCalendarDevice[]>() }));
vi.mock('@navet/app/hooks', async (original) => ({
  ...(await original<typeof import('@navet/app/hooks')>()),
  useProviderCalendarDevicesCollection: calendars,
}));
const entity: NavetEntity = {
  id: 'homey:calendar.family',
  canonicalId: 'homey:calendar.family',
  providerId: 'homey',
  externalId: 'calendar.family',
  name: 'Family agenda',
  type: 'calendar',
  primaryState: 'on',
  availability: 'available',
  attributes: {},
  capabilities: [],
};
function event(id: string, days: number) {
  const start = new Date();
  start.setDate(start.getDate() + days);
  start.setHours(15, 0, 0, 0);
  return {
    id,
    title: id,
    startTime: '15:00',
    endTime: '16:00',
    timeDisplay: '15:00',
    startDateTime: start.toISOString(),
    endDateTime: new Date(start.getTime() + 3600000).toISOString(),
    sortKey: start.toISOString(),
    type: 'event' as const,
    color: 'bg-blue-500',
  };
}
describe('companion calendar', () => {
  beforeEach(async () => {
    await resetAppStores();
    integrationStore.setState((state) => ({
      providerRuntime: {
        ...state.providerRuntime,
        homey: { ...state.providerRuntime.homey, connected: true },
      },
    }));
    calendars.mockReturnValue([
      {
        id: 'overview',
        name: 'Overview',
        room: 'Home',
        size: 'medium',
        events: [],
        sources: [
          {
            id: entity.canonicalId,
            name: entity.name,
            room: 'Home',
            available: true,
            events: [
              event('Fourth', 4),
              event('Pickup', 1),
              event('Third', 3),
              event('Second', 2),
              event('Expired', -1),
            ],
          },
          {
            id: 'homey:calendar.other',
            name: 'Other',
            room: 'Home',
            available: true,
            events: [event('Private meeting', 1)],
          },
        ],
      },
    ]);
  });
  it('shows the next three events from the selected source and opens event details', () => {
    renderWithProviders(<CompanionCalendar entity={entity} editing={false} />);
    expect(screen.getByText('Pickup')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Third')).toBeInTheDocument();
    for (const title of ['Fourth', 'Expired', 'Private meeting'])
      expect(screen.queryByText(title)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Pickup/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('hides cached events when the provider disconnects', () => {
    integrationStore.setState((state) => ({
      providerRuntime: {
        ...state.providerRuntime,
        homey: { ...state.providerRuntime.homey, connected: false },
      },
    }));
    renderWithProviders(<CompanionCalendar entity={entity} editing={false} />);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Pickup')).not.toBeInTheDocument();
  });
  it('hides events when the selected calendar becomes unavailable while its provider stays connected', () => {
    const devices = calendars();
    for (const source of devices.flatMap((device) => device.sources ?? []))
      if (source.id === entity.canonicalId) source.available = false;
    calendars.mockReturnValue(devices);
    renderWithProviders(<CompanionCalendar entity={entity} editing={false} />);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Pickup')).not.toBeInTheDocument();
  });

  it('keeps a missing selected source empty instead of showing another calendar', () => {
    renderWithProviders(
      <CompanionCalendar
        entity={{ ...entity, canonicalId: 'homey:calendar.removed' }}
        editing={true}
      />
    );
    expect(screen.getByText('No upcoming events')).toBeInTheDocument();
    expect(screen.queryByText('Private meeting')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
