"use client";

import { useEffect, useMemo, useState } from "react";

type CategoryKey = "fun" | "groceries";

type CategorySettings = {
  label: string;
  budgetAmount: number;
  resetDays: number[]; // 1–28
  lastResetAt: string; // ISO
};

type Settings = {
  activeCategory: CategoryKey;
  categories: Record<CategoryKey, CategorySettings>;
};

type Tx = {
  id: string;
  category: CategoryKey;
  datetime: string; // ISO
  description: string;
  amount: number; // can be + or -
};

const LS_SETTINGS = "bb_settings_multi_v1";
const LS_TX = "bb_tx_multi_v1";

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
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 28);
  return Array.from(new Set(days)).sort((a, b) => a - b);
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

/* ---------------- storage ---------------- */

function defaultSettings(): Settings {
  const now = new Date();
  const funDays = [1, 15];
  const grocDays = [1, 15];

  return {
    activeCategory: "fun",
    categories: {
      fun: {
        label: "Fun Money",
        budgetAmount: 200,
        resetDays: funDays,
        lastResetAt: getMostRecentBoundary(now, funDays).toISOString(),
      },
      groceries: {
        label: "Groceries",
        budgetAmount: 250,
        resetDays: grocDays,
        lastResetAt: getMostRecentBoundary(now, grocDays).toISOString(),
      },
    },
  };
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (!raw) {
      const init = defaultSettings();
      localStorage.setItem(LS_SETTINGS, JSON.stringify(init));
      return init;
    }
    const parsed = JSON.parse(raw) as Partial<Settings>;

    const init = defaultSettings();
    const activeCategory: CategoryKey =
      parsed.activeCategory === "groceries" || parsed.activeCategory === "fun" ? parsed.activeCategory : init.activeCategory;

    const cat = (k: CategoryKey): CategorySettings => {
      const p = (parsed.categories as any)?.[k] ?? {};
      const budgetAmount = Number(p.budgetAmount);
      const resetDays = Array.isArray(p.resetDays)
        ? p.resetDays.map(Number).filter((d: number) => d >= 1 && d <= 28)
        : init.categories[k].resetDays;
      const lastResetAt = typeof p.lastResetAt === "string" ? p.lastResetAt : init.categories[k].lastResetAt;

      return {
        label: typeof p.label === "string" ? p.label : init.categories[k].label,
        budgetAmount: Number.isFinite(budgetAmount) ? budgetAmount : init.categories[k].budgetAmount,
        resetDays: resetDays.length ? Array.from(new Set(resetDays)).sort((a, b) => a - b) : init.categories[k].resetDays,
        lastResetAt,
      };
    };

    return {
      activeCategory,
      categories: {
        fun: cat("fun"),
        groceries: cat("groceries"),
      },
    };
  } catch {
    const init = defaultSettings();
    localStorage.setItem(LS_SETTINGS, JSON.stringify(init));
    return init;
  }
}

function saveSettings(s: Settings) {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
}

function loadTx(): Tx[] {
  try {
    const raw = localStorage.getItem(LS_TX);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Tx[]) : [];
  } catch {
    return [];
  }
}

function saveTx(list: Tx[]) {
  localStorage.setItem(LS_TX, JSON.stringify(list));
}

/* ---------------- toast ---------------- */

function Toast({ show, text }: { show: boolean; text: string }) {
  if (!show) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#111",
        color: "#fff",
        padding: "10px 16px",
        borderRadius: 999,
        fontWeight: 700,
        boxShadow: "0 10px 30px rgba(0,0,0,.25)",
      }}
    >
      {text}
    </div>
  );
}

/* ---------------- page ---------------- */

