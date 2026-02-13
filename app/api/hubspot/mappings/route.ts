// Field mappings endpoint - get, update field mappings and list available fields
import { NextResponse } from "next/server";
import {
  getMappingsByInstanceId,
  upsertMappings,
} from "@/lib/stores/mapping-store";
import { getHubspotClient } from "@/lib/hubspot/client";
import { ensureContactWebhookSubscriptions } from "@/lib/hubspot/webhooks";
import { getWixClientForInstance } from "@/lib/wix-app-client";
import { requireInstanceIdFromRequest } from "@/lib/wix-instance";
import { WIX_CONTACT_FIELDS } from "@/lib/constants";
import type { FieldMappingRecord, MappingDirection } from "@/lib/types";

const VALID_DIRECTIONS: MappingDirection[] = [
  "wix_to_hubspot",
  "hubspot_to_wix",
  "bi_directional",
];
const VALID_TRANSFORMS = ["none", "trim", "lowercase", "uppercase"];

/** Default Wix contact fields + custom extended fields (namespace "custom") for mapping UI. */
async function getWixFieldOptions(
  instanceId: string,
): Promise<{ key: string; label: string }[]> {
  const baseFields = WIX_CONTACT_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
  }));
  try {
    const wixClient = getWixClientForInstance(instanceId);
    const result = await wixClient.extendedFields
      .queryExtendedFields()
      .eq("namespace", "custom")
      .find();
    const extended = (result.items ?? [])
      .filter((f): f is typeof f & { key: string } =>
        Boolean((f as { key?: string }).key),
      )
      .map((f) => ({
        key: f.key,
        label: (f as { displayName?: string }).displayName ?? f.key,
      }));
    return [...baseFields, ...extended];
  } catch (e) {
    console.warn("Failed to fetch extended fields (custom namespace):", e);
    return baseFields;
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const instanceId = await requireInstanceIdFromRequest(request);
    const option = url.searchParams.get("option");

    // Return field options for dropdowns (default + custom extended fields)
    if (option === "wixFields") {
      const fields = await getWixFieldOptions(instanceId);
      return NextResponse.json({ fields });
    }

    if (option === "hubspotProperties") {
      try {
        const client = await getHubspotClient(instanceId);
        const properties = await client.listContactProperties();
        return NextResponse.json({
          fields: properties.map((p) => ({
            key: p.name,
            label: p.label || p.name,
          })),
        });
      } catch (error) {
        console.error("Failed to fetch HubSpot properties:", error);
        return NextResponse.json(
          {
            error:
              "Failed to fetch HubSpot properties. Ensure HubSpot is connected.",
          },
          { status: 400 },
        );
      }
    }

    // Return existing mappings
    const mappings = await getMappingsByInstanceId(instanceId);
    return NextResponse.json({
      mappings,
    });
  } catch (error) {
    console.error("Get mappings failed:", error);
    return NextResponse.json(
      { error: "Failed to get mappings" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const instanceId = await requireInstanceIdFromRequest(request);
    const body = await request.json();
    const { mappings } = body as {
      mappings: Omit<
        FieldMappingRecord,
        "_id" | "instanceId" | "createdAt" | "updatedAt"
      >[];
    };

    if (!Array.isArray(mappings)) {
      return NextResponse.json(
        { error: "Invalid mappings format" },
        { status: 400 },
      );
    }

    // Validate each mapping: all fields required
    for (let i = 0; i < mappings.length; i++) {
      const m = mappings[i];
      const missing: string[] = [];
      if (
        !m.wixFieldKey ||
        typeof m.wixFieldKey !== "string" ||
        !m.wixFieldKey.trim()
      ) {
        missing.push("Wix field");
      }
      if (
        !m.hubspotPropertyKey ||
        typeof m.hubspotPropertyKey !== "string" ||
        !m.hubspotPropertyKey.trim()
      ) {
        missing.push("HubSpot property");
      }
      if (
        !m.direction ||
        typeof m.direction !== "string" ||
        !m.direction.trim()
      ) {
        missing.push("Direction");
      }
      if (
        !m.transform ||
        typeof m.transform !== "string" ||
        !m.transform.trim()
      ) {
        missing.push("Transform");
      }
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: "All fields are required in each mapping",
            message: `Row ${i + 1}: missing ${missing.join(", ")}.`,
          },
          { status: 400 },
        );
      }
      if (!VALID_DIRECTIONS.includes(m.direction as MappingDirection)) {
        return NextResponse.json(
          {
            error: "Invalid direction",
            message: `Row ${i + 1}: direction must be one of ${VALID_DIRECTIONS.join(", ")}.`,
          },
          { status: 400 },
        );
      }
      if (!VALID_TRANSFORMS.includes(m.transform)) {
        return NextResponse.json(
          {
            error: "Invalid transform",
            message: `Row ${i + 1}: transform must be one of ${VALID_TRANSFORMS.join(", ")}.`,
          },
          { status: 400 },
        );
      }
    }

    const saved = await upsertMappings(instanceId, mappings);

    const baseWebhookUrl =
      process.env.HUBSPOT_WEBHOOK_BASE_URL ??
      `${new URL(request.url).origin}/api/hubspot/webhook`;
    const hubspotPropertyKeys = saved.map((m) => m.hubspotPropertyKey);
    try {
      await ensureContactWebhookSubscriptions(
        instanceId,
        baseWebhookUrl,
        hubspotPropertyKeys,
      );
    } catch (webhookError) {
      console.error("HubSpot webhook subscription update failed:", webhookError);
      return NextResponse.json(
        {
          success: true,
          mappings: saved,
          warning:
            "Mappings saved but webhook subscription update failed. Ensure HUBSPOT_APP_ID and HUBSPOT_DEVELOPER_API_KEY are set.",
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      success: true,
      mappings: saved,
    });
  } catch (error) {
    console.error("Save mappings failed:", error);
    return NextResponse.json(
      { error: "Failed to save mappings" },
      { status: 500 },
    );
  }
}
