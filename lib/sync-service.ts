// Bi-directional contact sync service with loop prevention
import { getWixClientForInstance } from './wix-app-client';
import { getHubspotClient } from './hubspot/client';
import { getMappingsByInstanceId } from './stores/mapping-store';
import {
  getLinkByWixContactId,
  getLinkByHubspotContactId,
  upsertContactLink,
} from './stores/contact-link-store';
import {
  wixToHubspotProperties,
  wixContactToCanonicalWixFields,
  hubspotToWixFields,
  hubspotToCanonicalWixFieldsForHash,
  hashMappedValues,
  type FieldMappingRow,
} from './mapping';
import { DEDUPE_WINDOW_MS } from './constants';
import type { WixContactLike, SyncSource } from './types';
import { isExtendedFieldKey, stringToExtendedValue } from './wix-extended-fields';

export interface SyncFromWixInput {
  instanceId: string;
  wixContact: WixContactLike;
}

export interface SyncFromHubspotInput {
  instanceId: string;
  hubspotContactId: string;
  /** Webhook may send only changed properties; full contact is fetched for hash-based loop prevention. */
  hubspotPropertiesFromWebhook?: Record<string, unknown>;
  lastModifiedDate?: string;
}

/**
 * Syncs a Wix contact to HubSpot. Creates or updates the HubSpot contact and the link record.
 * Skips if hash matches and within dedupe window (idempotency). Writes origin properties to HubSpot.
 */
export async function syncFromWixToHubspot(input: SyncFromWixInput): Promise<void> {
  const { instanceId, wixContact } = input;
  const wixContactId = wixContact._id as string;
  if (!wixContactId) {
    console.warn('syncFromWixToHubspot: missing wixContact._id');
    return;
  }

  const [mappings, linkRecord, client] = await Promise.all([
    getMappingsByInstanceId(instanceId),
    getLinkByWixContactId(instanceId, wixContactId),
    getHubspotClient(instanceId),
  ]);

  const mappingRows: FieldMappingRow[] = mappings.map((m) => ({
    wixFieldKey: m.wixFieldKey,
    hubspotPropertyKey: m.hubspotPropertyKey,
    direction: m.direction,
    transform: m.transform,
  }));

  const properties = wixToHubspotProperties(wixContact as Record<string, unknown>, mappingRows);
  // Use canonical Wix field keys for hash so it matches the hash computed in syncFromHubspotToWix (same key space).
  const canonicalWixFields = wixContactToCanonicalWixFields(wixContact as Record<string, unknown>, mappingRows);
  const hash = hashMappedValues(canonicalWixFields);
  const now = new Date().toISOString();

  if (
    linkRecord?.lastSyncHash === hash &&
    linkRecord?.lastSyncSource === 'wix' &&
    linkRecord?.lastSyncAt
  ) {
    const lastSyncMs = new Date(linkRecord.lastSyncAt).getTime();
    if (Date.now() - lastSyncMs < DEDUPE_WINDOW_MS) {
      return;
    }
  }

  // Only write mapped business properties to HubSpot (no sync metadata; loop prevention is hash-based).
  const hubspotProperties: Record<string, string> = { ...properties };

  let hubspotContactId: string;
  if (linkRecord?.hubspotContactId) {
    await client.createOrUpdateContact({
      id: linkRecord.hubspotContactId,
      properties: hubspotProperties,
    });
    hubspotContactId = linkRecord.hubspotContactId;
  } else {
    // HubSpot uses a single primary email (unique); we use Wix primary (primaryInfo.email) only
    const email = (wixContact.email as string) || (properties.email as string);
    const existing = email ? await client.getContactByEmail(email) : null;
    if (existing) {
      await client.createOrUpdateContact({
        id: existing.id,
        properties: hubspotProperties,
      });
      hubspotContactId = existing.id;
    } else {
      const created = await client.createOrUpdateContact({
        email: email || undefined,
        properties: hubspotProperties,
      });
      hubspotContactId = created.id;
    }
  }

  await upsertContactLink({
    instanceId,
    wixContactId,
    hubspotContactId,
    lastSyncSource: 'wix' as SyncSource,
    lastSyncAt: now,
    lastSyncHash: hash,
  });
}

