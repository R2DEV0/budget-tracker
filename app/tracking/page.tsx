"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Budget = {
  id: string;
  label: string;
  budgetAmount: number;
  resetDays: number[];
  lastResetAt: string;
};

type Transaction = {
  id: string;
  budgetId: string;
  datetime: string;
  description: string;
  amount: number;
};

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
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

export default function TrackingPage() {
  const router = useRouter();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [timeRange, setTimeRange] = useState<"week" | "month" | "3months" | "all">("month");

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
      const budgetsRes = await fetch("/api/budgets");
      const budgetsData = await budgetsRes.json();
      const budgetsWithResetDays = budgetsData.map((b: any) => ({
        ...b,
        resetDays: typeof b.resetDays === "string" ? JSON.parse(b.resetDays) : b.resetDays,
      }));
      setBudgets(budgetsWithResetDays);

      const txRes = await fetch("/api/transactions");
      const txData = await txRes.json();
      setTransactions(txData);

      setReady(true);
    } catch (error) {
      console.error("Error loading data:", error);
      setReady(true);
    }
  }

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    let cutoff: Date;

    switch (timeRange) {
      case "week":
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      case "3months":
        cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case "all":
        return transactions;
      default:
        cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }

    return transactions.filter((t) => new Date(t.datetime).getTime() >= cutoff.getTime());
  }, [transactions, timeRange]);

  // Group transactions by date
  const transactionsByDate = useMemo(() => {
    const grouped: Record<string, Transaction[]> = {};
    filteredTransactions.forEach((tx) => {
      const date = new Date(tx.datetime).toLocaleDateString();
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(tx);
    });
    return grouped;
  }, [filteredTransactions]);

  // Calculate spending per budget for current period
  const budgetStats = useMemo(() => {
    const now = new Date();
    return budgets.map((budget) => {
      const lastReset = getMostRecentBoundary(now, budget.resetDays);
      const periodTx = transactions.filter(
        (t) => t.budgetId === budget.id && new Date(t.datetime).getTime() >= lastReset.getTime()
      );
      const spent = periodTx.reduce((sum, t) => sum + t.amount, 0);
      const remaining = budget.budgetAmount - spent;
      const percentage = budget.budgetAmount > 0 ? (spent / budget.budgetAmount) * 100 : 0;

      return {
        budget,
        spent,
        remaining,
        percentage,
        transactionCount: periodTx.length,
      };
    });
  }, [budgets, transactions]);

  // Calculate daily spending totals
  const dailySpending = useMemo(() => {
    const daily: Record<string, number> = {};
    filteredTransactions.forEach((tx) => {
      const date = new Date(tx.datetime).toLocaleDateString();
      daily[date] = (daily[date] || 0) + tx.amount;
    });

    // Sort by date
    const sorted = Object.entries(daily).sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());
    return sorted;
  }, [filteredTransactions]);

  // Calculate spending by budget
  const spendingByBudget = useMemo(() => {
    const byBudget: Record<string, number> = {};
    filteredTransactions.forEach((tx) => {
      const budget = budgets.find((b) => b.id === tx.budgetId);
      const label = budget?.label || "Unknown";
      byBudget[label] = (byBudget[label] || 0) + tx.amount;
    });
    return Object.entries(byBudget).sort((a, b) => b[1] - a[1]);
  }, [filteredTransactions, budgets]);

  const totalSpent = useMemo(() => filteredTransactions.reduce((sum, t) => sum + t.amount, 0), [filteredTransactions]);
  const maxDaily = useMemo(() => Math.max(...dailySpending.map(([, amount]) => amount), 0), [dailySpending]);

  if (!authenticated) {
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: 16, fontFamily: "system-ui", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <p>Checking authentication...</p>
        </div>
      </main>
    );
  }

  if (!ready) {
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: 16, fontFamily: "system-ui", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <p>Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "12px 16px", fontFamily: "system-ui", minHeight: "100vh", paddingBottom: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "clamp(24px, 6vw, 32px)", fontWeight: 900, margin: 0, color: "#fff", flex: "1 1 auto", minWidth: 0 }}>📊 Tracking</h1>
        <button
          onClick={() => router.push("/")}
          style={{
            padding: "12px 16px",
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
          ← Back
        </button>
      </header>

      {/* Time range selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {(["week", "month", "3months", "all"] as const).map((range, idx) => {
          const colors = [
            "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
            "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
            "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
          ];
          const isActive = timeRange === range;
          return (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              style={{
                padding: "12px 16px",
                minHeight: 44,
                borderRadius: 999,
                border: "none",
                background: isActive ? colors[idx % colors.length] : "rgba(255,255,255,0.9)",
                color: isActive ? "#fff" : "#333",
                fontWeight: 900,
                fontSize: "clamp(13px, 3.5vw, 14px)",
                textTransform: "capitalize",
                transition: "all 0.3s ease",
                boxShadow: isActive ? "0 4px 15px rgba(0,0,0,0.3)" : "0 2px 8px rgba(0,0,0,0.1)",
                cursor: "pointer",
                touchAction: "manipulation",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "rgba(255,255,255,1)";
                  e.currentTarget.style.transform = "scale(1.05)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.9)";
                  e.currentTarget.style.transform = "scale(1)";
                }
              }}
            >
              {range === "3months" ? "3 Months" : range}
            </button>
          );
        })}
      </div>

      {/* Summary */}
      <div style={{ padding: 24, border: "none", borderRadius: 20, marginBottom: 24, background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", boxShadow: "0 8px 30px rgba(102, 126, 234, 0.4)", color: "#fff" }}>
        <div style={{ marginBottom: 6, fontSize: 14, fontWeight: 700, color: "#fff" }}>Total Spending ({timeRange})</div>
        <div style={{ fontSize: 42, fontWeight: 900, color: "#fff" }}>{money(totalSpent)}</div>
        <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: "#fff" }}>
          {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Budgets vs Spending */}
      <section style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 20, color: "#000" }}>💰 Budgets vs Spending</h2>
        <div style={{ display: "grid", gap: 16 }}>
          {budgetStats.map(({ budget, spent, remaining, percentage, transactionCount }, idx) => {
            const cardColors = [
              "linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%)",
              "linear-gradient(135deg, rgba(240, 147, 251, 0.15) 0%, rgba(245, 87, 108, 0.15) 100%)",
              "linear-gradient(135deg, rgba(79, 172, 254, 0.15) 0%, rgba(0, 242, 254, 0.15) 100%)",
              "linear-gradient(135deg, rgba(67, 233, 123, 0.15) 0%, rgba(56, 249, 215, 0.15) 100%)",
            ];
            return (
            <div key={budget.id} style={{ padding: 20, border: "none", borderRadius: 20, background: cardColors[idx % cardColors.length], boxShadow: "0 4px 15px rgba(0,0,0,0.1)", backdropFilter: "blur(10px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4, color: "#000" }}>{budget.label}</div>
                  <div style={{ color: "#666", fontSize: 14 }}>
                    {transactionCount} transaction{transactionCount !== 1 ? "s" : ""} this period
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 900, fontSize: 18, color: "#000" }}>{money(spent)}</div>
                  <div style={{ color: "#666", fontSize: 14 }}>of {money(budget.budgetAmount)}</div>
                </div>
              </div>

              {/* Progress bar */}
              <div
                style={{
                  width: "100%",
                  height: 16,
                  background: "rgba(0,0,0,0.5)",
                  borderRadius: 10,
                  overflow: "hidden",
                  marginBottom: 12,
                  boxShadow: "inset 0 3px 8px rgba(0,0,0,0.5)",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(percentage, 100)}%`,
                    height: "100%",
                    background: percentage > 100
                      ? "linear-gradient(90deg, #ff0000, #cc0000)"
                      : percentage > 80
                      ? "linear-gradient(90deg, #ff8800, #ffaa00)"
                      : "linear-gradient(90deg, #00aaff, #0088ff)",
                    transition: "width 0.5s ease",
                    borderRadius: 10,
                    boxShadow: "0 0 8px rgba(255,255,255,0.3)",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700 }}>
                <div style={{ color: "#000", fontWeight: 700 }}>
                  {percentage.toFixed(1)}% used
                </div>
                <div style={{ fontWeight: 800, color: remaining < 0 ? "#ff0000" : "#000" }}>
                  {remaining < 0 ? `Over by ${money(Math.abs(remaining))}` : `${money(remaining)} remaining`}
                </div>
              </div>
            </div>
          );
          })}
        </div>
      </section>

      {/* Spending by Budget */}
      {spendingByBudget.length > 0 && (
        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 20, color: "#000" }}>📈 Spending by Budget</h2>
          <div style={{ display: "grid", gap: 14 }}>
            {spendingByBudget.map(([label, amount], idx) => {
              const percentage = totalSpent > 0 ? (amount / totalSpent) * 100 : 0;
              const colors = [
                "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
              ];
              return (
                <div key={label} style={{ padding: 16, border: "none", borderRadius: 16, background: "rgba(255,255,255,0.95)", boxShadow: "0 4px 15px rgba(0,0,0,0.1)", backdropFilter: "blur(10px)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontWeight: 900 }}>{label}</div>
                    <div style={{ fontWeight: 900 }}>{money(amount)}</div>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: 16,
                      background: "rgba(0,0,0,0.5)",
                      borderRadius: 8,
                      overflow: "hidden",
                      boxShadow: "inset 0 3px 8px rgba(0,0,0,0.5)",
                    }}
                  >
                    <div
                      style={{
                        width: `${percentage}%`,
                        height: "100%",
                        background: colors[idx % colors.length],
                        transition: "width 0.5s ease",
                        borderRadius: 8,
                        boxShadow: "0 0 8px rgba(255,255,255,0.3)",
                      }}
                    />
                  </div>
                  <div style={{ color: "#000", fontSize: 12, marginTop: 8, fontWeight: 700 }}>{percentage.toFixed(1)}% of total</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Daily Spending Chart */}
      {dailySpending.length > 0 && (
        <section style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 20, color: "#000" }}>📅 Daily Spending</h2>
          <div style={{ padding: 24, border: "none", borderRadius: 20, background: "rgba(255,255,255,0.95)", boxShadow: "0 8px 30px rgba(0,0,0,0.15)", backdropFilter: "blur(10px)" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 200, marginBottom: 12 }}>
              {dailySpending.map(([date, amount]) => {
                const height = maxDaily > 0 ? (amount / maxDaily) * 100 : 0;
                return (
                  <div
                    key={date}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: `${height}%`,
                        minHeight: amount > 0 ? 4 : 0,
                        background: "linear-gradient(180deg, #667eea 0%, #764ba2 100%)",
                        borderRadius: "6px 6px 0 0",
                        transition: "height 0.5s ease",
                        boxShadow: "0 2px 8px rgba(102, 126, 234, 0.3)",
                      }}
                      title={`${date}: ${money(amount)}`}
                    />
                    <div style={{ fontSize: 10, color: "#666", writingMode: "vertical-rl", textOrientation: "mixed" }}>
                      {new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666" }}>
              <div>{dailySpending[0]?.[0]}</div>
              <div>{dailySpending[dailySpending.length - 1]?.[0]}</div>
            </div>
          </div>
        </section>
      )}

      {/* Recent Transactions */}
      <section>
        <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 20, color: "#000" }}>💳 Recent Transactions</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {filteredTransactions.slice(0, 10).length === 0 ? (
            <div style={{ color: "#333", padding: 24, textAlign: "center", background: "rgba(255,255,255,0.5)", borderRadius: 16, fontWeight: 600 }}>No transactions in this period</div>
          ) : (
            filteredTransactions.slice(0, 10).map((tx, idx) => {
              const budget = budgets.find((b) => b.id === tx.budgetId);
              return (
                <div
                  key={tx.id}
                  style={{
                    padding: 16,
                    borderRadius: 16,
                    border: "none",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    background: "rgba(255,255,255,0.95)",
                    boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
                    backdropFilter: "blur(10px)",
                    transition: "all 0.3s ease",
                    animation: `slideUp 0.3s ease-out ${idx * 0.05}s both`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateX(4px) scale(1.02)";
                    e.currentTarget.style.boxShadow = "0 6px 20px rgba(102, 126, 234, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateX(0) scale(1)";
                    e.currentTarget.style.boxShadow = "0 4px 15px rgba(0,0,0,0.1)";
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 900, color: "#000" }}>{tx.description}</div>
                    <div style={{ color: "#666", fontSize: 13 }}>
                      {budget?.label || "Unknown"} • {new Date(tx.datetime).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ fontWeight: 900, color: "#000" }}>{money(tx.amount)}</div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}

