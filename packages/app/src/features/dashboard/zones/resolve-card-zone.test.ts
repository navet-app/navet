import { describe, expect, it } from 'vitest';
import { resolveCardZone } from './resolve-card-zone';
import type { ZoneName } from './zone-types';

describe('household control zones', () => {
  it.each(['helpers', 'timers', 'counters', 'valves', 'remotes'])(
    'places newly discovered %s beside switches and covers in Actions',
    (type) => {
      expect(resolveCardZone('switches', undefined)).toBe('actions');
      expect(resolveCardZone('covers', undefined)).toBe('actions');
      expect(resolveCardZone(type, undefined)).toBe('actions');
    }
  );

  it.each(['hero', 'actions', 'status', 'analytics'] satisfies ZoneName[])(
    'preserves an explicitly saved %s zone for every household control',
    (zone) => {
      for (const type of ['helpers', 'timers', 'counters', 'valves', 'remotes']) {
        expect(resolveCardZone(type, zone)).toBe(zone);
      }
    }
  );
});
