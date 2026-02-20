import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "./auth";

export async function getUserId(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get("auth-token")?.value ||
                request.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) return null;

  const decoded = await verifyToken(token);
  return decoded?.userId || null;
}

export async function requireAuth(request: NextRequest): Promise<{ userId: string } | NextResponse> {
  const userId = await getUserId(request);
  
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { userId };
}

