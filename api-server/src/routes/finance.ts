import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, budgetsTable, debtsTable, goalsTable, transactionsTable } from "@workspace/db";
import {
  CreateBudgetBody,
  CreateBudgetResponse,
  CreateGoalBody,
  CreateGoalResponse,
  CreateTransactionBody,
  CreateTransactionResponse,
  CreateDebtBody,
  CreateDebtResponse,
  RecordDebtPaymentBody,
  RecordDebtPaymentQueryParams,
  RecordDebtPaymentResponse,
  DeleteBudgetQueryParams,
  DeleteDebtQueryParams,
  DeleteGoalQueryParams,
  DeleteTransactionQueryParams,
  GetDashboardResponse,
  ListBudgetsResponse,
  ListDebtsResponse,
  ListGoalsResponse,
  ListTransactionsQueryParams,
  ListTransactionsResponse,
  UpdateDebtBody,
  UpdateDebtQueryParams,
  UpdateDebtResponse,
  UpdateBudgetBody,
  UpdateBudgetQueryParams,
  UpdateBudgetResponse,
  UpdateGoalBody,
  UpdateGoalQueryParams,
  UpdateGoalResponse,
  UpdateTransactionBody,
  UpdateTransactionQueryParams,
  UpdateTransactionResponse,
} from "@workspace/api-zod";
import { filterCurrentMonth, getAllTransactions, getRecentTransactions, isInCurrentMonth, sumByCategory, sumByType } from "../lib/finance";

const router: IRouter = Router();

function debtResponse(debt: typeof debtsTable.$inferSelect) {
  return {
    ...debt,
    remainingAmount: Math.max(0, debt.originalAmount - debt.repaidAmount),
  };
}

router.get("/dashboard", async (_req, res): Promise<void> => {
  const [transactions, debts] = await Promise.all([
    getAllTransactions(),
    db.select().from(debtsTable),
  ]);
  const monthTransactions = filterCurrentMonth(transactions);
  const monthIncome = sumByType(monthTransactions, "income");
  const monthSpent = sumByType(monthTransactions, "expense");
  const currentBalance = sumByType(transactions, "income") - sumByType(transactions, "expense");
  const response = {
    currentBalance,
    monthIncome,
    monthSpent,
    monthChange: monthIncome - monthSpent,
    totalOwed: debts.reduce((total, debt) => total + Math.max(0, debt.originalAmount - debt.repaidAmount), 0),
    spendingByCategory: sumByCategory(monthTransactions.filter((transaction) => transaction.type === "expense")),
    recentTransactions: await getRecentTransactions(),
  };
  res.json(GetDashboardResponse.parse(response));
});

router.get("/transactions", async (req, res): Promise<void> => {
  const parsed = ListTransactionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { type, limit } = parsed.data;
  const transactions = await db
    .select()
    .from(transactionsTable)
    .where(type ? eq(transactionsTable.type, type) : undefined)
    .orderBy(desc(transactionsTable.date), desc(transactionsTable.createdAt))
    .limit(limit);
  res.json(ListTransactionsResponse.parse(transactions));
});

router.post("/transactions", async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [transaction] = await db.insert(transactionsTable).values({
    ...parsed.data,
    note: parsed.data.note ?? null,
    date: parsed.data.date.toISOString().slice(0, 10),
  }).returning();
  res.status(201).json(CreateTransactionResponse.parse(transaction));
});

router.patch("/transactions", async (req, res): Promise<void> => {
  const params = UpdateTransactionQueryParams.safeParse(req.query);
  const body = UpdateTransactionBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const { date, note, ...transactionFields } = body.data;
  const values = {
    ...transactionFields,
    ...(date !== undefined ? { date: date instanceof Date ? date.toISOString().slice(0, 10) : date } : {}),
    ...(note !== undefined ? { note: note ?? null } : {}),
  };
  const [transaction] = await db.update(transactionsTable).set(values).where(eq(transactionsTable.id, params.data.id)).returning();
  if (!transaction) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  res.json(UpdateTransactionResponse.parse(transaction));
});

router.delete("/transactions", async (req, res): Promise<void> => {
  const params = DeleteTransactionQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [transaction] = await db.delete(transactionsTable).where(eq(transactionsTable.id, params.data.id)).returning();
  if (!transaction) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/budgets", async (_req, res): Promise<void> => {
  const [budgets, transactions] = await Promise.all([
    db.select().from(budgetsTable).orderBy(budgetsTable.id),
    db.select().from(transactionsTable),
  ]);
  const monthExpenses = filterCurrentMonth(transactions).filter((transaction) => transaction.type === "expense");
  const response = budgets.map((budget) => ({
    ...budget,
    spent: monthExpenses.filter((transaction) => transaction.category === budget.category).reduce((sum, transaction) => sum + transaction.amount, 0),
  }));
  res.json(ListBudgetsResponse.parse(response));
});

router.post("/budgets", async (req, res): Promise<void> => {
  const parsed = CreateBudgetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [budget] = await db.insert(budgetsTable).values(parsed.data).returning();
  res.status(201).json(CreateBudgetResponse.parse({ ...budget, spent: 0 }));
});

router.patch("/budgets", async (req, res): Promise<void> => {
  const params = UpdateBudgetQueryParams.safeParse(req.query);
  const body = UpdateBudgetBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [budget] = await db.update(budgetsTable).set(body.data).where(eq(budgetsTable.id, params.data.id)).returning();
  if (!budget) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }
  res.json(UpdateBudgetResponse.parse({ ...budget, spent: 0 }));
});

