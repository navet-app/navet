import { makeHassEntityFixture } from '../shared';

export const actionHelperEntities = Object.fromEntries(
  ['button', 'input_button', 'script'].map((domain) => [
    `${domain}.action`,
    makeHassEntityFixture({
      entityId: `${domain}.action`,
      state: domain === 'script' ? 'off' : '2026-10-12T10:00:00+00:00',
      attributes: { friendly_name: 'Action' },
    }),
  ])
);
