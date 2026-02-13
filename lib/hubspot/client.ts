// HubSpot API client with token management
import { getWixClientForInstance, getSecretsClient } from '../wix-app-client';
import { getHubspotAppConfigFromSecrets } from './config';
import { readTokenSecrets, writeTokenSecrets } from './token-secrets';
import { getConnectionByInstanceId, upsertConnection } from '../stores/connection-store';
import type { HubspotConnectionRecord, HubspotTokenBundle, HubspotContact, HubspotProperty } from '../types';

export interface HubspotClient {
  getAccessToken(): string;
  getContactById(id: string, properties?: string[]): Promise<HubspotContact | null>;
  getContactByEmail(email: string, properties?: string[]): Promise<HubspotContact | null>;
  createOrUpdateContact(input: {
    id?: string;
    email?: string;
    properties: Record<string, string | number>;
  }): Promise<HubspotContact>;
  deleteContact(id: string): Promise<void>;
  listContactProperties(): Promise<HubspotProperty[]>;
}

async function loadTokenBundle(instanceId: string, tokensSecretName: string): Promise<HubspotTokenBundle> {
  const wixClient = getWixClientForInstance(instanceId);
  return readTokenSecrets(getSecretsClient(wixClient), tokensSecretName);
}

async function saveTokenBundle(
  instanceId: string,
  connection: HubspotConnectionRecord,
  bundle: HubspotTokenBundle,
): Promise<void> {
  if (!connection.tokensSecretName) {
    throw new Error('Connection record missing tokensSecretName');
  }

  const wixClient = getWixClientForInstance(instanceId);
  await writeTokenSecrets(getSecretsClient(wixClient), connection.tokensSecretName, bundle);

  await upsertConnection({
    ...connection,
    expiresAt: bundle.expiresAt,
  });
}

async function refreshAccessToken(
  connection: HubspotConnectionRecord,
  bundle: HubspotTokenBundle,
): Promise<HubspotTokenBundle> {
  const wixClient = getWixClientForInstance(connection.instanceId);
  const { clientId, clientSecret } = await getHubspotAppConfigFromSecrets(getSecretsClient(wixClient));

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: bundle.refreshToken,
  });

  const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('HubSpot token refresh failed', response.status, text);
    throw new Error('hubspot_token_refresh_failed');
  }

  const json = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const updated: HubspotTokenBundle = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? bundle.refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };

  await saveTokenBundle(connection.instanceId, connection, updated);

  return updated;
}

async function getFreshTokenBundle(
  connection: HubspotConnectionRecord,
): Promise<HubspotTokenBundle> {
  if (!connection.tokensSecretName) {
    throw new Error('HubSpot connection is not fully configured for this instance.');
  }

  const bundle = await loadTokenBundle(connection.instanceId, connection.tokensSecretName);

  const expiryMs = new Date(bundle.expiresAt).getTime();
  const now = Date.now();
  const skewMs = 5 * 60 * 1000; // 5 minutes

  if (Number.isNaN(expiryMs) || expiryMs - now <= skewMs) {
    // Token is expired or near expiry; refresh it.
    return refreshAccessToken(connection, bundle);
  }

  return bundle;
}

async function hubspotRequest<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = path.startsWith('http')
    ? path
    : `https://api.hubapi.com${path.startsWith('/') ? '' : '/'}${path}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${accessToken}`,
  };

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    // Important: never log raw access tokens. We only log status and body.
    console.error('HubSpot API request failed', {
      url,
      status: response.status,
      body: text?.slice(0, 1000),
    });
    throw new Error(`hubspot_api_error_${response.status}`);
  }

  // Some endpoints may return 204 No Content.
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function getHubspotClient(instanceId: string): Promise<HubspotClient> {
  const connection = await getConnectionByInstanceId(instanceId);
  if (!connection) {
    throw new Error('HubSpot is not connected for this Wix app instance.');
  }

  const bundle = await getFreshTokenBundle(connection);
  const accessToken = bundle.accessToken;

  return {
    getAccessToken(): string {
      // Expose for internal use only (never to the browser).
      return accessToken;
    },

    async getContactById(id: string, properties?: string[]): Promise<HubspotContact | null> {
      const qs = new URLSearchParams();
      if (properties?.length) {
        for (const p of properties) {
          qs.append('properties', p);
        }
      }

      const data = await hubspotRequest<{ id: string; properties?: Record<string, unknown> }>(
        accessToken,
        `/crm/v3/objects/contacts/${encodeURIComponent(id)}?${qs.toString()}`,
      );

      if (!data) {
        return null;
      }

      return {
        id: data.id,
        properties: data.properties ?? {},
      };
    },

    async getContactByEmail(email: string, properties?: string[]): Promise<HubspotContact | null> {
      const body = {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'email',
                operator: 'EQ',
                value: email,
              },
            ],
          },
        ],
        properties,
        limit: 1,
      };

      const data = await hubspotRequest<{ results?: Array<{ id: string; properties?: Record<string, unknown> }> }>(
        accessToken,
        '/crm/v3/objects/contacts/search',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );

      const first = data?.results?.[0];
      if (!first) {
        return null;
      }

      return {
        id: first.id,
        properties: first.properties ?? {},
      };
    },

    async createOrUpdateContact(input: {
      id?: string;
      email?: string;
      properties: Record<string, string | number>;
    }): Promise<HubspotContact> {
      const { id, email, properties } = input;

      if (id) {
        const data = await hubspotRequest<{ id: string; properties?: Record<string, unknown> }>(
          accessToken,
          `/crm/v3/objects/contacts/${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({ properties }),
          },
        );

        return {
          id: data.id,
          properties: data.properties ?? {},
        };
      }

      const propertiesCopy = { ...properties };
      if (email && !propertiesCopy.email) {
        propertiesCopy.email = email;
      }
      const payload = { properties: propertiesCopy };

      const data = await hubspotRequest<{ id: string; properties?: Record<string, unknown> }>(
        accessToken,
        '/crm/v3/objects/contacts',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      return {
        id: data.id,
        properties: data.properties ?? {},
      };
    },

    async deleteContact(id: string): Promise<void> {
      try {
        await hubspotRequest(
          accessToken,
          `/crm/v3/objects/contacts/${encodeURIComponent(id)}`,
          { method: 'DELETE' },
        );
      } catch (e) {
        // Contact already deleted or not found in HubSpot — ignore.
        if (e instanceof Error && e.message === 'hubspot_api_error_404') return;
        throw e;
      }
    },

    async listContactProperties(): Promise<HubspotProperty[]> {
      const data = await hubspotRequest<{ results?: Array<{ name: string; label?: string; type?: string }> }>(
        accessToken,
        '/crm/v3/properties/contacts',
      );

      const results: HubspotProperty[] = (data?.results ?? []).map((p) => ({
        name: p.name,
        label: p.label,
        type: p.type,
      }));

      return results;
    },
  };
}
