import { setMediaQueryMatch } from '@navet/app/test/browser-mocks';
import { renderWithProviders } from '@navet/app/test/render';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrightnessSlider } from './brightness-slider';

describe('BrightnessSlider', () => {
  it.each([
    { device: 'phone', primaryTouch: true, anyTouch: true, expectedSize: 'h-6 w-6' },
    {
      device: 'touchscreen with a primary mouse',
      primaryTouch: false,
      anyTouch: true,
      expectedSize: 'h-6 w-6',
    },
    { device: 'mouse-only display', primaryTouch: false, anyTouch: false, expectedSize: 'h-4 w-4' },
  ])(
    'uses the appropriate handle size on a $device',
    ({ primaryTouch, anyTouch, expectedSize }) => {
      setMediaQueryMatch('(pointer: coarse)', primaryTouch);
      setMediaQueryMatch('(any-pointer: coarse)', anyTouch);
      setMediaQueryMatch('(pointer: fine)', !primaryTouch);

      renderWithProviders(<BrightnessSlider value={50} onChange={vi.fn()} onCommit={vi.fn()} />);

      expect(screen.getByRole('slider', { name: 'Brightness' })).toHaveClass(expectedSize);
    }
  );

  it('uses a subdued thumb style when the control is off', () => {
    renderWithProviders(
      <BrightnessSlider
        value={0}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        isOn={false}
        size="medium"
      />
    );

    const thumb = screen.getByRole('slider', { name: 'Brightness' });

    expect(thumb).toHaveStyle({
      backgroundColor: 'rgb(58, 58, 66)',
      boxShadow: '0 0 0 2px rgba(255,255,255,0.1)',
    });
    expect(thumb.className).toContain('shadow-none');
    expect(thumb.className).not.toContain('opacity-70');
  });
});
