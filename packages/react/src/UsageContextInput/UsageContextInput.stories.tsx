import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document/Document';
import { UsageContextInput } from './UsageContextInput';

export default {
  title: 'Medplum/UsageContextInput',
  component: UsageContextInput,
} as Meta;

export const Example = (): JSX.Element => (
  <Document>
    <UsageContextInput name="demo" />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <UsageContextInput
      name="demo"
      defaultValue={{
        code: { code: 'gender' },
        valueCodeableConcept: { coding: [{ code: 'male' }] },
      }}
    />
  </Document>
);
