import {
  getDashboardCardFootprint,
  getResponsiveCardSize,
  PHONE_SMALL_CARD_TARGET_WIDTH_PX,
} from '@navet/app/components/shared/card-size-selector';
import { useHomeDashboardEditor } from '@navet/app/features/dashboard/hooks/use-home-dashboard-editor';
import type { HomeDashboardLayoutState } from '@navet/app/features/dashboard/hooks/use-home-dashboard-layout';
import { useDashboardDevices } from '@navet/app/hooks/use-dashboard-devices';
import { renderHookWithProviders } from '@navet/app/test/render';
import type { DeviceCollection, DeviceWithType } from '@navet/app/types/device.types';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  buildHomeOverviewCollections,
  getCardGridGapPx,
  getCardGridTargetWidth,
  useHomeOverviewCollections,
} from '../home-dashboard-overview.shared';

const baseDevices: DeviceCollection = {
  lights: [],
  fans: [],
  hvac: [],
  climate: [],
  media: [],
  weather: [],
  switches: [],
  timers: [],
  counters: [],
  valves: [],
  remotes: [],
  helpers: [],
  covers: [],
  locks: [],
  scenes: [],
  persons: [],
  sensors: [],
  vacuums: [],
  calendars: [
    {
      id: 'calendar.kitchen',
      name: 'Kitchen calendar',
      room: 'Kitchen',
      size: 'medium',
      events: [],
    },
  ],
  cameras: [],
  'grouped-sensors': [],
};

const homeLayout: HomeDashboardLayoutState = {
  mode: 'sectioned',
  showHero: true,
  cardIds: ['calendar.kitchen', 'missing.entity'],
  sections: [
    {
      id: 'section-1',
      title: 'Pinned',
      x: 0,
      y: 0,
      w: 6,
      h: 1,
      span: 6,
    },
  ],
  cardSectionAssignments: {
    'calendar.kitchen': 'section-1',
    'missing.entity': 'section-1',
  },
};

const kitchenCalendar: DeviceWithType = {
  id: 'calendar.kitchen',
  name: 'Kitchen calendar',
  room: 'Kitchen',
  size: 'medium',
  events: [],
  type: 'calendars',
};

describe('home dashboard overview collections', () => {
  it('keeps hidden room entities out of room grids', () => {
    const { result } = renderHook(() => useDashboardDevices(baseDevices, ['calendar.kitchen']));

    expect(result.current.calendars).toEqual([]);
  });

  it('still resolves hidden room entities on home from the unfiltered map', () => {
    const collections = buildHomeOverviewCollections({
      deviceMap: new Map([['calendar.kitchen', kitchenCalendar]]),
      allCustomCards: [],
      homeLayout,
    });

    expect(collections.allCards.get('calendar.kitchen')).toBe(kitchenCalendar);
    expect(collections.sectionCards).toEqual([
      expect.objectContaining({
        id: 'section-1',
        cardIds: ['calendar.kitchen'],
      }),
    ]);
  });

  it('ignores missing home layout ids while preserving valid cards', () => {
    const collections = buildHomeOverviewCollections({
      deviceMap: new Map([['calendar.kitchen', kitchenCalendar]]),
      allCustomCards: [],
      homeLayout,
    });

    expect(collections.allCards.has('missing.entity')).toBe(false);
    expect(collections.flowCards).toEqual([]);
    expect(collections.sectionCards[0]?.cardIds).toEqual(['calendar.kitchen']);
  });

  it('keeps editor placement and card counts aligned with the shared Home topology', () => {
    const deviceMap = new Map([['calendar.kitchen', kitchenCalendar]]);
    const { result } = renderHookWithProviders(() =>
      useHomeDashboardEditor({
        deviceMap,
        allCustomCards: [],
        homeLayout,
        cardSizes: {},
        hiddenEntityCount: 0,
        moveHomeCard: () => {},
        moveHomeSection: () => {},
        moveHomeColumn: () => {},
      })
    );

    expect(result.current.sectionCards[0]?.cardIds).toEqual(['calendar.kitchen']);
    expect(result.current.flowCards).toEqual([]);
    expect(result.current.summaryItems[0]?.value).toBe(1);
  });

  it('keeps assigned cards in the flow when Home uses flow mode', () => {
    const collections = buildHomeOverviewCollections({
      deviceMap: new Map([['calendar.kitchen', kitchenCalendar]]),
      allCustomCards: [],
      homeLayout: { ...homeLayout, mode: 'flow' },
    });

    expect(collections.flowCards).toEqual(['calendar.kitchen']);
  });

  it('retains topology references while publishing current state-only card values', () => {
    const initialDevice = {
      ...kitchenCalendar,
      name: 'Kitchen calendar',
    };
    const updatedDevice = {
      ...kitchenCalendar,
      name: 'Kitchen calendar updated',
    };
    const { result, rerender } = renderHook(
      ({ deviceMap }) =>
        useHomeOverviewCollections({
          deviceMap,
          allCustomCards: [],
          homeLayout,
        }),
      {
        initialProps: {
          deviceMap: new Map([['calendar.kitchen', initialDevice]]),
        },
      }
    );
    const initialAllCards = result.current.allCards;
    const initialFlowCards = result.current.flowCards;
    const initialSectionCards = result.current.sectionCards;

    rerender({
      deviceMap: new Map([['calendar.kitchen', updatedDevice]]),
    });

    expect(result.current.allCards).not.toBe(initialAllCards);
    expect(result.current.allCards.get('calendar.kitchen')).toBe(updatedDevice);
    expect(result.current.flowCards).toBe(initialFlowCards);
    expect(result.current.sectionCards).toBe(initialSectionCards);
  });

  it('keeps the phone small tile aligned to the 168 logical px target footprint', () => {
    expect(getDashboardCardFootprint('small', 2)).toEqual({
      widthPx: PHONE_SMALL_CARD_TARGET_WIDTH_PX,
      heightPx: PHONE_SMALL_CARD_TARGET_WIDTH_PX,
    });
  });

  it('keeps extra-wide cards two rows tall and scales their width down responsively', () => {
    const large = getDashboardCardFootprint('large', 8);
    const extraWide = getDashboardCardFootprint('extra-wide', 8);

    expect(extraWide.heightPx).toBe(large.heightPx);
    expect(extraWide.widthPx).toBeGreaterThan(getDashboardCardFootprint('extra-large', 8).widthPx);
    expect(getResponsiveCardSize('extra-wide', 8)).toBe('extra-wide');
    expect(getResponsiveCardSize('extra-wide', 4)).toBe('extra-large');
    expect(getResponsiveCardSize('extra-wide', 2)).toBe('large');
  });

  it('derives phone grid target widths from the shared footprint metrics', () => {
    const gridGapPx = getCardGridGapPx(2);

    expect(getCardGridTargetWidth(4, gridGapPx)).toEqual({
      microCardMinWidth: 80,
      targetGridWidth: 344,
    });
  });
});
