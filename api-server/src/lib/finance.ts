import { and, desc, eq } from "drizzle-orm";
import { db, transactionsTable } from "@workspace/db";

export type FinanceTransaction = typeof transactionsTable.$inferSelect;

export function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function isInCurrentMonth(value: string): boolean {
  const { start, end } = currentMonthRange();
  return value >= start && value < end;
}

export async function getAllTransactions(): Promise<FinanceTransaction[]> {
  return db.select().from(transactionsTable).orderBy(desc(transactionsTable.date), desc(transactionsTable.createdAt));
}

export async function getRecentTransactions(limit = 6): Promise<FinanceTransaction[]> {
  return db.select().from(transactionsTable).orderBy(desc(transactionsTable.date), desc(transactionsTable.createdAt)).limit(limit);
}

export async function getTransactionById(id: number): Promise<FinanceTransaction | undefined> {
  const [transaction] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
  return transaction;
}

export function filterCurrentMonth(transactions: FinanceTransaction[]): FinanceTransaction[] {
  return transactions.filter((transaction) => isInCurrentMonth(transaction.date));
}

export function sumByType(transactions: FinanceTransaction[], type: "income" | "expense"): number {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function sumByCategory(transactions: FinanceTransaction[]): Array<{ category: string; amount: number }> {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + transaction.amount);
  }
  return Array.from(totals.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function transactionFilter(type?: "income" | "expense") {
  return type ? eq(transactionsTable.type, type) : undefined;
}