import { createClient } from "@libsql/client";

// For local development, use file-based SQLite
// For production with Turso, set TURSO_DB_URL and TURSO_AUTH_TOKEN environment variables
const client = createClient({
  url: process.env.TURSO_DB_URL || "file:./dev.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Initialize database schema
export async function initDb() {
  const isTurso = process.env.TURSO_DB_URL && !process.env.TURSO_DB_URL.startsWith("file:");
  
  // For Turso (remote), we can't use SQLite datetime() function, so we'll handle defaults in application code
  // For local SQLite, we can use datetime('now')
  const defaultTimestamp = isTurso ? "''" : "(datetime('now'))";
  
  // Users table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT ${defaultTimestamp},
      updatedAt TEXT NOT NULL DEFAULT ${defaultTimestamp}
    )
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
  `);

  // Budgets table with userId (nullable for migration)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      userId TEXT,
      label TEXT NOT NULL,
      budgetAmount REAL NOT NULL,
      resetDays TEXT NOT NULL,
      lastResetAt TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT ${defaultTimestamp},
      updatedAt TEXT NOT NULL DEFAULT ${defaultTimestamp}
    )
  `);

  // Try to add userId column if it doesn't exist (for existing databases)
  try {
    await client.execute("ALTER TABLE budgets ADD COLUMN userId TEXT");
  } catch {
    // Column already exists, ignore
  }

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_budgets_userId ON budgets(userId)
  `);

  // Transactions table (already has budgetId which links to budgets which links to users)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      budgetId TEXT NOT NULL,
      datetime TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      createdAt TEXT NOT NULL DEFAULT ${defaultTimestamp},
      updatedAt TEXT NOT NULL DEFAULT ${defaultTimestamp},
      FOREIGN KEY (budgetId) REFERENCES budgets(id) ON DELETE CASCADE
    )
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_transactions_budgetId ON transactions(budgetId)
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_transactions_datetime ON transactions(datetime)
  `);
}

export const db = client;
