// OAuth start endpoint - generates HubSpot authorization URL
import { NextResponse } from 'next/server';
import { getHubspotAppConfigFromSecrets, HUBSPOT_OAUTH_SCOPES } from '@/lib/hubspot/config';
import { getWixClientForInstance, getSecretsClient } from '@/lib/wix-app-client';
import { requireInstanceIdFromRequest } from '@/lib/wix-instance';

export async function GET(request: Request) {
  try {
    const instanceId = await requireInstanceIdFromRequest(request);
    const wixClient = getWixClientForInstance(instanceId);
    const config = await getHubspotAppConfigFromSecrets(getSecretsClient(wixClient));

    const state = Buffer.from(JSON.stringify({ instanceId })).toString('base64');

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: HUBSPOT_OAUTH_SCOPES.join(' '),
      state,
    });

    const authorizeUrl = `https://app.hubspot.com/oauth/authorize?${params.toString()}`;

    return NextResponse.json({
      authorizeUrl,
    });
  } catch (error) {
    console.error('OAuth start failed:', error);
    return NextResponse.json(
      { error: 'Failed to start OAuth flow' },
      { status: 500 }
    );
  }
}
