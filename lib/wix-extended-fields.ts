/**
 * Helpers for Wix contact extended fields (custom namespace).
 * Extended field data lives at info.extendedFields.items (Map<key, Value>).
 * We use the same key (e.g. "custom.nickname") in mappings and hashing.
 */

/** Wix extended field Value type (stringValue, numberValue, etc.). */
type WixExtendedValue = {
  stringValue?: string;
  numberValue?: number;
  boolValue?: boolean;
  nullValue?: unknown;
  listValue?: { values?: WixExtendedValue[] };
  structValue?: Record<string, unknown>;
};

/** Flatten info.extendedFields.items into a record of key -> string for mapping/hashing. */
export function extendedFieldsItemsToFlatRecord(
  items: Record<string, WixExtendedValue> | undefined
): Record<string, string> {
  if (!items || typeof items !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(items)) {
    const s = extendedValueToString(val);
    if (s !== undefined && s !== '') out[key] = s;
  }
  return out;
}

function extendedValueToString(v: WixExtendedValue | undefined): string | undefined {
  if (v == null) return undefined;
  if (typeof v.stringValue === 'string') return v.stringValue;
  if (typeof v.numberValue === 'number') return String(v.numberValue);
  if (typeof v.boolValue === 'boolean') return String(v.boolValue);
  if (v.nullValue !== undefined) return undefined;
  if (v.listValue?.values?.length) return v.listValue.values.map(extendedValueToString).filter(Boolean).join(',');
  return undefined;
}

/** Keys that belong to extended fields (e.g. custom.nickname). Used when merging back into contact info. */
export function isExtendedFieldKey(key: string): boolean {
  return key.startsWith('custom.');
}

/** Build Wix extended field Value for update (we sync as string). */
export function stringToExtendedValue(s: string): WixExtendedValue {
  return { stringValue: s };
}
