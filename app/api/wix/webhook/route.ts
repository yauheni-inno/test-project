// Single Wix webhook route: SDK dispatches to registered handlers (onContactCreated, onContactUpdated)
import '@/lib/wix-webhook-handlers';
import { NextRequest, NextResponse } from 'next/server';
import { wixAppClient } from '@/lib/wix-app-client';

export async function POST(request: NextRequest) {
  try {
    await wixAppClient.webhooks.processRequest(request);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Wix webhook error:', error);
    return NextResponse.json(
      { error: 'Failed to process Wix webhook' },
      { status: 500 }
    );
  }
}
