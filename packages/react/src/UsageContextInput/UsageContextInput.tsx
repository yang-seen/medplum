import { Group } from '@mantine/core';
import { globalSchema } from '@medplum/core';
import { UsageContext } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { CodingInput } from '../CodingInput/CodingInput';
import { setPropertyValue } from '../ResourceForm/ResourceForm';
import { getValueAndType } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';

export interface UsageContextInputProps {
  name: string;
  defaultValue?: UsageContext;
  onChange?: (value: UsageContext) => void;
}

export function UsageContextInput(props: UsageContextInputProps): JSX.Element {
  const usageContextType = globalSchema.types['UsageContext'];
  const codeProperty = usageContextType.properties['code'];
  const valueProperty = usageContextType.properties['value[x]'];

  const [value, setValue] = useState(props.defaultValue || {});

  function setValueWrapper(newValue: UsageContext): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  const [propertyValue, propertyType] = getValueAndType({ type: 'UsageContext', value }, 'value[x]');

  return (
    <Group spacing="xs" grow noWrap>
      <CodingInput
        name={`${props.name}-code`}
        placeholder="Code"
        property={codeProperty}
        defaultValue={value?.code}
        onChange={(newCode) => setValueWrapper({ ...value, code: newCode })}
      />
      <ResourcePropertyInput
        name={`${props.name}-value`}
        property={valueProperty}
        defaultPropertyType={propertyType}
        defaultValue={propertyValue}
        onChange={(newValue: any, propName?: string) => {
          setValueWrapper(setPropertyValue(value, 'value[x]', propName as string, valueProperty, newValue));
        }}
      />
    </Group>
  );
}
