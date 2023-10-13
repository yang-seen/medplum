import { createStyles } from '@mantine/core';
import { capitalize, evalFhirPathTyped, toTypedValue } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { createPatch } from 'rfc6902';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';

const useStyles = createStyles((theme) => ({
  root: {
    borderCollapse: 'collapse',
    width: '100%',

    '& tr': {
      borderTop: `0.1px solid ${theme.colors.gray[3]}`,
    },

    '& th, & td': {
      padding: `${theme.spacing.sm} ${theme.spacing.sm}`,
      verticalAlign: 'top',
    },
  },

  removed: {
    color: theme.colors.red[7],
    fontFamily: 'monospace',
    textDecoration: 'line-through',
    whiteSpace: 'pre-wrap',
  },

  added: {
    color: theme.colors.green[7],
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
  },
}));

export interface ResourceDiffTableProps {
  original: Resource;
  revised: Resource;
}

export function ResourceDiffTable(props: ResourceDiffTableProps): JSX.Element | null {
  const { classes } = useStyles();
  const medplum = useMedplum();
  const [schemaLoaded, setSchemaLoaded] = useState(false);

  useEffect(() => {
    medplum
      .requestSchema(props.original.resourceType)
      .then(() => setSchemaLoaded(true))
      .catch(console.log);
  }, [medplum, props.original.resourceType]);

  if (!schemaLoaded) {
    return null;
  }

  const patch = createPatch(props.original, props.revised);
  const typedOriginal = [toTypedValue(props.original)];
  const typedRevised = [toTypedValue(props.revised)];
  // const tests = createTests(props.original, patch);

  return (
    <table className={classes.root}>
      <colgroup>
        <col style={{ width: '10%' }} />
        <col style={{ width: '20%' }} />
        <col style={{ width: '35%' }} />
        <col style={{ width: '35%' }} />
      </colgroup>
      <thead>
        <tr>
          <th>Operation</th>
          <th>Property</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {patch.map((op) => {
          if (op.path.startsWith('/meta')) {
            return null;
          }

          console.log(op);

          const path = op.path;
          const fhirPath = jsonPathToFhirPath(path);
          // const originalValue = tests.find((test) => test.path === path)?.value;
          // const revisedValue = (op as any).value;
          // const originalValue = getTypedPropertyValue(typedOriginal, fhirPath);
          // const revisedValue = getTypedPropertyValue(typedRevised, fhirPath);
          const originalValue = evalFhirPathTyped(fhirPath, typedOriginal);

          return (
            <tr key={`op-${op.op}-${op.path}`}>
              <td>{capitalize(op.op)}</td>
              <td>{fhirPath}</td>
              <td className={classes.removed}>
                <ResourcePropertyDisplay
                  property={property}
                  propertyType={originalValue.type}
                  value={originalPropertyValue}
                  ignoreMissingValues={true}
                />
              </td>
              <td className={classes.added}>{formatJsonValue(revisedValue)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function jsonPathToFhirPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  let result = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '-') {
      result += '.last()';
    } else if (/^\d+$/.test(part)) {
      result += `[${part}]`;
    } else {
      if (i > 0) {
        result += '.';
      }
      result += part;
    }
  }
  return result;
}

function formatJsonValue(value: any): string {
  if (!value) {
    return '';
  }
  let result = JSON.stringify(value, null, 2);
  if (result.length > 100) {
    result = result.substr(0, 100) + '...';
  }
  return result;
}
