import crypto from 'node:crypto';

const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

/**
 * Optional HubSpot v3 webhook signature verification.
 * Enabled when HUBSPOT_WEBHOOK_SECRET is configured.
 */
export function verifyHubspotWebhookSignature(input: {
  method: string;
  url: string;
  body: string;
  signatureV3: string | null;
  requestTimestamp: string | null;
}): boolean {
  const secret = process.env.HUBSPOT_WEBHOOK_SECRET;
  if (!secret) {
    return true;
  }

  const { method, url, body, signatureV3, requestTimestamp } = input;
  if (!signatureV3 || !requestTimestamp) {
    return false;
  }

  const tsMs = Number(requestTimestamp);
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > MAX_TIMESTAMP_SKEW_MS) {
    return false;
  }

  const source = `${method}${url}${body}${requestTimestamp}`;
  const digest = crypto.createHmac('sha256', secret).update(source, 'utf8').digest('base64');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signatureV3));
}
