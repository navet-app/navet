import { HA_PENDING_ECHO_WINDOW_MS } from '@navet/app/constants/interaction-timing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ClimateControlState, createClimateReconciliation } from '../climate-reconciliation';

const initial: ClimateControlState = {
  targetTemp: 21,
  currentTemp: 20,
  mode: 'heat',
  isOn: true,
  action: 'heating',
  supportedClimateModes: ['heat', 'cool', 'off'],
};

describe('Climate command reconciliation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('holds a requested temperature through stale echoes and accepts a clamped echo at expiry', () => {
    const climate = createClimateReconciliation(initial);
    climate.requestTemperature(24);
    climate.observe({ ...initial, targetTemp: 23, currentTemp: 22 });
    expect(climate.getSnapshot()).toMatchObject({ targetTemp: 24, currentTemp: 22 });
    vi.advanceTimersByTime(HA_PENDING_ECHO_WINDOW_MS);
    expect(climate.getSnapshot().targetTemp).toBe(23);
  });

  it('ignores an older rejection after another temperature request', () => {
    const climate = createClimateReconciliation(initial);
    const rejectOld = climate.requestTemperature(22);
    climate.requestTemperature(24);
    rejectOld();
    expect(climate.getSnapshot().targetTemp).toBe(24);
    climate.observe({ ...initial, targetTemp: 24 });
    vi.advanceTimersByTime(HA_PENDING_ECHO_WINDOW_MS);
    expect(climate.getSnapshot().targetTemp).toBe(24);
  });

  it('ignores an older mode rejection after a newer request or its confirmation', () => {
    const climate = createClimateReconciliation(initial);
    const rejectOld = climate.requestOperatingState({ ...initial, mode: 'cool' });
    const rejectLatest = climate.requestOperatingState({
      mode: 'off',
      isOn: false,
      action: 'idle',
    });
    rejectOld();
    expect(climate.getSnapshot().mode).toBe('off');
    climate.observe({ mode: 'off', isOn: false, action: 'idle' });
    rejectLatest();
    expect(climate.getSnapshot().mode).toBe('off');
  });

  it('restores the latest observed operating state when the active request fails', () => {
    const climate = createClimateReconciliation(initial);
    const reject = climate.requestOperatingState({ mode: 'off', isOn: false, action: 'idle' });
    climate.observe({ ...initial, action: 'idle' });
    expect(climate.getSnapshot().mode).toBe('off');
    reject();
    expect(climate.getSnapshot()).toMatchObject({ mode: 'heat', isOn: true, action: 'idle' });
    vi.advanceTimersByTime(HA_PENDING_ECHO_WINDOW_MS);
    expect(climate.getSnapshot().mode).toBe('heat');
  });

  it('restores a failed temperature request without waiting for an echo', () => {
    const climate = createClimateReconciliation(initial);
    climate.requestTemperature(25)();
    expect(climate.getSnapshot().targetTemp).toBe(21);
  });

  it('keeps pending temperature and operating echoes independent', () => {
    const climate = createClimateReconciliation(initial);
    climate.requestTemperature(24);
    climate.requestOperatingState({ mode: 'off', isOn: false });
    climate.observe({ ...initial, mode: 'off', isOn: false, targetTemp: 22 });
    expect(climate.getSnapshot()).toMatchObject({ targetTemp: 24, mode: 'off' });
    vi.advanceTimersByTime(HA_PENDING_ECHO_WINDOW_MS);
    expect(climate.getSnapshot()).toMatchObject({ targetTemp: 22, mode: 'off' });
  });

  it('does not replace a target when the provider omits it', () => {
    const climate = createClimateReconciliation(initial);
    climate.observe({ mode: 'heat', isOn: true, currentTemp: 19 });
    expect(climate.getSnapshot()).toMatchObject({ targetTemp: 21, currentTemp: 19 });
  });

  it('invalidates outstanding failures on disposal and accepts requests after reconnection', () => {
    const climate = createClimateReconciliation(initial);
    const rejected = climate.requestTemperature(24);
    climate.dispose();
    const changed = vi.fn();
    climate.subscribe(changed);
    rejected();
    vi.advanceTimersByTime(HA_PENDING_ECHO_WINDOW_MS);
    expect(climate.getSnapshot().targetTemp).toBe(24);
    expect(changed).not.toHaveBeenCalled();
    const rejectNew = climate.requestTemperature(25);
    expect(climate.getSnapshot().targetTemp).toBe(25);
    rejectNew();
    expect(climate.getSnapshot().targetTemp).toBe(24);
  });

  it('cancels expiry and isolates callbacks from a different owner', () => {
    const oldOwner = createClimateReconciliation(initial);
    const rejectOld = oldOwner.requestOperatingState({ mode: 'off', isOn: false });
    oldOwner.observe({ ...initial, mode: 'cool' });
    oldOwner.dispose();
    const newOwner = createClimateReconciliation({ ...initial, mode: 'cool', targetTemp: 19 });
    const changed = vi.fn();
    newOwner.subscribe(changed);
    rejectOld();
    vi.advanceTimersByTime(HA_PENDING_ECHO_WINDOW_MS);
    expect(newOwner.getSnapshot()).toMatchObject({ mode: 'cool', targetTemp: 19 });
    expect(changed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
