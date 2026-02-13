// Field mapping data store
import { getWixClientForInstance } from '../wix-app-client';
import { COLLECTIONS } from '../constants';
import type { FieldMappingRecord } from '../types';

export async function getMappingsByInstanceId(
  instanceId: string,
): Promise<FieldMappingRecord[]> {
  const client = getWixClientForInstance(instanceId);
  const result = await client.items
    .query(COLLECTIONS.MAPPINGS)
    .eq('instanceId', instanceId)
    .find();

  return result.items as FieldMappingRecord[];
}

export async function upsertMappings(
  instanceId: string,
  mappings: Omit<FieldMappingRecord, '_id' | 'instanceId' | 'createdAt' | 'updatedAt'>[],
): Promise<FieldMappingRecord[]> {
  const client = getWixClientForInstance(instanceId);
  
  // Delete existing mappings for this instance
  const existing = await getMappingsByInstanceId(instanceId);
  for (const record of existing) {
    if (record._id) {
      await client.items.remove(COLLECTIONS.MAPPINGS, record._id);
    }
  }

  // Insert new mappings
  const nowIso = new Date().toISOString();
  const results: FieldMappingRecord[] = [];

  for (const mapping of mappings) {
    const record: FieldMappingRecord = {
      ...mapping,
      instanceId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const inserted = (await client.items.insert(
      COLLECTIONS.MAPPINGS,
      record,
    )) as FieldMappingRecord;
    results.push(inserted);
  }

  return results;
}

export async function deleteMappingsByInstanceId(
  instanceId: string,
): Promise<void> {
  const client = getWixClientForInstance(instanceId);
  const existing = await getMappingsByInstanceId(instanceId);
  for (const record of existing) {
    if (record._id) {
      await client.items.remove(COLLECTIONS.MAPPINGS, record._id);
    }
  }
}