/**
 * Syncs a HubSpot contact change to Wix. Updates the Wix contact via elevated CRM if a link exists.
 * Loop prevention is hash-based: we fetch the full HubSpot contact (mapped properties), compute the same
 * canonical Wix-field hash as in Wix→HubSpot; if it matches lastSyncHash and lastSyncSource was 'wix', we skip.
 */
export async function syncFromHubspotToWix(input: SyncFromHubspotInput): Promise<void> {
  const { instanceId, hubspotContactId, lastModifiedDate } = input;

  const linkRecord = await getLinkByHubspotContactId(instanceId, hubspotContactId);

  const [mappings, client] = await Promise.all([
    getMappingsByInstanceId(instanceId),
    getHubspotClient(instanceId),
  ]);
  const mappingRows: FieldMappingRow[] = mappings.map((m) => ({
    wixFieldKey: m.wixFieldKey,
    hubspotPropertyKey: m.hubspotPropertyKey,
    direction: m.direction,
    transform: m.transform,
  }));

  const hubspotPropertyNames = [...new Set(mappingRows.map((r) => r.hubspotPropertyKey))];
  const fullContact = await client.getContactById(hubspotContactId, hubspotPropertyNames);
  if (!fullContact?.properties) {
    return;
  }
  const hubspotProperties = fullContact.properties as Record<string, unknown>;
  const canonicalWixFields = hubspotToCanonicalWixFieldsForHash(hubspotProperties, mappingRows);
  const hash = hashMappedValues(canonicalWixFields);
  const now = new Date().toISOString();
  const wixFields = hubspotToWixFields(hubspotProperties, mappingRows);

  if (!linkRecord) {
    // New HubSpot contact: create Wix contact and link.
    const info = mergeWixFieldsIntoContactInfo({}, wixFields);
    const hasName = (info.name as Record<string, unknown>) && ((info.name as Record<string, unknown>).first != null || (info.name as Record<string, unknown>).last != null);
    const hasEmail = (info.emails as { items?: Array<{ email?: string }> })?.items?.some((i) => i.email);
    const hasPhone = (info.phones as { items?: Array<{ phone?: string }> })?.items?.some((i) => i.phone);
    if (!hasName && !hasEmail && !hasPhone) {
      (info as Record<string, unknown>).name = { first: 'Contact', last: '' };
    }
    try {
      const wixClient = getWixClientForInstance(instanceId);
      const created = await wixClient.contacts.createContact(
        info as Parameters<typeof wixClient.contacts.createContact>[0],
        { allowDuplicates: false },
      );
      const wixContactId = created.contact?._id;
      if (wixContactId) {
        await upsertContactLink({
          instanceId,
          wixContactId,
          hubspotContactId,
          lastSyncSource: 'hubspot' as SyncSource,
          lastSyncAt: now,
          lastSyncHash: hash,
        });
      }
    } catch (e) {
      console.error('syncFromHubspotToWix: Wix contact create failed', {
        instanceId,
        hubspotContactId,
        error: e,
      });
    }
    void lastModifiedDate;
    return;
  }

  if (linkRecord.lastSyncHash === hash && linkRecord.lastSyncSource === 'wix') {
    const lastSyncMs = linkRecord.lastSyncAt ? new Date(linkRecord.lastSyncAt).getTime() : 0;
    if (Date.now() - lastSyncMs < DEDUPE_WINDOW_MS) {
      return;
    }
  }
  if (linkRecord.lastSyncHash === hash && linkRecord.lastSyncSource === 'hubspot') {
    const lastSyncMs = linkRecord.lastSyncAt ? new Date(linkRecord.lastSyncAt).getTime() : 0;
    if (Date.now() - lastSyncMs < DEDUPE_WINDOW_MS) {
      return;
    }
  }

  try {
    const wixClient = getWixClientForInstance(instanceId);
    const contact = await wixClient.contacts.getContact(linkRecord.wixContactId);
    if (contact?.revision != null) {
      const existingInfo = contact.info ?? {};
      const mergedInfo = mergeWixFieldsIntoContactInfo(existingInfo as Record<string, unknown>, wixFields);
      await wixClient.contacts.updateContact(
        linkRecord.wixContactId,
        mergedInfo as Parameters<typeof wixClient.contacts.updateContact>[1],
        contact.revision!,
        { allowDuplicates: false },
      );
    }
  } catch (e) {
    console.error('syncFromHubspotToWix: Wix contact update failed', {
      instanceId,
      wixContactId: linkRecord.wixContactId,
      error: e,
    });
  }

  await upsertContactLink({
    ...linkRecord,
    lastSyncSource: 'hubspot' as SyncSource,
    lastSyncAt: now,
    lastSyncHash: hash,
  });
  void lastModifiedDate;
}

