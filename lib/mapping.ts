// Field mapping and transformation utilities
import type { MappingDirection, TransformId } from './types';

const TRANSFORMS: Record<TransformId, (v: string) => string> = {
  none: (v) => v,
  trim: (v) => (typeof v === 'string' ? v.trim() : String(v ?? '')),
  lowercase: (v) => (typeof v === 'string' ? v.toLowerCase() : String(v ?? '').toLowerCase()),
  uppercase: (v) => (typeof v === 'string' ? v.toUpperCase() : String(v ?? '').toUpperCase()),
};

export function applyTransform(transformId: string | undefined, value: unknown): string {
  const key = (transformId === undefined || transformId === '' ? 'none' : transformId) as TransformId;
  const fn = TRANSFORMS[key] ?? TRANSFORMS.none;
  return fn(value == null ? '' : String(value));
}

export interface FieldMappingRow {
  wixFieldKey: string;
  hubspotPropertyKey: string;
  direction: MappingDirection;
  transform?: string;
}

/**
 * Maps a Wix contact-like object to HubSpot properties using the given mappings.
 * Only includes directions: wix_to_hubspot, bi_directional.
 */
export function wixToHubspotProperties(
  wixContact: Record<string, unknown>,
  mappings: FieldMappingRow[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of mappings) {
    if (m.direction !== 'wix_to_hubspot' && m.direction !== 'bi_directional') continue;
    const raw = wixContact[m.wixFieldKey];
    const value = applyTransform(m.transform, raw);
    if (value !== undefined && value !== '') out[m.hubspotPropertyKey] = value;
  }
  return out;
}

/**
 * Extracts canonical Wix field key-value pairs from a Wix contact (for directions that include Wix).
 * Used for consistent hash computation in both sync directions so deduplication works across Wix→HubSpot and HubSpot→Wix.
 */
export function wixContactToCanonicalWixFields(
  wixContact: Record<string, unknown>,
  mappings: FieldMappingRow[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of mappings) {
    if (m.direction !== 'wix_to_hubspot' && m.direction !== 'bi_directional') continue;
    const raw = wixContact[m.wixFieldKey];
    const value = applyTransform(m.transform, raw);
    if (value !== undefined && value !== '') out[m.wixFieldKey] = value;
  }
  return out;
}

/**
 * Maps a HubSpot contact properties object to Wix contact-like fields.
 * Only includes directions: hubspot_to_wix, bi_directional.
 */
export function hubspotToWixFields(
  hubspotProperties: Record<string, unknown>,
  mappings: FieldMappingRow[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of mappings) {
    if (m.direction !== 'hubspot_to_wix' && m.direction !== 'bi_directional') continue;
    const raw = hubspotProperties[m.hubspotPropertyKey];
    const value = applyTransform(m.transform, raw);
    if (value !== undefined && value !== '') out[m.wixFieldKey] = value;
  }
  return out;
}

/**
 * Maps HubSpot properties to the same canonical Wix field key set as wixContactToCanonicalWixFields.
 * Uses only directions wix_to_hubspot and bi_directional so the hash computed in HubSpot→Wix matches
 * the hash computed in Wix→HubSpot (loop prevention).
 */
export function hubspotToCanonicalWixFieldsForHash(
  hubspotProperties: Record<string, unknown>,
  mappings: FieldMappingRow[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of mappings) {
    if (m.direction !== 'wix_to_hubspot' && m.direction !== 'bi_directional') continue;
    const raw = hubspotProperties[m.hubspotPropertyKey];
    const value = applyTransform(m.transform, raw);
    if (value !== undefined && value !== '') out[m.wixFieldKey] = value;
  }
  return out;
}

/**
 * Computes a stable hash of mapped values for idempotency and loop prevention.
 * Uses sorted JSON of mapped key-value pairs.
 */
export function hashMappedValues(values: Record<string, unknown>): string {
  const keys = Object.keys(values).sort();
  const obj: Record<string, unknown> = {};
  for (const k of keys) obj[k] = values[k];
  const str = JSON.stringify(obj);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = (h << 5) - h + c;
    h = h & h;
  }
  return String(h >>> 0);
}
