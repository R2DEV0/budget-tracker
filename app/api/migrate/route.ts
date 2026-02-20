import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { createUser, hashPassword } from "@/lib/auth";

// This endpoint migrates existing budgets/transactions to a new user account
export async function POST(request: NextRequest) {
  try {
    await initDb();

    const body = await request.json();
    const { email, name, password } = body;

    if (!email || !name || !password) {
      return NextResponse.json({ error: "Email, name, and password are required" }, { status: 400 });
    }

    // Create user
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    try {
      await db.execute(
        `INSERT INTO users (id, email, name, passwordHash, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, email.toLowerCase(), name, passwordHash, now, now]
      );
    } catch (error: any) {
      if (error.message?.includes("UNIQUE constraint")) {
        return NextResponse.json({ error: "Email already exists" }, { status: 400 });
      }
      throw error;
    }

    // Get all existing budgets (those without userId)
    const existingBudgets = await db.execute("SELECT * FROM budgets WHERE userId IS NULL OR userId = ''");
    
    // Migrate budgets to new user
    for (const budget of existingBudgets.rows as any[]) {
      await db.execute(
        "UPDATE budgets SET userId = ? WHERE id = ?",
        [userId, budget.id]
      );
    }

    // All transactions are already linked via budgetId, so they're automatically linked to the user

    return NextResponse.json({
      success: true,
      message: `User created and ${existingBudgets.rows.length} budget(s) migrated`,
      userId,
    });
  } catch (error: any) {
    console.error("Error migrating data:", error);
    return NextResponse.json({ error: error.message || "Failed to migrate" }, { status: 500 });
  }
}

