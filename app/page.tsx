"use client";

import { useEffect, useMemo, useState } from "react";

type Settings = {
  budgetAmount: number;
  resetDays: number[]; // 1–28
  lastResetAt: string; // ISO
};

type Tx = {
  id: string;
  datetime: string; // ISO
  description: string;
  amount: number; // can be + or -
};

const LS_SETTINGS = "bb_settings_v1";
const LS_TX = "bb_tx_v1";

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
    for (const day of days) {
      candidates.push(startOfDay(new Date(base.getFullYear(), base.getMonth(), day)));
    }
  }

  const past = candidates.filter((c) => c.getTime() <= now.getTime());
  past.sort((a, b) => b.getTime() - a.getTime());
  return past[0] ?? startOfDay(thisMonth);
}

function getNextBoundary(now: Date, resetDays: number[]): Date {
  const days = (resetDays.length ? resetDays : [1, 15]).slice().sort((a, b) => a - b);
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const candidates: Date[] = [];
  for (const base of [thisMonth, nextMonth]) {
    for (const day of days) {
      candidates.push(startOfDay(new Date(base.getFullYear(), base.getMonth(), day)));
    }
  }

  const future = candidates.filter((c) => c.getTime() > now.getTime());
  future.sort((a, b) => a.getTime() - b.getTime());
  return future[0] ?? startOfDay(nextMonth);
}

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/* ---------------- storage ---------------- */

