import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RotaryKnob } from '../rotary-knob';

const setPointerCapture = vi.fn();
const hasPointerCapture = vi.fn();
const releasePointerCapture = vi.fn();

describe('RotaryKnob', () => {
  beforeEach(() => {
    setPointerCapture.mockReset();
    hasPointerCapture.mockReset();
    hasPointerCapture.mockReturnValue(true);
    releasePointerCapture.mockReset();

    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: setPointerCapture,
    });
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: hasPointerCapture,
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: releasePointerCapture,
    });
  });

  it('cancels page scrolling while adjusting and committing the current value with the wheel', () => {
    const onValueChange = vi.fn();
    const onValueCommit = vi.fn();
    const props = {
      id: 'wheel-knob',
      value: 21,
      min: 16,
      max: 30,
      step: 0.5,
      ariaLabel: 'Temperature',
      bandPrimaryColor: '#ff6b00',
      bandSecondaryColor: '#ff9a3d',
      bandGlowColor: 'rgba(255, 107, 0, 0.45)',
      onValueChange,
      onValueCommit,
    };
    const { rerender, unmount } = render(<RotaryKnob {...props} />);
    const slider = screen.getByRole('slider', { name: 'Temperature' });
    const dashRingSurface = slider.querySelector<HTMLElement>(
      '[data-rotary-knob-hit-surface="true"]'
    );
    if (!dashRingSurface) {
      throw new Error('Expected the rotary knob dash ring interaction surface');
    }

    expect(fireEvent.wheel(dashRingSurface, { deltaY: -100 })).toBe(false);
    expect(onValueChange).toHaveBeenLastCalledWith(21.5);
    expect(onValueCommit).toHaveBeenCalledOnce();
    expect(onValueCommit).toHaveBeenLastCalledWith(21.5);

    rerender(<RotaryKnob {...props} value={24} step={1} />);
    expect(fireEvent.wheel(slider, { deltaY: 100 })).toBe(false);
    expect(onValueChange).toHaveBeenLastCalledWith(23);
    expect(onValueCommit).toHaveBeenCalledTimes(2);
    expect(onValueCommit).toHaveBeenLastCalledWith(23);

    unmount();
    expect(fireEvent.wheel(slider, { deltaY: 100 })).toBe(true);
    expect(onValueChange).toHaveBeenCalledTimes(2);
    expect(onValueCommit).toHaveBeenCalledTimes(2);
  });

  it('allows page scrolling while off or read-only and enables wheel adjustment when turned on', () => {
    const onValueChange = vi.fn();
    const props = {
      id: 'disabled-wheel-knob',
      value: 21,
      bandPrimaryColor: '#ff6b00',
      bandSecondaryColor: '#ff9a3d',
      bandGlowColor: 'rgba(255, 107, 0, 0.45)',
    };
    const { container, rerender } = render(
      <RotaryKnob {...props} isOn={false} onValueChange={onValueChange} />
    );
    const inactiveKnob = container.querySelector('[role="img"]');
    if (!inactiveKnob) {
      throw new Error('Expected an inactive rotary knob');
    }
    expect(fireEvent.wheel(inactiveKnob, { deltaY: -100 })).toBe(true);
    expect(onValueChange).not.toHaveBeenCalled();

    rerender(<RotaryKnob {...props} onValueChange={onValueChange} />);
    const slider = screen.getByRole('slider');
    expect(fireEvent.wheel(slider, { deltaY: -100 })).toBe(false);
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(22);

    rerender(<RotaryKnob {...props} />);
    const readOnlyKnob = container.querySelector('[role="img"]');
    if (!readOnlyKnob) {
      throw new Error('Expected a read-only rotary knob');
    }
    expect(fireEvent.wheel(readOnlyKnob, { deltaY: -100 })).toBe(true);
    expect(onValueChange).toHaveBeenCalledOnce();
  });

  it('drags from the compact dash ring without handing the gesture to page scrolling', () => {
    const onValueChange = vi.fn();
    const onValueCommit = vi.fn();

    render(
      <RotaryKnob
        id="climate-medium"
        value={21}
        min={16}
        max={30}
        step={0.5}
        ariaLabel="Heat temperature gauge"
        className="h-[11.5rem] w-[11.5rem]"
        tickOffsetRem={7.9}
        bandPrimaryColor="#ff6b00"
        bandSecondaryColor="#ff9a3d"
        bandGlowColor="rgba(255, 107, 0, 0.45)"
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
      />
    );

    const slider = screen.getByRole('slider', { name: 'Heat temperature gauge' });
    const dashRingSurface = slider.querySelector<HTMLElement>(
      '[data-rotary-knob-hit-surface="true"]'
    );

    expect(dashRingSurface).not.toBeNull();
    if (!dashRingSurface) {
      throw new Error('Expected the rotary knob dash ring interaction surface');
    }

    expect(dashRingSurface).toHaveClass('rounded-full', 'touch-none');
    expect(dashRingSurface.style.height).toBe('17.8rem');
    expect(dashRingSurface.style.minHeight).toBe('100%');
    expect(dashRingSurface.style.minWidth).toBe('100%');
    expect(dashRingSurface.style.width).toBe('17.8rem');

    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      bottom: 184,
      height: 184,
      left: 0,
      right: 184,
      toJSON: () => ({}),
      top: 0,
      width: 184,
      x: 0,
      y: 0,
    });

    const pointerDownAcceptedByPage = fireEvent.pointerDown(dashRingSurface, {
      clientX: -34,
      clientY: 92,
      pointerId: 7,
    });

    expect(pointerDownAcceptedByPage).toBe(false);
    expect(setPointerCapture).toHaveBeenCalledWith(7);

    fireEvent.pointerMove(window, {
      clientX: 92,
      clientY: -34,
      pointerId: 7,
    });
    fireEvent.pointerUp(dashRingSurface, {
      clientX: 92,
      clientY: -34,
      pointerId: 7,
    });

    expect(onValueChange).toHaveBeenLastCalledWith(23.5);
    expect(onValueCommit).toHaveBeenCalledOnce();
    expect(onValueCommit).toHaveBeenCalledWith(23.5);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
  });
});
