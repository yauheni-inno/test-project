// Contact link data store for tracking Wix <-> HubSpot contact relationships
import { getWixClientForInstance } from '../wix-app-client';
import { COLLECTIONS } from '../constants';
import type { ContactLinkRecord } from '../types';

export async function getLinkByWixContactId(
  instanceId: string,
  wixContactId: string,
): Promise<ContactLinkRecord | null> {
  const client = getWixClientForInstance(instanceId);
  const result = await client.items
    .query(COLLECTIONS.CONTACT_LINKS)
    .eq('instanceId', instanceId)
    .eq('wixContactId', wixContactId)
    .limit(1)
    .find();

  return (result.items[0] as ContactLinkRecord) ?? null;
}

export async function getLinkByHubspotContactId(
  instanceId: string,
  hubspotContactId: string,
): Promise<ContactLinkRecord | null> {
  const client = getWixClientForInstance(instanceId);
  const result = await client.items
    .query(COLLECTIONS.CONTACT_LINKS)
    .eq('instanceId', instanceId)
    .eq('hubspotContactId', hubspotContactId)
    .limit(1)
    .find();

  return (result.items[0] as ContactLinkRecord) ?? null;
}

export async function deleteLinkByHubspotContactId(
  instanceId: string,
  hubspotContactId: string,
): Promise<void> {
  const entry = await getLinkByHubspotContactId(instanceId, hubspotContactId);
  if (!entry?._id) return;
  const client = getWixClientForInstance(instanceId);
  await client.items.remove(COLLECTIONS.CONTACT_LINKS, entry._id);
}

export async function deleteLinkByWixContactId(
  instanceId: string,
  wixContactId: string,
): Promise<void> {
  const entry = await getLinkByWixContactId(instanceId, wixContactId);
  if (!entry?._id) return;
  const client = getWixClientForInstance(instanceId);
  await client.items.remove(COLLECTIONS.CONTACT_LINKS, entry._id);
}

export async function upsertContactLink(
  record: Omit<ContactLinkRecord, 'createdAt' | 'updatedAt'>,
): Promise<ContactLinkRecord> {
  const existing = await getLinkByWixContactId(record.instanceId, record.wixContactId);
  const nowIso = new Date().toISOString();
  const client = getWixClientForInstance(record.instanceId);

  if (existing?._id) {
    const updated: ContactLinkRecord = {
      ...existing,
      ...record,
      updatedAt: nowIso,
    };

    const saved = (await client.items.save(
      COLLECTIONS.CONTACT_LINKS,
      updated,
    )) as ContactLinkRecord;
    return saved;
  }

  const toInsert: ContactLinkRecord = {
    ...record,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const inserted = (await client.items.insert(
    COLLECTIONS.CONTACT_LINKS,
    toInsert,
  )) as ContactLinkRecord;
  return inserted;
}

export async function deleteContactLinksByInstanceId(instanceId: string): Promise<void> {
  const client = getWixClientForInstance(instanceId);
  const result = await client.items
    .query(COLLECTIONS.CONTACT_LINKS)
    .eq('instanceId', instanceId)
    .find();

  for (const entry of result.items as ContactLinkRecord[]) {
    if (entry._id) {
      await client.items.remove(COLLECTIONS.CONTACT_LINKS, entry._id);
    }
  }
}
