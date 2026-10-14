import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('nginx shared dictionary portability', () => {
  for (const file of [
    'docker/nginx.main.conf',
    'platform/home-assistant/addons/navet/rootfs/etc/nginx/nginx.conf',
  ]) {
    it(`${file} supports hosts with 64 KiB memory pages`, () => {
      const source = readFileSync(file, 'utf8');
      const zones = [
        ...source.matchAll(/^\s*js_shared_dict_zone\s+zone=([^:]+):(\d+)([kKmM]?)\b/gm),
      ];
      expect(zones.length).toBeGreaterThan(0);
      // njs requires at least eight host pages, including on ARM64 hosts
      // configured with 64 KiB pages. Emulation on a 4 KiB host misses this.
      for (const [, name, amount, unit] of zones) {
        const multiplier = { '': 1, k: 1024, m: 1024 * 1024 }[unit.toLowerCase()];
        expect(Number(amount) * multiplier, `${name} in ${file}`).toBeGreaterThanOrEqual(
          8 * 65536
        );
      }
    });
  }
});
