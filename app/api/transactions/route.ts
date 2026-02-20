import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { requireAuth } from "@/lib/middleware";

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

    const { searchParams } = new URL(request.url);
    const budgetId = searchParams.get("budgetId");

    let transactions;
    if (budgetId) {
      // Verify budget belongs to user, then get transactions
      const budgetCheck = await db.execute("SELECT id FROM budgets WHERE id = ? AND userId = ?", [budgetId, userId]);
      if (budgetCheck.rows.length === 0) {
        return NextResponse.json({ error: "Budget not found" }, { status: 404 });
      }
      const result = await db.execute(
        "SELECT * FROM transactions WHERE budgetId = ? ORDER BY datetime DESC",
        [budgetId]
      );
      transactions = result.rows;
    } else {
      // Get all transactions for user's budgets
      const result = await db.execute(
        `SELECT t.* FROM transactions t
         INNER JOIN budgets b ON t.budgetId = b.id
         WHERE b.userId = ?
         ORDER BY t.datetime DESC`,
        [userId]
      );
      transactions = result.rows;
    }

    return NextResponse.json(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDb();
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const body = await request.json();
    const { budgetId, datetime, description, amount } = body;

    if (!budgetId || !datetime || !description || typeof amount !== "number") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Verify budget belongs to user
    const budgetCheck = await db.execute("SELECT id FROM budgets WHERE id = ? AND userId = ?", [budgetId, userId]);
    if (budgetCheck.rows.length === 0) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.execute(
      `INSERT INTO transactions (id, budgetId, datetime, description, amount, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, budgetId, datetime, description, amount, now, now]
    );

    const transaction = {
      id,
      budgetId,
      datetime,
      description,
      amount,
      createdAt: now,
      updatedAt: now,
    };

    return NextResponse.json(transaction);
  } catch (error) {
    console.error("Error creating transaction:", error);
    return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
  }
}
