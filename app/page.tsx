"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Budget = {
  id: string;
  label: string;
  budgetAmount: number;
  resetDays: number[];
  lastResetAt: string;
  transactions: Transaction[];
};

type Transaction = {
  id: string;
  budgetId: string;
  datetime: string;
  description: string;
  amount: number;
};

/* ---------------- utils ---------------- */

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseResetDays(input: string): number[] {
  const days = input
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.floor(n))
    .filter((n) => n >= 1 && n <= 28);

  return Array.from(new Set<number>(days)).sort((a, b) => a - b);
}

function getMostRecentBoundary(now: Date, resetDays: number[]): Date {
  const days = resetDays.length ? resetDays : [1, 15];
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const candidates: Date[] = [];
  for (const base of [thisMonth, prevMonth]) {
    for (const day of days) candidates.push(startOfDay(new Date(base.getFullYear(), base.getMonth(), day)));
  }

  const past = candidates.filter((c) => c.getTime() <= now.getTime()).sort((a, b) => b.getTime() - a.getTime());
  return past[0] ?? startOfDay(thisMonth);
}

function getNextBoundary(now: Date, resetDays: number[]): Date {
  const days = (resetDays.length ? resetDays : [1, 15]).slice().sort((a, b) => a - b);
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const candidates: Date[] = [];
  for (const base of [thisMonth, nextMonth]) {
    for (const day of days) candidates.push(startOfDay(new Date(base.getFullYear(), base.getMonth(), day)));
  }

  const future = candidates.filter((c) => c.getTime() > now.getTime()).sort((a, b) => a.getTime() - b.getTime());
  return future[0] ?? startOfDay(nextMonth);
}

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/* ---------------- loading spinner ---------------- */

function LoadingSpinner({ size = 24 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `3px solid rgba(0,0,0,0.1)`,
        borderTopColor: "#111",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}

/* ---------------- toast ---------------- */

function Toast({ show, text, type = "success" }: { show: boolean; text: string; type?: "success" | "error" }) {
  if (!show) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        background: type === "error" ? "#ff4444" : "#111",
        color: "#fff",
        padding: "12px 20px",
        borderRadius: 999,
        fontWeight: 700,
        boxShadow: "0 10px 30px rgba(0,0,0,.25)",
        zIndex: 1000,
        animation: "slideUp 0.3s ease-out",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {type === "success" ? "✓" : "✕"} {text}
    </div>
  );
}

/* ---------------- page ---------------- */

