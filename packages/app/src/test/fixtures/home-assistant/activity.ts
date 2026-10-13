/** Recorded entries returned by logbook/get_events (timestamps are Unix seconds). */
export const homeAssistantActivityFixture = [
  { when: 1791887400, entity_id: 'switch.kitchen', state: 'on', context_user_id: 'household-user' },
  {
    when: 1791887700,
    entity_id: 'switch.kitchen',
    name: 'Kitchen',
    message: 'Evening routine started',
    domain: 'switch',
  },
  { when: 1791888000, entity_id: 'switch.bedroom', state: 'off' },
];
