// Core type definitions for the Wix-HubSpot integration

export type MappingDirection = 'wix_to_hubspot' | 'hubspot_to_wix' | 'bi_directional';
export type TransformId = 'none' | 'trim' | 'lowercase' | 'uppercase';
export type SyncSource = 'wix' | 'hubspot';

export interface HubspotConnectionRecord {
  _id?: string;
  instanceId: string;
  siteId?: string;
  portalId?: string;
  tokensSecretName: string;
  expiresAt?: string;
  scopes?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface FieldMappingRecord {
  _id?: string;
  instanceId: string;
  wixFieldKey: string;
  hubspotPropertyKey: string;
  direction: MappingDirection;
  transform: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ContactLinkRecord {
  _id?: string;
  instanceId: string;
  wixContactId: string;
  hubspotContactId: string;
  lastSyncSource: SyncSource;
  lastSyncAt: string;
  lastSyncHash?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface HubspotTokenBundle {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface HubspotContact {
  id: string;
  properties: Record<string, unknown>;
}

export interface HubspotProperty {
  name: string;
  label?: string;
  type?: string;
}

export interface WixContactLike {
  _id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  notes?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  pageUrl?: string;
  referrer?: string;
  timestamp?: string;
  [key: string]: unknown;
}