export default function Page() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [activeBudgetId, setActiveBudgetId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [desc, setDesc] = useState("");
  const [amt, setAmt] = useState("");

  const [showSettings, setShowSettings] = useState(false);
  const [showCreateBudget, setShowCreateBudget] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; text: string; type: "success" | "error" }>({ show: false, text: "", type: "success" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingTx, setAddingTx] = useState(false);

  // settings inputs
  const [budgetLabelInput, setBudgetLabelInput] = useState("");
  const [budgetAmountInput, setBudgetAmountInput] = useState("");
  const [budgetResetDaysInput, setBudgetResetDaysInput] = useState("1,15");

  // create budget inputs
  const [newBudgetLabel, setNewBudgetLabel] = useState("");
  const [newBudgetAmount, setNewBudgetAmount] = useState("");
  const [newBudgetResetDays, setNewBudgetResetDays] = useState("1,15");

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        setAuthenticated(true);
        loadData();
      } else {
        router.push("/login");
      }
    } catch (error) {
      router.push("/login");
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const budgetsRes = await fetch("/api/budgets");
      if (!budgetsRes.ok) {
        throw new Error(`Failed to load budgets: ${budgetsRes.status} ${budgetsRes.statusText}`);
      }
      const budgetsData = await budgetsRes.json();
      const budgetsWithResetDays = budgetsData.map((b: any) => ({
        ...b,
        resetDays: typeof b.resetDays === "string" ? JSON.parse(b.resetDays) : b.resetDays,
      }));

      setBudgets(budgetsWithResetDays);

      if (budgetsWithResetDays.length > 0 && !activeBudgetId) {
        setActiveBudgetId(budgetsWithResetDays[0].id);
      }

      const txRes = await fetch("/api/transactions");
      if (!txRes.ok) {
        throw new Error(`Failed to load transactions: ${txRes.status} ${txRes.statusText}`);
      }
      const txData = await txRes.json();
      setTransactions(txData);

      // Auto-reset budgets if needed
      const now = new Date();
      for (const budget of budgetsWithResetDays) {
        const next = getNextBoundary(new Date(budget.lastResetAt), budget.resetDays);
        if (now.getTime() >= next.getTime()) {
          const last = getMostRecentBoundary(now, budget.resetDays);
          await fetch(`/api/budgets/${budget.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lastResetAt: last.toISOString() }),
          });
        }
      }

      // Reload after auto-reset
      if (budgetsWithResetDays.some((b: Budget) => {
        const next = getNextBoundary(new Date(b.lastResetAt), b.resetDays);
        return now.getTime() >= next.getTime();
      })) {
        setTimeout(loadData, 100);
        return;
      }

    setReady(true);
    } catch (error) {
      console.error("Error loading data:", error);
      setError(error instanceof Error ? error.message : "Failed to load data");
      setReady(true);
    } finally {
      setLoading(false);
    }
  }

  const activeBudget = useMemo(() => budgets.find((b) => b.id === activeBudgetId), [budgets, activeBudgetId]);

  const periodTx = useMemo(() => {
    if (!activeBudget) return [];
    const cutoff = new Date(activeBudget.lastResetAt).getTime();
    return transactions
      .filter((t) => t.budgetId === activeBudgetId)
      .filter((t) => new Date(t.datetime).getTime() >= cutoff)
      .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());
  }, [transactions, activeBudget, activeBudgetId]);

  const net = useMemo(() => periodTx.reduce((sum, t) => sum + t.amount, 0), [periodTx]);
  const remaining = useMemo(() => (activeBudget ? activeBudget.budgetAmount - net : 0), [activeBudget, net]);

  const nextReset = useMemo(() => {
    if (!activeBudget) return null;
    return getNextBoundary(new Date(), activeBudget.resetDays);
  }, [activeBudget]);

  function showToast(text: string, type: "success" | "error" = "success") {
    setToast({ show: true, text, type });
    window.setTimeout(() => setToast({ show: false, text: "", type: "success" }), 2000);
  }

  async function addTx() {
    if (!activeBudgetId || addingTx) return;

    const amount = Number(amt);
    if (!desc.trim()) return;
    if (!Number.isFinite(amount) || amount === 0) return;

    setAddingTx(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budgetId: activeBudgetId,
      datetime: new Date().toISOString(),
      description: desc.trim(),
      amount,
        }),
      });

      if (res.ok) {
        const newTx = await res.json();
        setTransactions([newTx, ...transactions]);
    setDesc("");
    setAmt("");
        showToast("💰 Transaction added!", "success");
      } else {
        showToast("Failed to add transaction", "error");
      }
    } catch (error) {
      console.error("Error adding transaction:", error);
      showToast("Error adding transaction", "error");
    } finally {
      setAddingTx(false);
    }
  }

  async function saveBudgetSettings() {
    if (!activeBudget || saving) return;

    const budgetAmount = Number(budgetAmountInput);
    const resetDays = parseResetDays(budgetResetDaysInput);

    if (!budgetLabelInput.trim()) return;
    if (!Number.isFinite(budgetAmount) || budgetAmount < 0) return;
    if (!resetDays.length) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/budgets/${activeBudget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: budgetLabelInput.trim(),
          budgetAmount,
          resetDays,
        }),
      });

      if (res.ok) {
        await loadData();
        showToast("✨ Settings saved!", "success");
        setShowSettings(false);
      } else {
        showToast("Failed to save", "error");
      }
    } catch (error) {
      console.error("Error saving budget:", error);
      showToast("Error saving", "error");
    } finally {
      setSaving(false);
    }
  }

  async function createBudget() {
    if (saving) return;

    const budgetAmount = Number(newBudgetAmount);
    const resetDays = parseResetDays(newBudgetResetDays);

    if (!newBudgetLabel.trim()) return;
    if (!Number.isFinite(budgetAmount) || budgetAmount < 0) return;
    if (!resetDays.length) return;

    setSaving(true);
    try {
      const now = new Date();
      const lastResetAt = getMostRecentBoundary(now, resetDays);

      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newBudgetLabel.trim(),
          budgetAmount,
          resetDays,
          lastResetAt: lastResetAt.toISOString(),
        }),
      });

      if (res.ok) {
        await loadData();
        const newBudget = await res.json();
        setActiveBudgetId(newBudget.id);
        setNewBudgetLabel("");
        setNewBudgetAmount("");
        setNewBudgetResetDays("1,15");
        setShowCreateBudget(false);
        showToast("🎉 Budget created!", "success");
      } else {
        showToast("Failed to create budget", "error");
      }
    } catch (error) {
      console.error("Error creating budget:", error);
      showToast("Error creating budget", "error");
    } finally {
      setSaving(false);
    }
  }

  async function manualReset() {
    if (!activeBudget) return;
    const now = new Date();
    const last = getMostRecentBoundary(now, activeBudget.resetDays);

    try {
      const res = await fetch(`/api/budgets/${activeBudget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastResetAt: last.toISOString() }),
      });

      if (res.ok) {
        await loadData();
        showToast("🔄 Budget reset!", "success");
      }
    } catch (error) {
      console.error("Error resetting budget:", error);
      showToast("Error resetting");
    }
  }

  async function deleteBudget(budgetId: string) {
    if (!confirm("Delete this budget? All transactions will be deleted too.")) return;

    try {
      const res = await fetch(`/api/budgets/${budgetId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await loadData();
        if (activeBudgetId === budgetId && budgets.length > 1) {
          const remaining = budgets.filter((b) => b.id !== budgetId);
          setActiveBudgetId(remaining[0]?.id || null);
        } else if (activeBudgetId === budgetId) {
          setActiveBudgetId(null);
        }
        showToast("🗑️ Budget deleted", "success");
      }
    } catch (error) {
      console.error("Error deleting budget:", error);
      showToast("Error deleting");
    }
  }

  async function deleteTransaction(txId: string) {
    try {
      const res = await fetch(`/api/transactions/${txId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setTransactions(transactions.filter((t) => t.id !== txId));
        showToast("🗑️ Transaction deleted", "success");
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
      showToast("Error deleting");
    }
  }

  useEffect(() => {
    if (activeBudget) {
      setBudgetLabelInput(activeBudget.label);
      setBudgetAmountInput(String(activeBudget.budgetAmount));
      setBudgetResetDaysInput(activeBudget.resetDays.join(","));
    }
  }, [activeBudget]);

  const resetDaysHelper = useMemo(() => {
    const days = parseResetDays(budgetResetDaysInput);
    if (!days.length) return "Enter at least one reset day between 1 and 28.";
    if (days.length === 1) return `Resets monthly on day ${days[0]}.`;
    return `Resets on days ${days.join(", ")}.`;
  }, [budgetResetDaysInput]);

  if (!ready) {
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <p>Loading...</p>
        </div>
      </main>
    );
  }

  if (error) {
  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
        <div style={{ padding: 32, border: "none", borderRadius: 24, background: "linear-gradient(135deg, rgba(255, 107, 107, 0.15) 0%, rgba(238, 90, 111, 0.15) 100%)", boxShadow: "0 8px 30px rgba(255, 107, 107, 0.3)", backdropFilter: "blur(10px)" }}>
          <h2 style={{ color: "#ff6b6b", marginTop: 0, fontSize: 24, fontWeight: 900, marginBottom: 16 }}>⚠️ Error</h2>
          <p style={{ marginBottom: 20, fontSize: 16, color: "#333", fontWeight: 500 }}>{error}</p>
          <button
            onClick={() => {
              setError(null);
              setReady(false);
              loadData();
            }}
            style={{
              padding: "12px 24px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)",
              color: "#fff",
              fontWeight: 900,
              cursor: "pointer",
              fontSize: 16,
              boxShadow: "0 4px 15px rgba(255, 107, 107, 0.4)",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 6px 20px rgba(255, 107, 107, 0.6)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 15px rgba(255, 107, 107, 0.4)";
            }}
          >
            🔄 Retry
          </button>
        </div>
      </main>
    );
  }

  if (budgets.length === 0) {
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Budget Buddy</h1>
        <div style={{ marginTop: 40, padding: 24, border: "1px solid #eee", borderRadius: 14, textAlign: "center" }}>
          <p style={{ fontSize: 18, marginBottom: 20 }}>No budgets yet. Create your first budget to get started!</p>
          <button
            onClick={() => setShowCreateBudget(true)}
            style={{
              padding: "12px 24px",
              borderRadius: 12,
              border: "none",
              background: "#111",
              color: "#fff",
              fontWeight: 900,
              fontSize: 16,
            }}
          >
            Create Budget
          </button>
        </div>

        {showCreateBudget && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.6)",
            backdropFilter: "blur(5px)",
              padding: 16,
              overflowY: "auto",
              display: "grid",
              alignItems: "start",
              justifyItems: "center",
            }}
            onClick={() => setShowCreateBudget(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
                style={{
                  width: "min(560px, 100%)",
                  background: "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.95) 100%)",
                  borderRadius: 24,
                  border: "none",
                  boxShadow: "0 20px 60px rgba(0,0,0,.3)",
                  padding: 28,
                  backdropFilter: "blur(20px)",
                }}
              >
                <h2 style={{ margin: "0 0 24px 0", fontSize: 24, fontWeight: 900, color: "#000" }}>✨ Create Budget</h2>

              <label style={{ display: "block", fontWeight: 800, marginBottom: 8, fontSize: 14, color: "#333" }}>Label</label>
              <input
                value={newBudgetLabel}
                onChange={(e) => setNewBudgetLabel(e.target.value)}
                placeholder="e.g., Groceries, Fun Money"
                style={{ width: "100%", padding: 14, borderRadius: 12, border: "2px solid #e0e0e0", fontSize: 16, marginBottom: 20, background: "#fff", transition: "all 0.3s ease" }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#667eea";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(102, 126, 234, 0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e0e0e0";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />

              <label style={{ display: "block", fontWeight: 800, marginBottom: 8, fontSize: 14, color: "#333" }}>Budget amount</label>
              <input
                inputMode="decimal"
                value={newBudgetAmount}
                onChange={(e) => setNewBudgetAmount(e.target.value)}
                placeholder="300"
                style={{ width: "100%", padding: 14, borderRadius: 12, border: "2px solid #e0e0e0", fontSize: 16, marginBottom: 20, background: "#fff", transition: "all 0.3s ease" }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#667eea";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(102, 126, 234, 0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e0e0e0";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />

              <label style={{ display: "block", fontWeight: 800, marginBottom: 8, fontSize: 14, color: "#333" }}>
                Reset days of month (1–28, comma-separated)
              </label>
              <input
                value={newBudgetResetDays}
                onChange={(e) => setNewBudgetResetDays(e.target.value)}
                placeholder="1,15"
                style={{ width: "100%", padding: 14, borderRadius: 12, border: "2px solid #e0e0e0", fontSize: 16, marginBottom: 10, background: "#fff", transition: "all 0.3s ease" }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#667eea";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(102, 126, 234, 0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e0e0e0";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              <div style={{ opacity: 0.7, marginBottom: 16, fontSize: 13 }}>
                {parseResetDays(newBudgetResetDays).length
                  ? `Resets on days ${parseResetDays(newBudgetResetDays).join(", ")}.`
                  : "Enter at least one reset day between 1 and 28."}
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={createBudget}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: "14px 18px",
                    borderRadius: 12,
                    border: "none",
                    background: saving ? "#888" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    color: "#fff",
                    fontWeight: 900,
                    fontSize: 16,
                    cursor: saving ? "not-allowed" : "pointer",
                    transition: "all 0.3s ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    boxShadow: saving ? "none" : "0 4px 15px rgba(102, 126, 234, 0.4)",
                  }}
                  onMouseEnter={(e) => {
                    if (!saving) {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "0 6px 20px rgba(102, 126, 234, 0.6)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!saving) {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 4px 15px rgba(102, 126, 234, 0.4)";
                    }
                  }}
                >
                  {saving ? (
                    <>
                      <LoadingSpinner size={16} />
                      <span>Creating...</span>
                    </>
                  ) : (
                    "✨ Create"
                  )}
                </button>
                <button
                  onClick={() => setShowCreateBudget(false)}
                  style={{
                    flex: 1,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "#fff",
                    fontWeight: 900,
                    fontSize: 16,
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <Toast show={toast.show} text={toast.text} type={toast.type} />
      </main>
    );
  }

  if (!activeBudget) return null;

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "12px 16px", fontFamily: "system-ui", minHeight: "100vh", paddingBottom: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "clamp(24px, 6vw, 32px)", fontWeight: 900, margin: 0, color: "#fff", flex: "1 1 auto", minWidth: 0 }}>{activeBudget.label}</h1>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => router.push("/tracking")}
            style={{
              padding: "12px 14px",
              minHeight: 44,
              minWidth: 44,
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "#fff",
              fontWeight: 900,
              fontSize: "clamp(12px, 3vw, 14px)",
              boxShadow: "0 4px 15px rgba(102, 126, 234, 0.4)",
              transition: "all 0.3s ease",
              cursor: "pointer",
              touchAction: "manipulation",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 6px 20px rgba(102, 126, 234, 0.6)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 15px rgba(102, 126, 234, 0.4)";
            }}
          >
            📊 Tracking
          </button>
        <button
          onClick={() => setShowSettings(true)}
            style={{
              padding: "12px 14px",
              minHeight: 44,
              minWidth: 44,
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
              color: "#fff",
              fontWeight: 900,
              fontSize: "clamp(12px, 3vw, 14px)",
              boxShadow: "0 4px 15px rgba(245, 87, 108, 0.4)",
              transition: "all 0.3s ease",
              cursor: "pointer",
              touchAction: "manipulation",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 6px 20px rgba(245, 87, 108, 0.6)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 15px rgba(245, 87, 108, 0.4)";
            }}
          >
            ⚙️ Settings
        </button>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/login");
            }}
            style={{
              padding: "12px 14px",
              minHeight: 44,
              minWidth: 44,
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
              color: "#fff",
              fontWeight: 900,
              fontSize: "clamp(12px, 3vw, 14px)",
              boxShadow: "0 4px 15px rgba(250, 112, 154, 0.4)",
              transition: "all 0.3s ease",
              cursor: "pointer",
              touchAction: "manipulation",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 6px 20px rgba(250, 112, 154, 0.6)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 15px rgba(250, 112, 154, 0.4)";
            }}
          >
            🚪 Logout
          </button>
        </div>
      </header>

      {/* budget switch */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {budgets.map((b, idx) => {
          const colors = [
            "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
            "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
            "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
            "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
            "linear-gradient(135deg, #30cfd0 0%, #330867 100%)",
          ];
          const gradient = colors[idx % colors.length];
          const isActive = b.id === activeBudgetId;
          
          return (
          <button
              key={b.id}
              onClick={() => setActiveBudgetId(b.id)}
            style={{
                padding: "14px 18px",
                minHeight: 44,
              borderRadius: 999,
                border: "none",
                background: isActive ? gradient : "rgba(255,255,255,0.9)",
                color: isActive ? "#fff" : "#333",
              fontWeight: 900,
                fontSize: "clamp(13px, 3.5vw, 15px)",
                transition: "all 0.3s ease",
                cursor: "pointer",
                touchAction: "manipulation",
                transform: isActive ? "scale(1.05)" : "scale(1)",
                boxShadow: isActive ? "0 6px 20px rgba(0,0,0,0.3)" : "0 2px 8px rgba(0,0,0,0.1)",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "rgba(255,255,255,1)";
                  e.currentTarget.style.transform = "scale(1.05)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.9)";
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
                }
              }}
            >
              {b.label}
          </button>
          );
        })}
        <button
          onClick={() => setShowCreateBudget(true)}
          style={{
            padding: "14px 18px",
            minHeight: 44,
            borderRadius: 999,
            border: "2px dashed rgba(255,255,255,0.6)",
            background: "rgba(255,255,255,0.2)",
            fontWeight: 900,
            color: "#fff",
            fontSize: "clamp(13px, 3.5vw, 15px)",
            transition: "all 0.3s ease",
            cursor: "pointer",
            touchAction: "manipulation",
            backdropFilter: "blur(10px)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,1)";
            e.currentTarget.style.background = "rgba(255,255,255,0.3)";
            e.currentTarget.style.transform = "scale(1.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.6)";
            e.currentTarget.style.background = "rgba(255,255,255,0.2)";
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          ➕ New
        </button>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: "20px 16px",
          border: "none",
          borderRadius: 20,
          background: remaining < 0
            ? "linear-gradient(135deg, #e63946 0%, #d62828 100%)"
            : remaining < activeBudget.budgetAmount * 0.2
            ? "linear-gradient(135deg, #f77f00 0%, #fcbf49 100%)"
            : "linear-gradient(135deg, #219ebc 0%, #023047 100%)",
          boxShadow: remaining < 0
            ? "0 8px 30px rgba(255, 107, 107, 0.4)"
            : remaining < activeBudget.budgetAmount * 0.2
            ? "0 8px 30px rgba(254, 202, 87, 0.4)"
            : "0 8px 30px rgba(72, 219, 251, 0.4)",
          transition: "all 0.3s ease",
          color: "#fff",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div style={{ fontSize: "clamp(12px, 3vw, 14px)", marginBottom: 6, fontWeight: 700, color: "#fff" }}>Remaining</div>
            <div
              style={{
                fontSize: "clamp(28px, 8vw, 40px)",
                fontWeight: 900,
                color: "#fff",
                transition: "all 0.3s ease",
                wordBreak: "break-word",
              }}
            >
              {money(remaining)}
          </div>
          </div>
          <div style={{ flex: "1 1 auto", minWidth: 0, textAlign: "right" }}>
            <div style={{ fontSize: "clamp(12px, 3vw, 14px)", marginBottom: 6, fontWeight: 700, color: "#fff" }}>Net this period</div>
            <div style={{ fontSize: "clamp(20px, 6vw, 26px)", fontWeight: 800, color: "#fff" }}>{money(net)}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              width: "100%",
              height: 16,
              background: "rgba(0,0,0,0.5)",
              borderRadius: 10,
              overflow: "hidden",
              position: "relative",
              boxShadow: "inset 0 3px 8px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                width: `${Math.min((net / activeBudget.budgetAmount) * 100, 100)}%`,
                height: "100%",
                background:
                  net / activeBudget.budgetAmount > 1
                    ? "linear-gradient(90deg, #ff0000, #cc0000)"
                    : net / activeBudget.budgetAmount > 0.8
                    ? "linear-gradient(90deg, #ff8800, #ffaa00)"
                    : "linear-gradient(90deg, #00aaff, #0088ff)",
                transition: "width 0.5s ease, background 0.3s ease",
                borderRadius: 10,
                boxShadow: "0 0 8px rgba(255,255,255,0.3)",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: "clamp(11px, 2.5vw, 13px)", fontWeight: 700, color: "#fff" }}>
            <span>0</span>
            <span>{((net / activeBudget.budgetAmount) * 100).toFixed(0)}% used</span>
            <span>{money(activeBudget.budgetAmount)}</span>
          </div>
        </div>

        <div style={{ marginTop: 16, fontSize: "clamp(12px, 3vw, 13px)", fontWeight: 600, color: "#fff" }}>
          Period started: <b>{new Date(activeBudget.lastResetAt).toLocaleString()}</b>
          {nextReset ? (
            <>
              {" "}
              — Next reset: <b>{nextReset.toLocaleString()}</b>
            </>
          ) : null}
        </div>
      </div>

      <section style={{ marginTop: 20, padding: "16px 14px", border: "none", borderRadius: 20, background: "rgba(255,255,255,0.95)", boxShadow: "0 8px 30px rgba(0,0,0,0.15)", backdropFilter: "blur(10px)" }}>
        <h2 style={{ fontSize: "clamp(16px, 4vw, 18px)", fontWeight: 900, marginBottom: 16, color: "#000" }}>💸 Log transaction</h2>
        <input
          placeholder="Description"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTx()}
          style={{ width: "100%", padding: "16px 14px", minHeight: 44, borderRadius: 12, border: "2px solid #e0e0e0", fontSize: 16, background: "#fff", transition: "all 0.3s ease", boxSizing: "border-box" }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "#667eea";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(102, 126, 234, 0.1)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "#e0e0e0";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
          <input
            inputMode="decimal"
            placeholder="Amount (negative for refunds)"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTx()}
            style={{ padding: "16px 14px", minHeight: 44, borderRadius: 12, border: "2px solid #e0e0e0", fontSize: 16, background: "#fff", transition: "all 0.3s ease", width: "100%", boxSizing: "border-box" }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "#667eea";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(102, 126, 234, 0.1)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#e0e0e0";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          <button
            onClick={addTx}
            disabled={addingTx}
            style={{
              padding: "16px 20px",
              minHeight: 48,
              borderRadius: 12,
              border: "none",
              background: addingTx ? "#888" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "#fff",
              fontWeight: 900,
              fontSize: 16,
              cursor: addingTx ? "not-allowed" : "pointer",
              transition: "all 0.3s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              touchAction: "manipulation",
              boxShadow: addingTx ? "none" : "0 4px 15px rgba(102, 126, 234, 0.4)",
            }}
            onMouseEnter={(e) => {
              if (!addingTx) {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 20px rgba(102, 126, 234, 0.6)";
              }
            }}
            onMouseLeave={(e) => {
              if (!addingTx) {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 15px rgba(102, 126, 234, 0.4)";
              }
            }}
          >
            {addingTx ? (
              <>
                <LoadingSpinner size={16} />
                <span>Adding...</span>
              </>
            ) : (
              "➕ Add Transaction"
            )}
          </button>
        </div>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 16, color: "#000" }}>📋 This period</h2>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {periodTx.length === 0 ? (
            <div style={{ color: "#333" }}>No transactions logged yet.</div>
          ) : (
            periodTx.slice(0, 15).map((t, idx) => (
              <div
                key={t.id}
                style={{
                  padding: 16,
                  borderRadius: 16,
                  border: "none",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  background: "rgba(255,255,255,0.95)",
                  transition: "all 0.3s ease",
                  animation: `slideUp 0.3s ease-out ${idx * 0.05}s both`,
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                  backdropFilter: "blur(10px)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,1)";
                  e.currentTarget.style.transform = "translateX(6px) scale(1.02)";
                  e.currentTarget.style.boxShadow = "0 6px 20px rgba(102, 126, 234, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.95)";
                  e.currentTarget.style.transform = "translateX(0) scale(1)";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900, color: "#000" }}>{t.description}</div>
                  <div style={{ color: "#666", fontSize: 13 }}>{new Date(t.datetime).toLocaleString()}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 900, color: "#000" }}>{money(t.amount)}</div>
                  <button
                    onClick={() => deleteTransaction(t.id)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid #ff4444",
                      background: "#fff",
                      color: "#ff4444",
                      fontSize: 14,
                      cursor: "pointer",
                      fontWeight: 700,
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#ff4444";
                      e.currentTarget.style.color = "#fff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#fff";
                      e.currentTarget.style.color = "#ff4444";
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.6)",
            backdropFilter: "blur(5px)",
            padding: 16,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            display: "grid",
            alignItems: "start",
            justifyItems: "center",
            zIndex: 100,
          }}
          onClick={() => setShowSettings(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, calc(100% - 32px))",
              maxWidth: "100%",
              background: "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.95) 100%)",
              borderRadius: 24,
              border: "none",
              boxShadow: "0 20px 60px rgba(0,0,0,.3)",
              maxHeight: "calc(100vh - 32px)",
              display: "flex",
              flexDirection: "column",
              backdropFilter: "blur(20px)",
              margin: "16px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                  padding: 20,
                  borderBottom: "2px solid rgba(102, 126, 234, 0.2)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                position: "sticky",
                top: 0,
                  background: "linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)",
                zIndex: 2,
                  backdropFilter: "blur(10px)",
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
              }}
            >
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#000" }}>⚙️ Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  padding: "10px 14px",
                  minHeight: 40,
                  minWidth: 40,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  fontWeight: 800,
                  fontSize: "clamp(13px, 3vw, 14px)",
                  touchAction: "manipulation",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f5f5f5";
                  e.currentTarget.style.borderColor = "#667eea";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#fff";
                  e.currentTarget.style.borderColor = "#ddd";
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 16, overflowY: "auto" }}>
              <div style={{ padding: 20, border: "none", borderRadius: 16, background: "linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                <div style={{ fontWeight: 900, marginBottom: 12, fontSize: 18, color: "#000" }}>{activeBudget.label}</div>

                <label style={{ display: "block", fontWeight: 800, marginBottom: 8, fontSize: 14, color: "#333" }}>Label</label>
                <input
                  value={budgetLabelInput}
                  onChange={(e) => setBudgetLabelInput(e.target.value)}
                  style={{ width: "100%", padding: "16px 14px", minHeight: 44, borderRadius: 12, border: "2px solid #e0e0e0", fontSize: 16, background: "#fff", transition: "all 0.3s ease", boxSizing: "border-box" }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#667eea";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(102, 126, 234, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e0e0e0";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />

                <label style={{ display: "block", fontWeight: 800, marginTop: 16, marginBottom: 8, fontSize: 14, color: "#333" }}>Budget amount</label>
                <input
                  inputMode="decimal"
                  value={budgetAmountInput}
                  onChange={(e) => setBudgetAmountInput(e.target.value)}
                  style={{ width: "100%", padding: "16px 14px", minHeight: 44, borderRadius: 12, border: "2px solid #e0e0e0", fontSize: 16, background: "#fff", transition: "all 0.3s ease", boxSizing: "border-box" }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#667eea";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(102, 126, 234, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e0e0e0";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />

                <label style={{ display: "block", fontWeight: 800, marginTop: 16, marginBottom: 8, fontSize: 14, color: "#333" }}>
                  Reset days of month (1–28, comma-separated)
                </label>
                <input
                  value={budgetResetDaysInput}
                  onChange={(e) => setBudgetResetDaysInput(e.target.value)}
                  placeholder="1,15"
                  style={{ width: "100%", padding: "16px 14px", minHeight: 44, borderRadius: 12, border: "2px solid #e0e0e0", fontSize: 16, background: "#fff", transition: "all 0.3s ease", boxSizing: "border-box" }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#667eea";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(102, 126, 234, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e0e0e0";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                <div style={{ opacity: 0.7, marginTop: 8, fontSize: 13 }}>{resetDaysHelper}</div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                <button
                    onClick={manualReset}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      minHeight: 44,
                      borderRadius: 12,
                      border: "none",
                      background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                      color: "#fff",
                      fontWeight: 900,
                      fontSize: "clamp(14px, 3.5vw, 16px)",
                      touchAction: "manipulation",
                      boxShadow: "0 4px 15px rgba(79, 172, 254, 0.4)",
                      transition: "all 0.3s ease",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "0 6px 20px rgba(79, 172, 254, 0.6)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 4px 15px rgba(79, 172, 254, 0.4)";
                    }}
                  >
                    🔄 Reset Now
                  </button>
                  <button
                    onClick={() => deleteBudget(activeBudget.id)}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      minHeight: 44,
                      borderRadius: 12,
                      border: "none",
                      background: "linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)",
                      color: "#fff",
                      fontWeight: 900,
                      fontSize: "clamp(14px, 3.5vw, 16px)",
                      touchAction: "manipulation",
                      boxShadow: "0 4px 15px rgba(255, 107, 107, 0.4)",
                      transition: "all 0.3s ease",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "0 6px 20px rgba(255, 107, 107, 0.6)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 4px 15px rgba(255, 107, 107, 0.4)";
                    }}
                  >
                    🗑️ Delete Budget
                </button>
                </div>
              </div>
              </div>

            <div
              style={{
                padding: "16px 14px",
                borderTop: "2px solid rgba(102, 126, 234, 0.2)",
                position: "sticky",
                bottom: 0,
                background: "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.95) 100%)",
                zIndex: 2,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                borderBottomLeftRadius: 24,
                borderBottomRightRadius: 24,
                backdropFilter: "blur(10px)",
              }}
            >
              <button
                onClick={saveBudgetSettings}
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "16px 18px",
                  minHeight: 48,
                  borderRadius: 12,
                  border: "none",
                  background: saving ? "#888" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: "clamp(15px, 4vw, 16px)",
                  touchAction: "manipulation",
                  cursor: saving ? "not-allowed" : "pointer",
                  transition: "all 0.3s ease",
                  boxShadow: saving ? "none" : "0 4px 15px rgba(102, 126, 234, 0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
                onMouseEnter={(e) => {
                  if (!saving) {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 6px 20px rgba(102, 126, 234, 0.6)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!saving) {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 4px 15px rgba(102, 126, 234, 0.4)";
                  }
                }}
              >
                {saving ? (
                  <>
                    <LoadingSpinner size={16} />
                    <span>Saving...</span>
                  </>
                ) : (
                  "💾 Save Changes"
                )}
              </button>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  width: "100%",
                  padding: "16px 18px",
                  minHeight: 48,
                  borderRadius: 12,
                  border: "2px solid #e0e0e0",
                  background: "#fff",
                  fontWeight: 900,
                  fontSize: "clamp(15px, 4vw, 16px)",
                  touchAction: "manipulation",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f5f5f5";
                  e.currentTarget.style.borderColor = "#667eea";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#fff";
                  e.currentTarget.style.borderColor = "#e0e0e0";
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE BUDGET MODAL */}
      {showCreateBudget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.6)",
            backdropFilter: "blur(5px)",
            padding: 16,
            overflowY: "auto",
            display: "grid",
            alignItems: "start",
            justifyItems: "center",
            zIndex: 100,
          }}
          onClick={() => setShowCreateBudget(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              background: "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.95) 100%)",
              borderRadius: 24,
              border: "none",
              boxShadow: "0 20px 60px rgba(0,0,0,.3)",
              padding: 28,
              backdropFilter: "blur(20px)",
            }}
          >
            <h2 style={{ margin: "0 0 24px 0", fontSize: 24, fontWeight: 900, background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>✨ Create Budget</h2>

            <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Label</label>
            <input
              value={newBudgetLabel}
              onChange={(e) => setNewBudgetLabel(e.target.value)}
              placeholder="e.g., Groceries, Fun Money"
              style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd", fontSize: 16, marginBottom: 16 }}
            />

                <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Budget amount</label>
                <input
                  inputMode="decimal"
              value={newBudgetAmount}
              onChange={(e) => setNewBudgetAmount(e.target.value)}
              placeholder="300"
              style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd", fontSize: 16, marginBottom: 16 }}
            />

            <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>
                  Reset days of month (1–28, comma-separated)
                </label>
                <input
              value={newBudgetResetDays}
              onChange={(e) => setNewBudgetResetDays(e.target.value)}
                  placeholder="1,15"
              style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd", fontSize: 16, marginBottom: 8 }}
            />
            <div style={{ opacity: 0.7, marginBottom: 16, fontSize: 13 }}>
              {parseResetDays(newBudgetResetDays).length
                ? `Resets on days ${parseResetDays(newBudgetResetDays).join(", ")}.`
                : "Enter at least one reset day between 1 and 28."}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
                <button
                onClick={createBudget}
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "none",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 16,
                }}
              >
                Create
                </button>
              <button
                onClick={() => setShowCreateBudget(false)}
              style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                background: "#fff",
                  fontWeight: 900,
                  fontSize: 16,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast show={toast.show} text={toast.text} />
    </main>
  );
}
