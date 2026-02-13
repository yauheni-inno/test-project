// Wix form submission handler - captures form data and sends to HubSpot with UTM tracking
import { NextResponse } from 'next/server';
import { getHubspotClient } from '@/lib/hubspot/client';
import { requireInstanceIdFromRequest } from '@/lib/wix-instance';
import type { WixContactLike } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const instanceId = await requireInstanceIdFromRequest(request);
    const body = await request.json();

    const {
      email,
      firstName,
      lastName,
      phone,
      company,
      notes,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      pageUrl,
      referrer,
      customFields,
    } = body as WixContactLike & { customFields?: Record<string, unknown> };

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const client = await getHubspotClient(instanceId);

    // Build HubSpot properties
    const properties: Record<string, string | number> = {
      email,
    };

    if (firstName) properties.firstname = firstName;
    if (lastName) properties.lastname = lastName;
    if (phone) properties.phone = phone;
    if (company) properties.company = company;
    if (notes) properties.notes = notes;

    // UTM tracking
    if (utm_source) properties.utm_source = utm_source;
    if (utm_medium) properties.utm_medium = utm_medium;
    if (utm_campaign) properties.utm_campaign = utm_campaign;
    if (utm_term) properties.utm_term = utm_term;
    if (utm_content) properties.utm_content = utm_content;

    // Page context
    if (pageUrl) properties.form_submission_url = pageUrl;
    if (referrer) properties.form_submission_referrer = referrer;

    // Add timestamp
    properties.form_submission_timestamp = new Date().toISOString();

    // Add any custom fields
    if (customFields) {
      Object.assign(properties, customFields);
    }

    // Create or update HubSpot contact (no sync metadata; HubSpot cannot store correlation data for loop prevention)
    const contact = await client.createOrUpdateContact({
      email,
      properties,
    });

    return NextResponse.json({
      success: true,
      hubspotContactId: contact.id,
    });
  } catch (error) {
    console.error('Form submission failed:', error);
    return NextResponse.json(
      { error: 'Failed to process form submission' },
      { status: 500 }
    );
  }
}
