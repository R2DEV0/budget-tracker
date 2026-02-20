// Type definitions for database entities

export type Budget = {
  id: string;
  label: string;
  budgetAmount: number;
  resetDays: number[]; // stored as JSON string in DB
  lastResetAt: string; // ISO date string
  createdAt: string;
  updatedAt: string;
};

export type Transaction = {
  id: string;
  budgetId: string;
  datetime: string; // ISO date string
  description: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
};

