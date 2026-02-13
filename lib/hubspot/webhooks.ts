/**
 * HubSpot Webhooks v3 API client for managing app-level webhook settings and subscriptions.
 * Uses Developer API key (hapikey). See https://developers.hubspot.com/docs/api/webhooks
 */

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

export interface HubspotWebhookSettings {
  webhookUrl?: string;
  maxConcurrentRequests?: number;
}

export interface HubspotWebhookSubscription {
  id: number;
  createdAt?: number;
  createdBy?: number;
  eventType: string;
  propertyName?: string;
  active: boolean;
}

function getWebhookConfig(): { appId: string; hapikey: string } {
  const appId = process.env.HUBSPOT_APP_ID;
  const hapikey =
    process.env.HUBSPOT_DEVELOPER_API_KEY ?? process.env.HUBSPOT_HAPIKEY;
  if (!appId || !hapikey) {
    throw new Error(
      'Missing HubSpot webhook config. Set HUBSPOT_APP_ID and HUBSPOT_DEVELOPER_API_KEY (or HUBSPOT_HAPIKEY) in your environment.',
    );
  }
  return { appId, hapikey };
}

async function webhookRequest<T>(
  method: string,
  path: string,
  hapikey: string,
  body?: unknown,
): Promise<T> {
  const url = `${HUBSPOT_API_BASE}${path.startsWith('/') ? path : `/${path}`}?hapikey=${encodeURIComponent(hapikey)}`;
  const init: RequestInit = {
    method,
    headers: { Accept: 'application/json' },
  };
  if (body !== undefined) {
    (init.headers as Record<string, string>)['Content-Type'] =
      'application/json';
    init.body = JSON.stringify(body);
  }
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    console.error('HubSpot webhooks API failed', {
      method,
      path,
      status: response.status,
      body: text?.slice(0, 500),
    });
    throw new Error(`hubspot_webhooks_api_error_${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * GET webhooks/v3/{appId}/settings
 */
export async function getWebhookSettings(): Promise<HubspotWebhookSettings> {
  const { appId, hapikey } = getWebhookConfig();
  const data = (await webhookRequest<{
    webhookUrl?: string;
    maxConcurrentRequests?: number;
  }>(`GET`, `/webhooks/v3/${appId}/settings`, hapikey)) as
    | HubspotWebhookSettings
    | undefined;
  return data ?? {};
}

/**
 * PUT webhooks/v3/{appId}/settings
 * targetUrl must be HTTPS. Use this to set the URL that receives webhook payloads (e.g. include ?instanceId= for routing).
 */
export async function putWebhookSettings(input: {
  targetUrl: string;
  maxConcurrentRequests?: number;
}): Promise<void> {
  const { appId, hapikey } = getWebhookConfig();
  await webhookRequest(
    'PUT',
    `/webhooks/v3/${appId}/settings`,
    hapikey,
    {
      targetUrl: input.targetUrl,
      throttling: {
        maxConcurrentRequests:
          input.maxConcurrentRequests ?? 10,
      },
    },
  );
}

/**
 * GET webhooks/v3/{appId}/subscriptions
 */
export async function getWebhookSubscriptions(): Promise<
  HubspotWebhookSubscription[]
> {
  const { appId, hapikey } = getWebhookConfig();
  const data = await webhookRequest<HubspotWebhookSubscription[]>(
    'GET',
    `/webhooks/v3/${appId}/subscriptions`,
    hapikey,
  );
  return Array.isArray(data) ? data : [];
}

/**
 * POST webhooks/v3/{appId}/subscriptions
 * For contact.propertyChange, propertyName is required.
 */
export async function createWebhookSubscription(input: {
  eventType: string;
  propertyName?: string;
  active?: boolean;
}): Promise<HubspotWebhookSubscription> {
  const { appId, hapikey } = getWebhookConfig();
  const body: Record<string, unknown> = {
    eventType: input.eventType,
    active: input.active ?? true,
  };
  if (input.propertyName != null) body.propertyName = input.propertyName;
  return webhookRequest<HubspotWebhookSubscription>(
    'POST',
    `/webhooks/v3/${appId}/subscriptions`,
    hapikey,
    body,
  );
}

/**
 * DELETE webhooks/v3/{appId}/subscriptions/{subscriptionId}
 */
export async function deleteWebhookSubscription(
  subscriptionId: number,
): Promise<void> {
  const { appId, hapikey } = getWebhookConfig();
  await webhookRequest(
    'DELETE',
    `/webhooks/v3/${appId}/subscriptions/${subscriptionId}`,
    hapikey,
  );
}

const CONTACT_EVENT_PREFIX = 'contact.';

/**
 * Ensures HubSpot app webhook is configured for contact events:
 * - Updates target URL to baseWebhookUrl?instanceId={instanceId}
 * - Removes existing contact.creation, contact.deletion, contact.propertyChange subscriptions
 * - Creates contact.creation, contact.deletion, and one contact.propertyChange per mapped HubSpot property
 * Call this when mappings are saved so the webhook URL includes the current instance and we subscribe to each mapped property.
 */
export async function ensureContactWebhookSubscriptions(
  instanceId: string,
  baseWebhookUrl: string,
  hubspotPropertyKeys: string[],
): Promise<void> {
  const url = new URL(baseWebhookUrl);
  url.searchParams.set('instanceId', instanceId);
  const targetUrl = url.toString();

  await putWebhookSettings({
    targetUrl,
    maxConcurrentRequests: 10,
  });

  const existing = await getWebhookSubscriptions();
  const contactSubs = existing.filter(
    (s) =>
      s.eventType?.startsWith(CONTACT_EVENT_PREFIX) ?? false,
  );
  for (const sub of contactSubs) {
    await deleteWebhookSubscription(sub.id);
  }

  await createWebhookSubscription({
    eventType: 'contact.creation',
    active: true,
  });
  await createWebhookSubscription({
    eventType: 'contact.deletion',
    active: true,
  });

  const uniqueProps = [...new Set(hubspotPropertyKeys)].filter(Boolean);
  for (const propertyName of uniqueProps) {
    await createWebhookSubscription({
      eventType: 'contact.propertyChange',
      propertyName,
      active: true,
    });
  }
}
