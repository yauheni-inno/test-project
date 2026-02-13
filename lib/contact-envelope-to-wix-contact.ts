/**
 * Maps Wix SDK contact event entity (Contact from ContactCreatedEnvelope / ContactUpdatedEnvelope)
 * to WixContactLike for sync-service. Handles both SDK-style (id, info.name.first) and
 * REST-style (_id, info.primaryInfo) field names from webhook payloads.
 *
 * Email: Wix primary email comes from primaryInfo.email (or info.email fallback). This single
 * primary email is synced to HubSpot's `email` (HubSpot's unique primary). Additional emails
 * on Wix (info.emails.items where primary=false) are not synced to HubSpot because
 * HubSpot's hs_additional_emails is read-only.
 */
import type { WixContactLike } from '@/lib/types';
import { extendedFieldsItemsToFlatRecord } from '@/lib/wix-extended-fields';

type WixExtendedValue = {
  stringValue?: string;
  numberValue?: number;
  boolValue?: boolean;
};

/** Entity shape from SDK event envelope (Contact) or raw webhook payload. */
export type ContactEntityLike = {
  _id?: string;
  id?: string;
  info?: {
    name?: { first?: string | null; last?: string | null };
    primaryInfo?: { email?: string | null; phone?: string | null };
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    notes?: string | null;
    extendedFields?: { items?: Record<string, WixExtendedValue> };
  };
  primaryInfo?: { email?: string | null; phone?: string | null };
};

/**
 * Maps event.entity from onContactCreated / onContactUpdated to WixContactLike.
 */
export function contactEntityToWixContactLike(entity: ContactEntityLike | null | undefined): WixContactLike | null {
  if (!entity) return null;
  const id = entity._id ?? entity.id;
  if (!id) return null;

  const info = entity.info ?? {};
  const primaryInfo = entity.primaryInfo ?? info.primaryInfo ?? {};
  const name = info.name ?? {};
  const extendedFlat = extendedFieldsItemsToFlatRecord(info.extendedFields?.items);

  const wixContact: WixContactLike = {
    _id: id,
    email: (primaryInfo.email ?? info.email) as string | undefined, // primary only; used for HubSpot sync
    phone: (primaryInfo.phone ?? info.phone) as string | undefined,
    firstName: (name.first ?? undefined) as string | undefined,
    lastName: (name.last ?? undefined) as string | undefined,
    company: (info.company ?? undefined) as string | undefined,
    jobTitle: (info.jobTitle ?? undefined) as string | undefined,
    notes: (info.notes ?? undefined) as string | undefined,
    ...extendedFlat,
  };

  return wixContact;
}
