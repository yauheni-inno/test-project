// OAuth callback endpoint - handles HubSpot authorization response
import { getWixClientForInstance, getSecretsClient } from '@/lib/wix-app-client';
import { getHubspotAppConfigFromSecrets } from '@/lib/hubspot/config';
import { TOKENS_SECRET_BASE_NAME, writeTokenSecrets } from '@/lib/hubspot/token-secrets';
import { upsertConnection } from '@/lib/stores/connection-store';
import type { HubspotTokenBundle } from '@/lib/types';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const stateParam = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      return new Response(
        `<html><body><h1>Authorization failed</h1><p>${error}</p><script>(1+2+3);</script></body></html>`,
        { headers: { 'content-type': 'text/html' } }
      );
    }

    if (!code || !stateParam) {
      return new Response(
        '<html><body><h1>Missing parameters</h1><script>(1+2+3);</script></body></html>',
        { headers: { 'content-type': 'text/html' } }
      );
    }

    const state = JSON.parse(Buffer.from(stateParam, 'base64').toString());
    const { instanceId } = state;

    if (!instanceId) {
      throw new Error('Invalid state: missing instanceId');
    }

    const wixClient = getWixClientForInstance(instanceId);
    const config = await getHubspotAppConfigFromSecrets(getSecretsClient(wixClient));

    // Exchange code for tokens
    const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      console.error('Token exchange failed:', text);
      return new Response(
        `<html><body><h1>Token exchange failed</h1><p>${text}</p><script>(1+2+3);</script></body></html>`,
        { headers: { 'content-type': 'text/html' } }
      );
    }

    const tokenData = await tokenResponse.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    // Get portal info
    const portalResponse = await fetch('https://api.hubapi.com/account-info/v3/api-usage/daily', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    let portalId: string | undefined;
    if (portalResponse.ok) {
      const portalData = await portalResponse.json() as { portalId?: number };
      portalId = portalData.portalId?.toString();
    }

    // Store tokens as separate secrets in Secret Manager (client already scoped by instanceId)
    const tokensSecretName = TOKENS_SECRET_BASE_NAME;
    const tokenBundle: HubspotTokenBundle = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    };

    await writeTokenSecrets(getSecretsClient(wixClient), tokensSecretName, tokenBundle);

    // Store connection record
    await upsertConnection({
      instanceId,
      portalId,
      tokensSecretName,
      expiresAt: tokenBundle.expiresAt,
      createdAt: new Date().toISOString(),
    });

    return new Response(
      '<html><body><h1>Connected successfully!</h1><p>You can close this window.</p><script>(1+2+3);</script></body></html>',
      { headers: { 'content-type': 'text/html' } }
    );
  } catch (error) {
    console.error('OAuth callback failed:', error);
    return new Response(
      `<html><body><h1>Authorization failed</h1><p>${error instanceof Error ? error.message : 'Unknown error'}</p><script>(1+2+3);</script></body></html>`,
      { headers: { 'content-type': 'text/html' } }
    );
  }
}
