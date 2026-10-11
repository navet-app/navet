import { dispatchEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import { renderCard } from '@navet/app/features/dashboard/utils/card-renderer';
import { renderWithProviders } from '@navet/app/test/render';
import { resetAppStores } from '@navet/app/test/store-reset';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelperCard, HelperValueControl } from './helper-card';

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock('@navet/app/commands', () => ({ dispatchEntityCommand: dispatch }));

describe('helper controls', () => {
  beforeEach(async () => {
    await resetAppStores();
    dispatch.mockReset().mockResolvedValue({ accepted: true, requiresEventConfirmation: true });
  });
  afterEach(() => vi.useRealTimers());

  it('opens matching helper settings from the edit dock and ignores other cards and view mode', () => {
    const props = {
      id: 'number.target',
      name: 'Target',
      size: 'small' as const,
      helper: {
        helperType: 'number' as const,
        value: 21,
        writable: true,
        min: 15,
        max: 30,
        step: 1,
      },
    };
    const view = renderWithProviders(<HelperCard {...props} isEditMode={false} />);
    act(() => dispatchEditModeSettingsRequest(props.id));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.rerender(<HelperCard {...props} isEditMode />);
    act(() => dispatchEditModeSettingsRequest('number.other'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => dispatchEditModeSettingsRequest(props.id));
    expect(screen.getByRole('dialog', { name: 'Target' })).toBeInTheDocument();
  });

  it('preserves helper room identity through dashboard composition', async () => {
    const card = renderCard({
      device: {
        id: 'number.target',
        name: 'Target',
        type: 'helpers',
        room: 'Kitchen',
        helper: { helperType: 'number', value: 21, writable: true, min: 15, max: 30, step: 1 },
      },
      size: 'small',
      isEditMode: false,
      handleSizeChange: () => undefined,
    });
    if (!card) throw new Error('Expected helper card');
    renderWithProviders(card);
    expect(await screen.findByText('Kitchen')).toBeInTheDocument();
  });

  it('labels a UTC datetime control and preserves its displayed clock on submission', async () => {
    const view = renderWithProviders(
      <HelperValueControl
        id="home_assistant:datetime.departure"
        name="Departure"
        providerId="home_assistant"
        helper={{
          helperType: 'datetime',
          value: '2026-10-25 00:30:00',
          writable: true,
          timeZone: 'UTC',
        }}
      />
    );
    const field = screen.getByLabelText('Departure (UTC)');
    expect(field).toHaveValue('2026-10-25T00:30');
    fireEvent.change(field, { target: { value: '2026-10-25T01:30:00' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(dispatch).toHaveBeenCalledWith(
      {
        type: 'set_datetime_value',
        entityId: 'home_assistant:datetime.departure',
        value: '2026-10-25 01:30:00',
      },
      'home_assistant'
    );
    view.rerender(
      <HelperValueControl
        id="home_assistant:datetime.departure"
        name="Departure"
        providerId="home_assistant"
        helper={{
          helperType: 'datetime',
          value: '2026-10-25 01:30:00',
          writable: true,
          timeZone: 'UTC',
        }}
      />
    );
    expect(field).toBeEnabled();
    expect(screen.queryByText('Updating…')).not.toBeInTheDocument();
  });

  it.each(['rejection', 'timeout'] as const)(
    'preserves the submitted draft across an unrelated live update before %s',
    async (outcome) => {
      vi.useFakeTimers();
      let rejectWrite: (error: Error) => void = () => {};
      dispatch.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectWrite = reject;
          })
      );
      const helper = {
        helperType: 'number' as const,
        value: 21,
        writable: true,
        min: 15,
        max: 30,
        step: 1,
      };
      const view = renderWithProviders(
        <HelperValueControl id="number.target" name="Target" helper={helper} />
      );
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '23' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      view.rerender(
        <HelperValueControl id="number.target" name="Target" helper={{ ...helper, value: 22 }} />
      );
      await act(async () => {
        if (outcome === 'rejection') rejectWrite(new Error('Write rejected'));
        else await vi.advanceTimersByTimeAsync(10000);
      });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('spinbutton')).toHaveValue(23);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      });
      expect(dispatch).toHaveBeenLastCalledWith(
        { type: 'set_number_value', entityId: 'number.target', value: 23 },
        undefined
      );
      view.rerender(
        <HelperValueControl id="number.target" name="Target" helper={{ ...helper, value: 23 }} />
      );
      expect(screen.getByRole('spinbutton')).toBeEnabled();
      view.rerender(
        <HelperValueControl id="number.target" name="Target" helper={{ ...helper, value: 24 }} />
      );
      expect(screen.getByRole('spinbutton')).toHaveValue(24);
    }
  );

  it('retries a stalled write without letting its late failure overwrite the retry', async () => {
    vi.useFakeTimers();
    let rejectOld: (error: Error) => void = () => {};
    dispatch.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectOld = reject;
        })
    );
    const helper = {
      helperType: 'number' as const,
      value: 21,
      writable: true,
      min: 15,
      max: 30,
      step: 1,
    };
    const view = renderWithProviders(
      <HelperValueControl
        id="home_assistant:number.target"
        name="Target"
        helper={helper}
        providerId="home_assistant"
      />
    );
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '23' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toHaveValue(23);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '24' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Updating…')).toBeInTheDocument();
    await act(async () => {
      rejectOld(new Error('Old connection failed'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toBeDisabled();
    view.rerender(
      <HelperValueControl
        id="home_assistant:number.target"
        name="Target"
        helper={{ ...helper, value: 24 }}
        providerId="home_assistant"
      />
    );
    expect(screen.queryByText('Updating…')).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toBeEnabled();
  });

  it('allows another write after live confirmation before the prior transport settles', async () => {
    let rejectOld: (error: Error) => void = () => {};
    dispatch.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectOld = reject;
        })
    );
    const helper = {
      helperType: 'number' as const,
      value: 21,
      writable: true,
      min: 15,
      max: 30,
      step: 1,
    };
    const view = renderWithProviders(
      <HelperValueControl id="number.target" name="Target" helper={helper} />
    );
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '23' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    view.rerender(
      <HelperValueControl id="number.target" name="Target" helper={{ ...helper, value: 23 }} />
    );
    expect(screen.getByRole('spinbutton')).toBeEnabled();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '24' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
    await act(async () => {
      rejectOld(new Error('Transport settled after live confirmation'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Updating…')).toBeInTheDocument();
  });

  it('resets drafts and pending writes when the helper owner changes', async () => {
    let rejectOld: (error: Error) => void = () => {};
    dispatch.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectOld = reject;
        })
    );
    const helper = {
      helperType: 'number' as const,
      value: 21,
      writable: true,
      min: 15,
      max: 30,
      step: 1,
    };
    const view = renderWithProviders(
      <HelperValueControl
        id="home_assistant:number.target"
        name="Target"
        helper={helper}
        providerId="home_assistant"
      />
    );
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '23' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    view.rerender(
      <HelperValueControl
        id="homey:other-target"
        name="Other target"
        helper={{ ...helper, value: 18 }}
        providerId="homey"
      />
    );
    expect(screen.getByRole('spinbutton', { name: 'Other target' })).toHaveValue(18);
    expect(screen.queryByText('Updating…')).not.toBeInTheDocument();
    await act(async () => {
      rejectOld(new Error('Old connection failed'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '19' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(dispatch).toHaveBeenLastCalledWith(
      { type: 'set_number_value', entityId: 'homey:other-target', value: 19 },
      'homey'
    );
  });
  it('sends a bounded number to its owning adapter and keeps the live value while pending', async () => {
    renderWithProviders(
      <HelperValueControl
        id="home_assistant:number.target"
        name="Target"
        providerId="home_assistant"
        helper={{
          helperType: 'number',
          value: 21,
          writable: true,
          min: 15,
          max: 30,
          step: 0.5,
          unit: '°C',
        }}
      />
    );
    const field = screen.getByRole('spinbutton', { name: 'Target' });
    expect(field).toHaveAttribute('min', '15');
    expect(field).toHaveAttribute('max', '30');
    expect(field).toHaveAttribute('step', '0.5');
    fireEvent.change(field, { target: { value: '22.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        { type: 'set_number_value', entityId: 'home_assistant:number.target', value: 22.5 },
        'home_assistant'
      )
    );
    expect(screen.getByText('Updating…')).toBeInTheDocument();
    expect(field).toBeDisabled();
  });
  it('shows rejected writes and lets the household retry', async () => {
    dispatch.mockResolvedValue({ accepted: false, requiresEventConfirmation: false });
    renderWithProviders(
      <HelperValueControl
        id="text.note"
        name="Note"
        helper={{
          helperType: 'text',
          value: 'Home',
          writable: true,
          mode: 'text',
          minLength: 0,
          maxLength: 20,
        }}
      />
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'Away' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to update the value. Try again.'
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
  it('refreshes options and prevents submitting a removed choice', () => {
    const helper = {
      helperType: 'select' as const,
      value: 'Home',
      writable: true,
      options: ['Home', 'Away'],
    };
    const { rerender } = renderWithProviders(
      <HelperValueControl id="select.mode" name="Mode" helper={helper} />
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Away' } });
    rerender(
      <HelperValueControl id="select.mode" name="Mode" helper={{ ...helper, options: ['Home'] }} />
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText('Choose an available option')).toBeInTheDocument();
  });
  it('uses backend wall-clock date/time without a timezone conversion', async () => {
    renderWithProviders(
      <HelperValueControl
        id="input_datetime.start"
        name="Start"
        helper={{ helperType: 'datetime', value: '2026-10-10 07:30:00', writable: true }}
      />
    );
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-10-11T08:45:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        {
          type: 'set_datetime_value',
          entityId: 'input_datetime.start',
          value: '2026-10-11 08:45:00',
        },
        undefined
      )
    );
  });
  it('disables unavailable and read-only fields', () => {
    renderWithProviders(
      <HelperValueControl
        id="number.target"
        name="Target"
        unavailable
        helper={{ helperType: 'number', value: 21, writable: true, min: 15, max: 30, step: 1 }}
      />
    );
    expect(screen.getByRole('spinbutton')).toBeDisabled();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });
  it('opens the controls and keeps password values private', () => {
    renderWithProviders(
      <HelperCard
        id="text.password"
        name="Password"
        size="tiny"
        isEditMode={false}
        helper={{
          helperType: 'text',
          value: 'secret',
          writable: true,
          mode: 'password',
          minLength: 0,
          maxLength: 100,
        }}
      />
    );
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Password, ••••' });
    expect(trigger).not.toHaveAccessibleName(/secret/);
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Password', { selector: 'input' })).toHaveAttribute(
      'type',
      'password'
    );
  });
  it('preserves a dirty draft when realtime value changes', () => {
    const helper = {
      helperType: 'number' as const,
      value: 21,
      writable: true,
      min: 15,
      max: 30,
      step: 1,
    };
    const { rerender } = renderWithProviders(
      <HelperValueControl id="number.target" name="Target" helper={helper} />
    );
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '23' } });
    rerender(
      <HelperValueControl id="number.target" name="Target" helper={{ ...helper, value: 22 }} />
    );
    expect(screen.getByRole('spinbutton')).toHaveValue(23);
  });
  it('confirms semantically equal numeric provider updates', async () => {
    const helper = {
      helperType: 'number' as const,
      value: 21,
      writable: true,
      min: 15,
      max: 30,
      step: 0.5,
    };
    const { rerender } = renderWithProviders(
      <HelperValueControl id="number.target" name="Target" helper={helper} />
    );
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '22.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    rerender(
      <HelperValueControl id="number.target" name="Target" helper={{ ...helper, value: 22 }} />
    );
    expect(screen.queryByText('Updating…')).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toBeEnabled();
  });
  it('confirms a time update when the provider includes seconds', async () => {
    const helper = { helperType: 'time' as const, value: '07:30:00', writable: true };
    const { rerender } = renderWithProviders(
      <HelperValueControl id="time.start" name="Start" helper={helper} />
    );
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '08:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        { type: 'set_datetime_value', entityId: 'time.start', value: '08:30:00' },
        undefined
      )
    );
    rerender(
      <HelperValueControl id="time.start" name="Start" helper={{ ...helper, value: '08:30:00' }} />
    );
    expect(screen.queryByText('Updating…')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Start')).toBeEnabled();
  });
  it('counts Unicode characters like the provider and rejects overlength text', async () => {
    dispatch.mockResolvedValue({ accepted: true, requiresEventConfirmation: false });
    renderWithProviders(
      <HelperValueControl
        id="text.note"
        name="Note"
        helper={{
          helperType: 'text',
          value: '',
          writable: true,
          mode: 'text',
          minLength: 0,
          maxLength: 4,
        }}
      />
    );
    const field = screen.getByRole('textbox', { name: 'Note' });
    fireEvent.change(field, { target: { value: '😀😀😀😀' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        { type: 'set_text_value', entityId: 'text.note', value: '😀😀😀😀' },
        undefined
      )
    );
    fireEvent.change(field, { target: { value: '😀😀😀😀😀' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Use 0–4 characters.')).toBeInTheDocument();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