function loadSettings(): Settings {
  const fallback: Settings = {
    budgetAmount: 300,
    resetDays: [1, 15],
    lastResetAt: new Date().toISOString(),
  };

  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (!raw) {
      const now = new Date();
      const last = getMostRecentBoundary(now, fallback.resetDays);
      const init: Settings = { ...fallback, lastResetAt: last.toISOString() };
      localStorage.setItem(LS_SETTINGS, JSON.stringify(init));
      return init;
    }

    const parsed = JSON.parse(raw) as Partial<Settings>;
    const budgetAmount = Number(parsed.budgetAmount);
    const resetDays = Array.isArray(parsed.resetDays)
      ? parsed.resetDays.map(Number).filter((d) => d >= 1 && d <= 28)
      : [1, 15];
    const lastResetAt = typeof parsed.lastResetAt === "string" ? parsed.lastResetAt : new Date().toISOString();

    return {
      budgetAmount: Number.isFinite(budgetAmount) ? budgetAmount : 300,
      resetDays: resetDays.length ? Array.from(new Set(resetDays)).sort((a, b) => a - b) : [1, 15],
      lastResetAt,
    };
  } catch {
    return fallback;
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

/* ---------------- settings modal ---------------- */

function SettingsModal({
  open,
  onClose,
  budgetInput,
  setBudgetInput,
  resetDaysInput,
  setResetDaysInput,
  onSave,
  helperText,
}: {
  open: boolean;
  onClose: () => void;
  budgetInput: string;
  setBudgetInput: (v: string) => void;
  resetDaysInput: string;
  setResetDaysInput: (v: string) => void;
  onSave: () => void;
  helperText: string;
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #eee",
          padding: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Settings</h2>
          <button
            onClick={onClose}
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

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Budget amount</label>
          <input
            inputMode="decimal"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #ddd",
              fontSize: 16,
            }}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>
            Reset days of month (1–28, comma-separated)
          </label>
          <input
            value={resetDaysInput}
            onChange={(e) => setResetDaysInput(e.target.value)}
            placeholder="1,15"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #ddd",
              fontSize: 16,
            }}
          />
        </div>

        <div style={{ opacity: 0.7, marginTop: 10, fontSize: 13 }}>{helperText}</div>

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button
            onClick={onSave}
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
            onClick={onClose}
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
  const [budgetInput, setBudgetInput] = useState("");
  const [resetDaysInput, setResetDaysInput] = useState("");

  const [toast, setToast] = useState(false);

  useEffect(() => {
    const s = loadSettings();
    const list = loadTx();

    // Auto-reset check
    const now = new Date();
    const next = getNextBoundary(new Date(s.lastResetAt), s.resetDays);

    if (now.getTime() >= next.getTime()) {
      const last = getMostRecentBoundary(now, s.resetDays);
      const updated: Settings = { ...s, lastResetAt: last.toISOString() };
      saveSettings(updated);
      saveTx([]);
      setSettings(updated);
      setTx([]);
      setBudgetInput(String(updated.budgetAmount));
      setResetDaysInput(updated.resetDays.join(","));
      setReady(true);
      return;
    }

    setSettings(s);
    setTx(list);
    setBudgetInput(String(s.budgetAmount));
    setResetDaysInput(s.resetDays.join(","));
    setReady(true);
  }, []);

  const periodTx = useMemo(() => {
    if (!settings) return [];
    const cutoff = new Date(settings.lastResetAt).getTime();
    return tx.filter((t) => new Date(t.datetime).getTime() >= cutoff);
  }, [tx, settings]);

  const spent = useMemo(() => periodTx.reduce((sum, t) => sum + t.amount, 0), [periodTx]);
  const remaining = useMemo(() => (settings ? settings.budgetAmount - spent : 0), [settings, spent]);

  const nextReset = useMemo(() => {
    if (!settings) return null;
    return getNextBoundary(new Date(), settings.resetDays);
  }, [settings]);

  function addTx() {
    const amount = Number(amt);

    // allow negatives, disallow 0 and NaN
    if (!desc.trim()) return;
    if (!Number.isFinite(amount) || amount === 0) return;

    const item: Tx = {
      id: crypto.randomUUID(),
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

  function manualReset() {
    if (!settings) return;
    const now = new Date();
    const last = getMostRecentBoundary(now, settings.resetDays);
    const updated: Settings = { ...settings, lastResetAt: last.toISOString() };

    saveSettings(updated);
    saveTx([]);
    setSettings(updated);
    setTx([]);
  }

  function saveSettingsClick() {
    if (!settings) return;

    const budget = Number(budgetInput);
    const days = parseResetDays(resetDaysInput);

    if (!Number.isFinite(budget) || budget < 0) return;
    if (!days.length) return;

    const updated: Settings = { ...settings, budgetAmount: budget, resetDays: days };
    saveSettings(updated);
    setSettings(updated);

    setToast(true);
    window.setTimeout(() => setToast(false), 1600);
  }

  const helperText = useMemo(() => {
    const days = parseResetDays(resetDaysInput);
    if (!days.length) return "Enter at least one reset day between 1 and 28.";
    if (days.length === 1) return `Budget resets monthly on day ${days[0]}.`;
    return `Budget resets on days ${days.join(", ")}.`;
  }, [resetDaysInput]);

  if (!ready || !settings) return null;

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Budget</h1>
        <button
          onClick={() => setShowSettings(true)}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
            fontWeight: 900,
          }}
        >
          Settings
        </button>
      </header>

      <div style={{ marginTop: 10, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ opacity: 0.7 }}>Remaining</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{money(remaining)}</div>
          </div>
          <div>
            <div style={{ opacity: 0.7 }}>Net this period</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{money(spent)}</div>
          </div>
        </div>

        <div style={{ opacity: 0.7, marginTop: 8, fontSize: 13 }}>
          Period started: <b>{new Date(settings.lastResetAt).toLocaleString()}</b>
          {nextReset ? (
            <>
              {" "}
              — Next reset: <b>{nextReset.toLocaleString()}</b>
            </>
          ) : null}
        </div>

        <button
          onClick={manualReset}
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
            fontWeight: 900,
          }}
        >
          Manual Reset
        </button>
      </div>

      <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 900, marginBottom: 8 }}>Log spending</h2>
        <input
          placeholder="What did you spend on?"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd", fontSize: 16 }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginTop: 10 }}>
          <input
            inputMode="decimal"
            placeholder="Amount (use negative for refunds)"
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
        <div style={{ opacity: 0.7, marginTop: 8, fontSize: 13 }}>
          Transactions are saved locally on this device.
        </div>
      </section>

      <section style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 900 }}>This period</h2>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {periodTx.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No spending logged yet.</div>
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

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        budgetInput={budgetInput}
        setBudgetInput={setBudgetInput}
        resetDaysInput={resetDaysInput}
        setResetDaysInput={setResetDaysInput}
        onSave={saveSettingsClick}
        helperText={helperText}
      />

      <Toast show={toast} text="Saved" />
    </main>
  );
}
