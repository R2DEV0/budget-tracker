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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const { id } = await params;

    const budgetResult = await db.execute("SELECT * FROM budgets WHERE id = ? AND userId = ?", [id, userId]);
    const budget = budgetResult.rows[0] as any;

    if (!budget) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    const txResult = await db.execute(
      "SELECT * FROM transactions WHERE budgetId = ? ORDER BY datetime DESC",
      [id]
    );

    const budgetWithParsedResetDays = {
      ...budget,
      resetDays: typeof budget.resetDays === "string" ? JSON.parse(budget.resetDays) : budget.resetDays,
      transactions: txResult.rows || [],
    };

    return NextResponse.json(budgetWithParsedResetDays);
  } catch (error) {
    console.error("Error fetching budget:", error);
    return NextResponse.json({ error: "Failed to fetch budget" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const { id } = await params;

    // Verify budget belongs to user
    const budgetCheck = await db.execute("SELECT id FROM budgets WHERE id = ? AND userId = ?", [id, userId]);
    if (budgetCheck.rows.length === 0) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }
    const body = await request.json();
    const { label, budgetAmount, resetDays, lastResetAt } = body;

    const updates: string[] = [];
    const values: any[] = [];

    if (label !== undefined) {
      updates.push("label = ?");
      values.push(label);
    }
    if (typeof budgetAmount === "number") {
      updates.push("budgetAmount = ?");
      values.push(budgetAmount);
    }
    if (Array.isArray(resetDays)) {
      updates.push("resetDays = ?");
      values.push(JSON.stringify(resetDays));
    }
    if (lastResetAt) {
      updates.push("lastResetAt = ?");
      values.push(lastResetAt);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    updates.push("updatedAt = ?");
    values.push(new Date().toISOString());
    values.push(id);

    await db.execute(
      `UPDATE budgets SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    const budgetResult = await db.execute("SELECT * FROM budgets WHERE id = ? AND userId = ?", [id, userId]);
    const budget = budgetResult.rows[0] as any;

    const budgetWithParsedResetDays = {
      ...budget,
      resetDays: typeof budget.resetDays === "string" ? JSON.parse(budget.resetDays) : budget.resetDays,
    };

    return NextResponse.json(budgetWithParsedResetDays);
  } catch (error) {
    console.error("Error updating budget:", error);
    return NextResponse.json({ error: "Failed to update budget" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const { id } = await params;

    await db.execute("DELETE FROM budgets WHERE id = ? AND userId = ?", [id, userId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting budget:", error);
    return NextResponse.json({ error: "Failed to delete budget" }, { status: 500 });
  }
}
