import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db, initDb } from "./db";

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "your-secret-key-change-in-production");

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(userId: string): Promise<string> {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  return token;
}

export async function verifyToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return { userId: payload.userId as string };
  } catch {
    return null;
  }
}

export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.replace("Bearer ", "") ||
                request.cookies?.get("auth-token")?.value ||
                new URL(request.url).searchParams.get("token");

  if (!token) return null;

  const decoded = await verifyToken(token);
  return decoded?.userId || null;
}

export async function createUser(email: string, name: string, password: string) {
  await initDb();
  
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  try {
    await db.execute(
      `INSERT INTO users (id, email, name, passwordHash, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, email.toLowerCase(), name, passwordHash, now, now]
    );

    return { id, email, name };
  } catch (error: any) {
    if (error.message?.includes("UNIQUE constraint")) {
      throw new Error("Email already exists");
    }
    throw error;
  }
}

export async function loginUser(email: string, password: string) {
  await initDb();

  const result = await db.execute(
    "SELECT * FROM users WHERE email = ?",
    [email.toLowerCase()]
  );

  const user = result.rows[0] as any;
  if (!user) {
    throw new Error("Invalid email or password");
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    throw new Error("Invalid email or password");
  }

  return { id: user.id, email: user.email, name: user.name };
}

