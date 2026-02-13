'use client';

import { useEffect, useState, memo, useMemo } from 'react';
import {
  Box,
  Button,
  Dropdown,
  AutoComplete,
  FormField,
} from '@wix/design-system';
import { TRANSFORM_OPTIONS, DIRECTION_OPTIONS } from '@/lib/constants';
import type { MappingDirection } from '@/lib/types';

export interface MappingRowData {
  id?: string;
  wixFieldKey: string;
  hubspotPropertyKey: string;
  direction: MappingDirection;
  transform: string;
}

export interface FieldOption {
  key: string;
  label: string;
}

interface MappingRowProps {
  row: MappingRowData;
  rowIndex: number;
  wixFields: FieldOption[];
  hubspotFields: FieldOption[];
  onUpdate: (index: number, field: keyof MappingRowData, value: string) => void;
  onRemove: (index: number) => void;
}

const VALIDATION_MESSAGE = 'Select a field from the list';

function MappingRowComponent({
  row,
  rowIndex,
  wixFields,
  hubspotFields,
  onUpdate,
  onRemove,
}: MappingRowProps) {
  const [wixInputValue, setWixInputValue] = useState('');
  const [hubspotInputValue, setHubspotInputValue] = useState('');
  const [wixError, setWixError] = useState<string | null>(null);
  const [hubspotError, setHubspotError] = useState<string | null>(null);

  const wixOptions = wixFields.map((f) => ({ id: f.key, value: f.label }));
  const hubspotOptions = hubspotFields.map((f) => ({
    id: f.key,
    value: f.label,
  }));

  const directionOptions = useMemo(
    () =>
      DIRECTION_OPTIONS.map((d) => ({
        id: d.value,
        value: d.label,
      })),
    []
  );
  const transformOptions = useMemo(
    () =>
      TRANSFORM_OPTIONS.map((t) => ({
        id: t.value,
        value: t.label,
      })),
    []
  );

  const isWixValueValid = (value: string) =>
    wixOptions.some(
      (o) => (o.value as string).toLowerCase() === value.trim().toLowerCase()
    );
  const isHubspotValueValid = (value: string) =>
    hubspotOptions.some(
      (o) => (o.value as string).toLowerCase() === value.trim().toLowerCase()
    );

  useEffect(() => {
    const label =
      wixFields.find((f) => f.key === row.wixFieldKey)?.label ?? '';
    setWixInputValue(label);
  }, [row.wixFieldKey, wixFields]);

  useEffect(() => {
    const label =
      hubspotFields.find((f) => f.key === row.hubspotPropertyKey)?.label ?? '';
    setHubspotInputValue(label);
  }, [row.hubspotPropertyKey, hubspotFields]);

  const handleWixBlur = () => {
    if (!wixInputValue.trim()) {
      setWixError(null);
      return;
    }
    if (!isWixValueValid(wixInputValue)) {
      setWixError(VALIDATION_MESSAGE);
      const label =
        wixFields.find((f) => f.key === row.wixFieldKey)?.label ?? '';
      setWixInputValue(label);
      onUpdate(rowIndex, 'wixFieldKey', '');
    } else {
      setWixError(null);
    }
  };

  const handleHubspotBlur = () => {
    if (!hubspotInputValue.trim()) {
      setHubspotError(null);
      return;
    }
    if (!isHubspotValueValid(hubspotInputValue)) {
      setHubspotError(VALIDATION_MESSAGE);
      const label =
        hubspotFields.find((f) => f.key === row.hubspotPropertyKey)?.label ??
        '';
      setHubspotInputValue(label);
      onUpdate(rowIndex, 'hubspotPropertyKey', '');
    } else {
      setHubspotError(null);
    }
  };

  return (
    <Box gap="SP2" align="center">
      <Box width="180px">
        <FormField
          label="Wix field"
          required
          status={wixError ? 'error' : undefined}
          statusMessage={wixError ?? undefined}
        >
          <AutoComplete
            options={wixOptions}
            value={wixInputValue}
            onChange={(e) => {
              setWixInputValue(e.target.value);
              if (wixError) setWixError(null);
            }}
            onBlur={handleWixBlur}
            onSelect={(option) => {
              if (option) {
                setWixInputValue(option.value as string);
                onUpdate(rowIndex, 'wixFieldKey', String(option.id));
                setWixError(null);
              }
            }}
            placeholder="Wix field"
            emptyStateMessage={`No match for "${wixInputValue}"`}
            predicate={(option) =>
              (option.value as string)
                .toLowerCase()
                .includes((wixInputValue || '').toLowerCase())
            }
            popoverProps={{ appendTo: 'window' }}
          />
        </FormField>
      </Box>
      <Box width="180px">
        <FormField
          label="HubSpot property"
          required
          status={hubspotError ? 'error' : undefined}
          statusMessage={hubspotError ?? undefined}
        >
          <AutoComplete
            options={hubspotOptions}
            value={hubspotInputValue}
            onChange={(e) => {
              setHubspotInputValue(e.target.value);
              if (hubspotError) setHubspotError(null);
            }}
            onBlur={handleHubspotBlur}
            onSelect={(option) => {
              if (option) {
                setHubspotInputValue(option.value as string);
                onUpdate(rowIndex, 'hubspotPropertyKey', String(option.id));
                setHubspotError(null);
              }
            }}
            placeholder="HubSpot property"
            emptyStateMessage={`No match for "${hubspotInputValue}"`}
            predicate={(option) =>
              (option.value as string)
                .toLowerCase()
                .includes((hubspotInputValue || '').toLowerCase())
            }
            popoverProps={{ appendTo: 'window' }}
          />
        </FormField>
      </Box>
      <Box width="140px">
        <FormField label="Direction" required>
          <Dropdown
            key={`direction-${rowIndex}-${row.direction}`}
            options={directionOptions}
            selectedId={row.direction}
            onSelect={(opt) =>
              onUpdate(
                rowIndex,
                'direction',
                (String(opt?.id) as MappingDirection) || 'bi_directional'
              )
            }
            popoverProps={{ appendTo: 'window' }}
          />
        </FormField>
      </Box>
      <Box width="100px">
        <FormField label="Transform" required>
          <Dropdown
            key={`transform-${rowIndex}-${row.transform ?? 'none'}`}
            options={transformOptions}
            selectedId={row.transform || 'none'}
            onSelect={(opt) => {
              const id = opt?.id != null ? String(opt.id) : '';
              const value =
                TRANSFORM_OPTIONS.find(
                  (t) => t.value === id || t.label === (opt?.value as string)
                )?.value ?? 'none';
              onUpdate(rowIndex, 'transform', value);
            }}
            popoverProps={{ appendTo: 'window' }}
          />
        </FormField>
      </Box>
      <Button
        size="tiny"
        skin="destructive"
        onClick={() => onRemove(rowIndex)}
      >
        Remove
      </Button>
    </Box>
  );
}

export const MappingRow = memo(MappingRowComponent);
