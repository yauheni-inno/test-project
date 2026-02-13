// Connection management endpoint - get and delete HubSpot connections
import { NextResponse } from "next/server";
import { getWixClientForInstance, getSecretsClient } from "@/lib/wix-app-client";
import {
  deleteTokenSecrets,
} from "@/lib/hubspot/token-secrets";
import {
  getConnectionByInstanceId,
  deleteConnectionByInstanceId,
} from "@/lib/stores/connection-store";
import { requireInstanceIdFromRequest } from "@/lib/wix-instance";

export async function GET(request: Request) {
  try {
    const instanceId = await requireInstanceIdFromRequest(request);
    const connection = await getConnectionByInstanceId(instanceId);
    if (!connection) {
      return NextResponse.json({
        connected: false,
      });
    }

    return NextResponse.json({
      connected: true,
      portalId: connection.portalId,
      expiresAt: connection.expiresAt,
    });
  } catch (error) {
    console.error("Get connection failed:", error);
    return NextResponse.json(
      { error: "Failed to get connection" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const instanceId = await requireInstanceIdFromRequest(request);
    const connection = await getConnectionByInstanceId(instanceId);

    if (connection?.tokensSecretName) {
      try {
        const wixClient = getWixClientForInstance(instanceId);
        await deleteTokenSecrets(
          getSecretsClient(wixClient),
          connection.tokensSecretName,
        );
      } catch (e) {
        console.warn("Failed to delete token secrets:", e);
      }
    }

    await deleteConnectionByInstanceId(instanceId);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Delete connection failed:", error);
    return NextResponse.json(
      { error: "Failed to delete connection" },
      { status: 500 },
    );
  }
}
