/** Minimal REST history: the recorder shifts a retained first state to the range start. */
export const homeAssistantHistoryBoundaryFixture = [
  [
    {
      entity_id: 'switch.kitchen',
      state: 'off',
      last_changed: '2026-10-13T10:00:00+00:00',
      last_updated: '2026-10-13T10:00:00+00:00',
    },
    { state: 'on', last_changed: '2026-10-13T10:30:00+00:00' },
  ],
];