router.delete("/budgets", async (req, res): Promise<void> => {
  const params = DeleteBudgetQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [budget] = await db.delete(budgetsTable).where(eq(budgetsTable.id, params.data.id)).returning();
  if (!budget) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/goals", async (_req, res): Promise<void> => {
  const goals = await db.select().from(goalsTable).orderBy(goalsTable.id);
  res.json(ListGoalsResponse.parse(goals));
});

router.post("/goals", async (req, res): Promise<void> => {
  const parsed = CreateGoalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [goal] = await db.insert(goalsTable).values({
    ...parsed.data,
    savedAmount: parsed.data.savedAmount ?? 0,
    deadline: parsed.data.deadline ? parsed.data.deadline.toISOString().slice(0, 10) : null,
  }).returning();
  res.status(201).json(CreateGoalResponse.parse(goal));
});

router.patch("/goals", async (req, res): Promise<void> => {
  const params = UpdateGoalQueryParams.safeParse(req.query);
  const body = UpdateGoalBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const { deadline, ...goalFields } = body.data;
  const values = {
    ...goalFields,
    ...(deadline !== undefined ? { deadline: deadline ? (deadline instanceof Date ? deadline.toISOString().slice(0, 10) : deadline) : null } : {}),
  };
  const [goal] = await db.update(goalsTable).set(values).where(eq(goalsTable.id, params.data.id)).returning();
  if (!goal) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }
  res.json(UpdateGoalResponse.parse(goal));
});

router.delete("/goals", async (req, res): Promise<void> => {
  const params = DeleteGoalQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [goal] = await db.delete(goalsTable).where(eq(goalsTable.id, params.data.id)).returning();
  if (!goal) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/debts", async (_req, res): Promise<void> => {
  const debts = await db.select().from(debtsTable).orderBy(desc(debtsTable.createdAt));
  res.json(ListDebtsResponse.parse(debts.map(debtResponse)));
});

router.post("/debts", async (req, res): Promise<void> => {
  const parsed = CreateDebtBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [debt] = await db.insert(debtsTable).values({
    person: parsed.data.person.trim(),
    originalAmount: parsed.data.originalAmount,
    repaidAmount: parsed.data.repaidAmount ?? 0,
    dueDate: parsed.data.dueDate ? (parsed.data.dueDate instanceof Date ? parsed.data.dueDate.toISOString().slice(0, 10) : parsed.data.dueDate) : null,
    note: parsed.data.note ?? null,
  }).returning();
  res.status(201).json(CreateDebtResponse.parse(debtResponse(debt)));
});

router.patch("/debts", async (req, res): Promise<void> => {
  const params = UpdateDebtQueryParams.safeParse(req.query);
  const body = UpdateDebtBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const { dueDate, note, ...debtFields } = body.data;
  const values = {
    ...debtFields,
    ...(dueDate !== undefined ? { dueDate: dueDate ? (dueDate instanceof Date ? dueDate.toISOString().slice(0, 10) : dueDate) : null } : {}),
    ...(note !== undefined ? { note: note ?? null } : {}),
  };
  if (values.person) values.person = values.person.trim();
  const [debt] = await db.update(debtsTable).set(values).where(eq(debtsTable.id, params.data.id)).returning();
  if (!debt) {
    res.status(404).json({ error: "Money owed record not found" });
    return;
  }
  res.json(UpdateDebtResponse.parse(debtResponse(debt)));
});

router.delete("/debts", async (req, res): Promise<void> => {
  const params = DeleteDebtQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [debt] = await db.delete(debtsTable).where(eq(debtsTable.id, params.data.id)).returning();
  if (!debt) {
    res.status(404).json({ error: "Money owed record not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/debts/payments", async (req, res): Promise<void> => {
  const params = RecordDebtPaymentQueryParams.safeParse(req.query);
  const body = RecordDebtPaymentBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [debt] = await tx.select().from(debtsTable).where(eq(debtsTable.id, params.data.id));
    if (!debt) return { kind: "not-found" as const };
    const remainingAmount = Math.max(0, debt.originalAmount - debt.repaidAmount);
    if (body.data.amount > remainingAmount) {
      return { kind: "too-large" as const, remainingAmount };
    }
    const [transaction] = await tx.insert(transactionsTable).values({
      type: "income",
      amount: body.data.amount,
      category: "Other",
      merchant: debt.person,
      note: body.data.note?.trim() || `Repayment from ${debt.person}`,
      date: body.data.date ? body.data.date.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    }).returning();
    const [updatedDebt] = await tx.update(debtsTable).set({
      repaidAmount: debt.repaidAmount + body.data.amount,
    }).where(eq(debtsTable.id, debt.id)).returning();
    return { kind: "ok" as const, debt: updatedDebt, transaction };
  });

  if (result.kind === "not-found") {
    res.status(404).json({ error: "Money owed record not found" });
    return;
  }
  if (result.kind === "too-large") {
    res.status(400).json({ error: `Payment cannot be greater than the remaining amount of ${result.remainingAmount}` });
    return;
  }
  res.status(201).json(RecordDebtPaymentResponse.parse({
    debt: debtResponse(result.debt),
    transaction: result.transaction,
  }));
});

export default router;