export default function Page() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tx, setTx] = useState<Tx[]>([]);

  const [desc, setDesc] = useState("");
  const [amt, setAmt] = useState("");

  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState(false);

  // settings inputs (per category)
  const [funBudgetInput, setFunBudgetInput] = useState("");
  const [funResetDaysInput, setFunResetDaysInput] = useState("");
  const [grocBudgetInput, setGrocBudgetInput] = useState("");
  const [grocResetDaysInput, setGrocResetDaysInput] = useState("");

  useEffect(() => {
    const s = loadSettings();
    const list = loadTx();
    const now = new Date();

    const updated: Settings = typeof structuredClone === "function" ? structuredClone(s) : JSON.parse(JSON.stringify(s));

    (Object.keys(updated.categories) as CategoryKey[]).forEach((k) => {
      const c = updated.categories[k];
      const next = getNextBoundary(new Date(c.lastResetAt), c.resetDays);
      if (now.getTime() >= next.getTime()) {
        const last = getMostRecentBoundary(now, c.resetDays);
        c.lastResetAt = last.toISOString();
      }
    });

    saveSettings(updated);

    setSettings(updated);
    setTx(list);

    setFunBudgetInput(String(updated.categories.fun.budgetAmount));
    setFunResetDaysInput(updated.categories.fun.resetDays.join(","));
    setGrocBudgetInput(String(updated.categories.groceries.budgetAmount));
    setGrocResetDaysInput(updated.categories.groceries.resetDays.join(","));

    setReady(true);
  }, []);

  const activeCategory: CategoryKey = settings?.activeCategory ?? "fun";
  const active = settings?.categories[activeCategory];

  const periodTx = useMemo(() => {
    if (!settings) return [];
    const cutoff = new Date(settings.categories[activeCategory].lastResetAt).getTime();
    return tx
      .filter((t) => t.category === activeCategory)
      .filter((t) => new Date(t.datetime).getTime() >= cutoff)
      .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());
  }, [tx, settings, activeCategory]);

  const net = useMemo(() => periodTx.reduce((sum, t) => sum + t.amount, 0), [periodTx]);
  const remaining = useMemo(() => (active ? active.budgetAmount - net : 0), [active, net]);

  const nextReset = useMemo(() => {
    if (!active) return null;
    return getNextBoundary(new Date(), active.resetDays);
  }, [active]);

  function setActiveCategory(k: CategoryKey) {
    if (!settings) return;
    const updated = { ...settings, activeCategory: k };
    saveSettings(updated);
    setSettings(updated);
  }

  function addTx() {
    if (!settings) return;

    const amount = Number(amt);
    if (!desc.trim()) return;
    if (!Number.isFinite(amount) || amount === 0) return;

    const item: Tx = {
      id: crypto.randomUUID(),
      category: activeCategory,
      datetime: new Date().toISOString(),
      description: desc.trim(),
      amount,
    };

    const nextList = [item, ...tx];
    setTx(nextList);
    saveTx(nextList);

    setDesc("");
    setAmt("");
  }

  function toastSaved() {
    setToast(true);
    window.setTimeout(() => setToast(false), 1400);
  }

  function saveAllSettings() {
    if (!settings) return;

    const funBudget = Number(funBudgetInput);
    const funDays = parseResetDays(funResetDaysInput);
    const grocBudget = Number(grocBudgetInput);
    const grocDays = parseResetDays(grocResetDaysInput);

    if (!Number.isFinite(funBudget) || funBudget < 0) return;
    if (!funDays.length) return;

    if (!Number.isFinite(grocBudget) || grocBudget < 0) return;
    if (!grocDays.length) return;

    const updated: Settings = {
      ...settings,
      categories: {
        ...settings.categories,
        fun: { ...settings.categories.fun, budgetAmount: funBudget, resetDays: funDays },
        groceries: { ...settings.categories.groceries, budgetAmount: grocBudget, resetDays: grocDays },
      },
    };

    saveSettings(updated);
    setSettings(updated);
    toastSaved();
    setShowSettings(false);
  }

  function manualReset(category: CategoryKey) {
    if (!settings) return;
    const now = new Date();
    const c = settings.categories[category];
    const last = getMostRecentBoundary(now, c.resetDays);

    const updated: Settings = {
      ...settings,
      categories: {
        ...settings.categories,
        [category]: { ...c, lastResetAt: last.toISOString() },
      },
    };

    saveSettings(updated);
    setSettings(updated);
    toastSaved();
  }

  const funHelper = useMemo(() => {
    const days = parseResetDays(funResetDaysInput);
    if (!days.length) return "Enter at least one reset day between 1 and 28.";
    if (days.length === 1) return `Resets monthly on day ${days[0]}.`;
    return `Resets on days ${days.join(", ")}.`;
  }, [funResetDaysInput]);

  const grocHelper = useMemo(() => {
    const days = parseResetDays(grocResetDaysInput);
    if (!days.length) return "Enter at least one reset day between 1 and 28.";
    if (days.length === 1) return `Resets monthly on day ${days[0]}.`;
    return `Resets on days ${days.join(", ")}.`;
  }, [grocResetDaysInput]);

  if (!ready || !settings || !active) return null;

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{active.label}</h1>
        <button
          onClick={() => setShowSettings(true)}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", background: "#fff", fontWeight: 900 }}
        >
          Settings
        </button>
      </header>

      {/* category switch */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {(["fun", "groceries"] as CategoryKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setActiveCategory(k)}
            style={{
              padding: "10px 12px",
              borderRadius: 999,
              border: "1px solid #ddd",
              background: k === activeCategory ? "#111" : "#fff",
              color: k === activeCategory ? "#fff" : "#111",
              fontWeight: 900,
            }}
          >
            {settings.categories[k].label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 10, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ opacity: 0.7 }}>Remaining</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{money(remaining)}</div>
          </div>
          <div>
            <div style={{ opacity: 0.7 }}>Net this period</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{money(net)}</div>
          </div>
        </div>

        <div style={{ opacity: 0.7, marginTop: 8, fontSize: 13 }}>
          Period started: <b>{new Date(active.lastResetAt).toLocaleString()}</b>
          {nextReset ? (
            <>
              {" "}
              — Next reset: <b>{nextReset.toLocaleString()}</b>
            </>
          ) : null}
        </div>
      </div>

      <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 900, marginBottom: 8 }}>Log transaction</h2>
        <input
          placeholder="Description"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd", fontSize: 16 }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginTop: 10 }}>
          <input
            inputMode="decimal"
            placeholder="Amount (negative for refunds)"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd", fontSize: 16 }}
          />
          <button
            onClick={addTx}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "none",
              background: "#111",
              color: "#fff",
              fontWeight: 900,
              fontSize: 16,
              whiteSpace: "nowrap",
            }}
          >
            Add
          </button>
        </div>
        <div style={{ opacity: 0.7, marginTop: 8, fontSize: 13 }}>Transactions are saved locally on this device.</div>
      </section>

      <section style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 900 }}>This period</h2>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {periodTx.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No transactions logged yet.</div>
          ) : (
            periodTx.slice(0, 15).map((t) => (
              <div
                key={t.id}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #eee",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 900 }}>{t.description}</div>
                  <div style={{ opacity: 0.7, fontSize: 13 }}>{new Date(t.datetime).toLocaleString()}</div>
                </div>
                <div style={{ fontWeight: 900 }}>{money(t.amount)}</div>
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
            background: "rgba(0,0,0,.45)",
            padding: 16,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            display: "grid",
            alignItems: "start",
            justifyItems: "center",
          }}
          onClick={() => setShowSettings(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #eee",
              boxShadow: "0 20px 60px rgba(0,0,0,.25)",
              maxHeight: "calc(100vh - 32px)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* header */}
            <div
              style={{
                padding: 16,
                borderBottom: "1px solid #eee",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                position: "sticky",
                top: 0,
                background: "#fff",
                zIndex: 2,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  fontWeight: 800,
                }}
              >
                Close
              </button>
            </div>

            {/* body */}
            <div style={{ padding: 16, overflowY: "auto" }}>
              {/* Fun */}
              <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>{settings.categories.fun.label}</div>

                <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Budget amount</label>
                <input
                  inputMode="decimal"
                  value={funBudgetInput}
                  onChange={(e) => setFunBudgetInput(e.target.value)}
                  style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd", fontSize: 16 }}
                />

                <label style={{ display: "block", fontWeight: 800, marginTop: 10, marginBottom: 6 }}>
                  Reset days of month (1–28, comma-separated)
                </label>
                <input
                  value={funResetDaysInput}
                  onChange={(e) => setFunResetDaysInput(e.target.value)}
                  placeholder="1,15"
                  style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd", fontSize: 16 }}
                />
                <div style={{ opacity: 0.7, marginTop: 8, fontSize: 13 }}>{funHelper}</div>

                <button
                  onClick={() => manualReset("fun")}
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "#fff",
                    fontWeight: 900,
                  }}
                >
                  Manual reset
                </button>
              </div>

              {/* Groceries */}
              <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>{settings.categories.groceries.label}</div>

                <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Budget amount</label>
                <input
                  inputMode="decimal"
                  value={grocBudgetInput}
                  onChange={(e) => setGrocBudgetInput(e.target.value)}
                  style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd", fontSize: 16 }}
                />

                <label style={{ display: "block", fontWeight: 800, marginTop: 10, marginBottom: 6 }}>
                  Reset days of month (1–28, comma-separated)
                </label>
                <input
                  value={grocResetDaysInput}
                  onChange={(e) => setGrocResetDaysInput(e.target.value)}
                  placeholder="1,15"
                  style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd", fontSize: 16 }}
                />
                <div style={{ opacity: 0.7, marginTop: 8, fontSize: 13 }}>{grocHelper}</div>

                <button
                  onClick={() => manualReset("groceries")}
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "#fff",
                    fontWeight: 900,
                  }}
                >
                  Manual reset
                </button>
              </div>

              <div style={{ opacity: 0.7, marginTop: 12, fontSize: 13 }}>
                Settings and transactions are saved locally on this device.
              </div>
            </div>

            {/* footer */}
            <div
              style={{
                padding: 16,
                borderTop: "1px solid #eee",
                position: "sticky",
                bottom: 0,
                background: "#fff",
                zIndex: 2,
                display: "flex",
                gap: 10,
              }}
            >
              <button
                onClick={saveAllSettings}
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
                Save
              </button>
              <button
                onClick={() => setShowSettings(false)}
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

      <Toast show={toast} text="Saved" />
    </main>
  );
}