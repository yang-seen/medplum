import { UsageContext } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { UsageContextInput } from './UsageContextInput';

const startDateTime = '2021-01-01T00:00:00.000Z';
const endDateTime = '2021-01-02T00:00:00.000Z';

describe('UsageContextInput', () => {
  test('Renders undefined value', () => {
    render(<UsageContextInput name="a" />);
    expect(screen.getByPlaceholderText('Start')).toBeDefined();
    expect(screen.getByPlaceholderText('End')).toBeDefined();
  });

  test('Renders', () => {
    render(
      <UsageContextInput
        name="a"
        defaultValue={{ code: { code: 'gender' }, valueCodeableConcept: { coding: [{ code: 'male' }] } }}
      />
    );
    expect(screen.getByPlaceholderText('Start')).toBeDefined();
    expect(screen.getByPlaceholderText('End')).toBeDefined();
  });

  test('Change event', async () => {
    let lastValue: UsageContext | undefined = undefined;

    render(
      <UsageContextInput
        name="a"
        defaultValue={{ code: { code: 'gender' }, valueCodeableConcept: { coding: [{ code: 'male' }] } }}
        onChange={(value) => (lastValue = value)}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Start'), {
        target: { value: startDateTime },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('End'), {
        target: { value: endDateTime },
      });
    });

    expect(lastValue).toBeDefined();
    expect(lastValue).toMatchObject({ start: startDateTime, end: endDateTime });
  });
});
