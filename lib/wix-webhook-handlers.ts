/**
 * Registers Wix SDK contact event handlers (onContactCreated, onContactUpdated, onContactDeleted).
 * Load this module for side effects so handlers are attached before webhooks are processed.
 * Do not import this from lib/wix-app-client to avoid circular dependency.
 */
import { wixAppClient } from "@/lib/wix-app-client";
import { syncFromWixToHubspot } from "@/lib/sync-service";
import { getConnectionByInstanceId } from "@/lib/stores/connection-store";
import {
  getLinkByWixContactId,
  deleteLinkByWixContactId,
} from "@/lib/stores/contact-link-store";
import { getHubspotClient } from "@/lib/hubspot/client";
import {
  contactEntityToWixContactLike,
  type ContactEntityLike,
} from "@/lib/contact-envelope-to-wix-contact";

async function handleContactEvent(event: {
  entity: ContactEntityLike;
  metadata: { instanceId?: string | null };
}) {
  const instanceId = event.metadata?.instanceId;
  if (!instanceId) return;

  const connection = await getConnectionByInstanceId(instanceId);
  if (!connection) return;

  const wixContact = contactEntityToWixContactLike(event.entity);
  if (!wixContact) return;

  await syncFromWixToHubspot({ instanceId, wixContact });
}

async function handleContactDeleted(event: {
  metadata: { instanceId?: string | null; entityId?: string };
}) {
  const instanceId = event.metadata?.instanceId;
  const wixContactId = event.metadata?.entityId;
  if (!instanceId || !wixContactId) return;

  const connection = await getConnectionByInstanceId(instanceId);
  if (!connection) return;

  const link = await getLinkByWixContactId(instanceId, wixContactId);
  if (link?.hubspotContactId) {
    try {
      const client = await getHubspotClient(instanceId);
      await client.deleteContact(link.hubspotContactId);
    } catch (e) {
      // deleteContact already ignores 404; any throw here is a real failure.
      console.error("Wix contact deleted: HubSpot delete failed", {
        instanceId,
        wixContactId,
        hubspotContactId: link.hubspotContactId,
        error: e,
      });
    }
  }
  await deleteLinkByWixContactId(instanceId, wixContactId);
}

wixAppClient.contacts.onContactCreated((event) => handleContactEvent(event));
wixAppClient.contacts.onContactUpdated((event) => handleContactEvent(event));
wixAppClient.contacts.onContactDeleted((event) => handleContactDeleted(event));
