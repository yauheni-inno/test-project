// HubSpot connection data store
import { getWixClientForInstance } from '../wix-app-client';
import { COLLECTIONS } from '../constants';
import type { HubspotConnectionRecord } from '../types';

export async function getConnectionByInstanceId(
  instanceId: string,
): Promise<HubspotConnectionRecord | null> {
  const client = getWixClientForInstance(instanceId);
  const result = await client.items
    .query(COLLECTIONS.CONNECTIONS)
    .eq('instanceId', instanceId)
    .limit(1)
    .find();

  return (result.items[0] as HubspotConnectionRecord) ?? null;
}

export async function upsertConnection(
  record: HubspotConnectionRecord,
): Promise<HubspotConnectionRecord> {
  const existing = await getConnectionByInstanceId(record.instanceId);
  const nowIso = new Date().toISOString();
  const client = getWixClientForInstance(record.instanceId);

  if (existing?._id) {
    const updated: HubspotConnectionRecord = {
      ...existing,
      ...record,
      updatedAt: nowIso,
    };

    const saved = (await client.items.save(
      COLLECTIONS.CONNECTIONS,
      updated,
    )) as HubspotConnectionRecord;
    return saved;
  }

  const toInsert: HubspotConnectionRecord = {
    ...record,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const inserted = (await client.items.insert(
    COLLECTIONS.CONNECTIONS,
    toInsert,
  )) as HubspotConnectionRecord;
  return inserted;
}

export async function deleteConnectionByInstanceId(
  instanceId: string,
): Promise<void> {
  const existing = await getConnectionByInstanceId(instanceId);
  if (!existing?._id) {
    return;
  }

  const client = getWixClientForInstance(instanceId);
  await client.items.remove(COLLECTIONS.CONNECTIONS, existing._id);
}
