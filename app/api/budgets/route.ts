import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { requireAuth } from "@/lib/middleware";

// Initialize DB on first request
let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureDb();
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const budgetsResult = await db.execute(
      "SELECT * FROM budgets WHERE userId = ? ORDER BY createdAt DESC",
      [userId]
    );
    const budgets = budgetsResult.rows as any[];

    // Get transactions for each budget
    const budgetsWithTransactions = await Promise.all(
      budgets.map(async (budget) => {
        const txResult = await db.execute(
          "SELECT * FROM transactions WHERE budgetId = ? ORDER BY datetime DESC",
          [budget.id]
        );
        return {
          ...budget,
          resetDays: typeof budget.resetDays === "string" ? JSON.parse(budget.resetDays) : budget.resetDays,
          transactions: txResult.rows || [],
        };
      })
    );

    return NextResponse.json(budgetsWithTransactions);
  } catch (error) {
    console.error("Error fetching budgets:", error);
    return NextResponse.json({ error: "Failed to fetch budgets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDb();
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const body = await request.json();
    const { label, budgetAmount, resetDays, lastResetAt } = body;

    if (!label || typeof budgetAmount !== "number" || !Array.isArray(resetDays) || !lastResetAt) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const resetDaysJson = JSON.stringify(resetDays);
    const now = new Date().toISOString();

    await db.execute(
      `INSERT INTO budgets (id, userId, label, budgetAmount, resetDays, lastResetAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, label, budgetAmount, resetDaysJson, lastResetAt, now, now]
    );

    const budget = {
      id,
      userId,
      label,
      budgetAmount,
      resetDays,
      lastResetAt,
      createdAt: now,
      updatedAt: now,
      transactions: [],
    };

    return NextResponse.json(budget);
  } catch (error) {
    console.error("Error creating budget:", error);
    return NextResponse.json({ error: "Failed to create budget" }, { status: 500 });
  }
}