/**
 * Merges flat wixFields (email, firstName, lastName, phone, company, extended custom fields) into existing ContactInfo.
 * Preserves existing emails/phones; updates or adds the synced value and sets it primary.
 * Extended field keys (e.g. custom.nickname) are merged into info.extendedFields.items.
 */
function mergeWixFieldsIntoContactInfo(
  existing: Record<string, unknown>,
  wixFields: Record<string, string>,
): Record<string, unknown> {
  const name = (existing.name as Record<string, unknown>) ?? {};
  const first = wixFields.firstName ?? (name.first as string);
  const last = wixFields.lastName ?? (name.last as string);
  const company = wixFields.company ?? (existing.company as string);
  const jobTitle = wixFields.jobTitle ?? (existing.jobTitle as string);

  const info: Record<string, unknown> = {
    ...existing,
    name: (first != null || last != null) ? { ...name, first: first ?? name.first, last: last ?? name.last } : existing.name,
    company: company ?? existing.company,
    jobTitle: jobTitle ?? existing.jobTitle,
  };

  if (wixFields.email != null && wixFields.email !== '') {
    info.emails = {
      items: mergePrimaryEmail(
        (existing.emails as { items?: Array<Record<string, unknown>> })?.items ?? [],
        wixFields.email,
      ),
    };
  }
  if (wixFields.phone != null && wixFields.phone !== '') {
    info.phones = {
      items: mergePrimaryPhone(
        (existing.phones as { items?: Array<Record<string, unknown>> })?.items ?? [],
        wixFields.phone,
      ),
    };
  }

  // Merge extended custom fields (e.g. custom.nickname) into info.extendedFields.items
  const extendedItems = (existing.extendedFields as { items?: Record<string, unknown> } | undefined)?.items ?? {};
  const newExtended: Record<string, unknown> = { ...extendedItems };
  for (const [key, value] of Object.entries(wixFields)) {
    if (isExtendedFieldKey(key) && value !== undefined && value !== '') {
      newExtended[key] = stringToExtendedValue(value);
    }
  }
  if (Object.keys(newExtended).length > 0) {
    info.extendedFields = { items: newExtended };
  }

  return info;
}

/** Updates or adds email as primary; keeps other emails with primary: false. Only one item is primary. */
function mergePrimaryEmail(
  existingItems: Array<Record<string, unknown>>,
  email: string,
): Array<Record<string, unknown>> {
  const normalized = email.trim().toLowerCase();
  let found = false;
  let primaryAssigned = false;
  const items: Array<Record<string, unknown>> = existingItems.map((item) => {
    const itemEmail = String(item.email ?? '').trim().toLowerCase();
    const isMatch = itemEmail === normalized;
    if (isMatch) found = true;
    const isPrimary = isMatch && !primaryAssigned;
    if (isPrimary) primaryAssigned = true;
    return { ...item, email: isMatch ? email : item.email, primary: isPrimary };
  });
  if (!found) {
    items.unshift({ tag: 'UNTAGGED', email, primary: true });
    items.forEach((it, i) => {
      if (i > 0) it.primary = false;
    });
  }
  return items;
}

/** Updates or adds phone as primary; keeps other phones with primary: false. Only one item is primary. */
function mergePrimaryPhone(
  existingItems: Array<Record<string, unknown>>,
  phone: string,
): Array<Record<string, unknown>> {
  const normalizedPhone = phone.trim();
  let found = false;
  let primaryAssigned = false;
  const items: Array<Record<string, unknown>> = existingItems.map((item) => {
    const itemPhone = String(item.phone ?? '').trim();
    const isMatch = itemPhone === normalizedPhone;
    if (isMatch) found = true;
    const isPrimary = isMatch && !primaryAssigned;
    if (isPrimary) primaryAssigned = true;
    return { ...item, phone: isMatch ? phone : item.phone, primary: isPrimary };
  });
  if (!found) {
    items.unshift({ tag: 'UNTAGGED', phone, primary: true });
    items.forEach((it, i) => {
      if (i > 0) it.primary = false;
    });
  }
  return items;
}
