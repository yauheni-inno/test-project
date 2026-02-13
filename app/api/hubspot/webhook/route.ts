// HubSpot webhook handler for contact updates (HubSpot → Wix sync)
import { NextResponse } from "next/server";
import { syncFromHubspotToWix } from "@/lib/sync-service";
import { verifyHubspotWebhookSignature } from "@/lib/hubspot/webhook-signature";
import { requireInstanceIdFromRequest } from "@/lib/wix-instance";
import {
  getLinkByHubspotContactId,
  deleteLinkByHubspotContactId,
} from "@/lib/stores/contact-link-store";
import { getWixClientForInstance } from "@/lib/wix-app-client";
import {
  getProcessedEventIds,
  markEventIdsProcessed,
} from "@/lib/stores/processed-webhook-events-store";

type HubspotWebhookEvent = {
  eventId?: number | string;
  subscriptionType?: string;
  eventType?: string;
  objectId?: number | string;
  objectTypeId?: string;
  propertyName?: string;
  propertyValue?: unknown;
  properties?: Record<string, unknown>;
  occurredAt?: string | number;
  portalId?: number | string;
};

const CONTACT_OBJECT_TYPE_ID = "0-1";

function isContactEvent(event: HubspotWebhookEvent): boolean {
  const type = event.subscriptionType ?? event.eventType ?? "";
  if (type.startsWith("contact.")) return true;
  if (type.startsWith("object.") && event.objectTypeId === CONTACT_OBJECT_TYPE_ID) return true;
  return false;
}

function isDeletionEvent(event: HubspotWebhookEvent): boolean {
  const type = event.subscriptionType ?? event.eventType ?? "";
  return type === "contact.deletion" || type === "object.deletion";
}

function isCreationOrPropertyChangeEvent(event: HubspotWebhookEvent): boolean {
  const type = event.subscriptionType ?? event.eventType ?? "";
  return (
    type === "contact.creation" ||
    type === "contact.propertyChange" ||
    type === "object.creation" ||
    type === "object.propertyChange"
  );
}

export async function POST(request: Request) {
  try {
    const instanceId = await requireInstanceIdFromRequest(request);
    const rawBody = await request.text();
    const isValidSignature = verifyHubspotWebhookSignature({
      method: request.method,
      url: request.url,
      body: rawBody,
      signatureV3: request.headers.get("x-hubspot-signature-v3"),
      requestTimestamp: request.headers.get("x-hubspot-request-timestamp"),
    });

    if (!isValidSignature) {
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 },
      );
    }

    const events = JSON.parse(rawBody) as HubspotWebhookEvent[];

    if (!Array.isArray(events)) {
      return NextResponse.json(
        { error: "Invalid webhook payload" },
        { status: 400 },
      );
    }

    const contactEvents = events.filter(isContactEvent);
    const eventIds = contactEvents
      .map((e) => e.eventId)
      .filter((id): id is number | string => id !== undefined && id !== null);
    const processedIds = await getProcessedEventIds(instanceId, eventIds);
    const newEvents = contactEvents.filter(
      (e) => e.eventId == null || !processedIds.has(String(e.eventId)),
    );

    if (newEvents.length === 0) {
      return NextResponse.json({ success: true });
    }

    const byObjectId = new Map<
      string,
      {
        deletion: boolean;
        properties: Record<string, unknown>;
        occurredAt?: string;
        eventIds: string[];
      }
    >();

    for (const event of newEvents) {
      const objectId = event.objectId?.toString();
      if (!objectId) continue;
      const eventIdStr = event.eventId != null ? String(event.eventId) : null;

      if (isDeletionEvent(event)) {
        byObjectId.set(objectId, {
          deletion: true,
          properties: {},
          eventIds: eventIdStr ? [eventIdStr] : [],
        });
        continue;
      }

      if (!isCreationOrPropertyChangeEvent(event)) continue;

      const existing = byObjectId.get(objectId);
      if (existing?.deletion) continue;

      const properties: Record<string, unknown> = {
        ...(existing?.properties ?? {}),
        ...(event.properties ?? {}),
      };
      if (event.propertyName != null && event.propertyValue !== undefined) {
        properties[event.propertyName] = event.propertyValue;
      }

      const occurredAt =
        typeof event.occurredAt === "number"
          ? String(event.occurredAt)
          : event.occurredAt ?? existing?.occurredAt;

      const eventIdsForGroup = existing?.eventIds ?? [];
      if (eventIdStr) eventIdsForGroup.push(eventIdStr);

      byObjectId.set(objectId, {
        deletion: false,
        properties,
        occurredAt,
        eventIds: eventIdsForGroup,
      });
    }

    for (const [objectId, payload] of byObjectId) {
      if (payload.deletion) {
        const link = await getLinkByHubspotContactId(instanceId, objectId);
        if (link?.wixContactId) {
          try {
            const wixClient = getWixClientForInstance(instanceId);
            await wixClient.contacts.deleteContact(link.wixContactId);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const isNotFound =
              msg.includes('NOT_FOUND') ||
              msg.includes('not found') ||
              msg.includes('404') ||
              msg.includes('not_found');
            if (!isNotFound) {
              console.error("Webhook: Wix contact delete failed", {
                instanceId,
                wixContactId: link.wixContactId,
                hubspotContactId: objectId,
                error: e,
              });
            }
          }
        }
        await deleteLinkByHubspotContactId(instanceId, objectId);
        if (payload.eventIds.length > 0) {
          await markEventIdsProcessed(instanceId, payload.eventIds);
        }
        continue;
      }
      await syncFromHubspotToWix({
        instanceId,
        hubspotContactId: objectId,
        hubspotPropertiesFromWebhook: payload.properties,
        lastModifiedDate: payload.occurredAt,
      });
      if (payload.eventIds.length > 0) {
        await markEventIdsProcessed(instanceId, payload.eventIds);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook processing failed:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 },
    );
  }
}
