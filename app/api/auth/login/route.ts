import { NextRequest, NextResponse } from "next/server";
import { loginUser, createToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const user = await loginUser(email, password);
    const token = await createToken(user.id);

    const response = NextResponse.json({ user, token });
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch (error: any) {
    console.error("Error logging in:", error);
    return NextResponse.json(
      { error: error.message || "Failed to login" },
      { status: 401 }
    );
  }
}

