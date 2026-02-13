/**
 * Store for HubSpot webhook event IDs we have already processed.
 * Used to avoid processing duplicate or re-delivered events (idempotency).
 * See: HubSpot webhook best practices - store processed event IDs and check before processing.
 */
import { getWixClientForInstance } from '../wix-app-client';
import { COLLECTIONS } from '../constants';

const MAX_RECENT_PROCESSED = 1000;

export interface ProcessedWebhookEventRecord {
  _id?: string;
  eventId: string;
  processedAt: string;
}

/**
 * Returns the set of event IDs (from the given list) that have already been processed.
 * Collection is scoped per instance via the Wix client. Only checks recent records to keep the query bounded.
 */
export async function getProcessedEventIds(
  instanceId: string,
  eventIds: (string | number)[],
): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();
  const eventIdSet = new Set(eventIds.map((id) => String(id)));
  const client = getWixClientForInstance(instanceId);
  const result = await client.items
    .query(COLLECTIONS.PROCESSED_WEBHOOK_EVENTS)
    .limit(MAX_RECENT_PROCESSED)
    .find();

  const processed = new Set<string>();
  for (const item of (result.items ?? []) as ProcessedWebhookEventRecord[]) {
    if (item.eventId && eventIdSet.has(item.eventId)) {
      processed.add(String(item.eventId));
    }
  }
  return processed;
}

/**
 * Records the given event IDs as processed (call after successful sync/delete).
 * Collection is scoped per instance via the Wix client.
 */
export async function markEventIdsProcessed(
  instanceId: string,
  eventIds: (string | number)[],
): Promise<void> {
  if (eventIds.length === 0) return;
  const client = getWixClientForInstance(instanceId);
  const nowIso = new Date().toISOString();
  for (const eventId of eventIds) {
    const id = String(eventId);
    try {
      await client.items.insert(COLLECTIONS.PROCESSED_WEBHOOK_EVENTS, {
        eventId: id,
        processedAt: nowIso,
      });
    } catch (err) {
      // Duplicate or constraint error - already recorded, ignore
      if (err && typeof err === 'object' && 'code' in err) {
        // Wix may return duplicate key; treat as success
      }
    }
  }
}
