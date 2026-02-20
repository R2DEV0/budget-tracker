"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
function LoadingSpinner({ size = 24 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `3px solid rgba(255,255,255,0.3)`,
        borderTopColor: "#fff",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const url = isRegister ? "/api/auth/register" : "/api/auth/login";
      const body = isRegister ? { email, name, password } : { email, password };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(data.error || "Failed to authenticate");
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "system-ui", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}>
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#fff",
          borderRadius: 20,
          padding: 32,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 8px 0", textAlign: "center" }}>
          {isRegister ? "✨ Create Account" : "👋 Welcome Back"}
        </h1>
        <p style={{ textAlign: "center", opacity: 0.7, marginBottom: 24 }}>
          {isRegister ? "Start tracking your budgets" : "Sign in to your account"}
        </p>

        {error && (
          <div
            style={{
              padding: 12,
              background: "#fff5f5",
              border: "1px solid #ff4444",
              borderRadius: 8,
              color: "#ff4444",
              marginBottom: 16,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6, fontSize: 14 }}>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Your name"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  fontSize: 16,
                }}
              />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 700, marginBottom: 6, fontSize: 14 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "1px solid #ddd",
                fontSize: 16,
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontWeight: 700, marginBottom: 6, fontSize: 14 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="••••••"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "1px solid #ddd",
                fontSize: 16,
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: 14,
              borderRadius: 10,
              border: "none",
              background: loading ? "#888" : "#111",
              color: "#fff",
              fontWeight: 900,
              fontSize: 16,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.2s ease",
            }}
          >
            {loading ? (
              <>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    border: "3px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                <span>{isRegister ? "Creating..." : "Signing in..."}</span>
              </>
            ) : (
              isRegister ? "✨ Create Account" : "🚀 Sign In"
            )}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError("");
            }}
            style={{
              background: "none",
              border: "none",
              color: "#667eea",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {isRegister ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </main>
  );
}

