import crypto from 'node:crypto';
import { privateRpc } from './privateRpc.js';

const familyDb = (operation, payload = {}) => privateRpc('family', operation, payload);
const isAdmin = (session) => session.access.role === 'superadmin' || session.access.permissions.includes('family.approve');

function money(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) { const error = new Error('El monto debe expresarse como un entero en la unidad mínima de la moneda.');error.status = 400;throw error; }
  return amount;
}

function visibleUserIds(session) { return [session.user.id]; }

export async function familyDashboard(session) {
  const admin = isAdmin(session);
  const { users = [], allowances = [], obligations = [], loans = [], payments = [], accounts = [], movements = [], notifications = [] } = await familyDb('dashboard', { user_id: session.user.id, admin }) || {};
  const allowedAllowanceIds = new Set((allowances || []).map((row) => row.id));
  const allowedLoanIds = new Set((loans || []).map((row) => row.id));
  const allowedAccountIds = new Set((accounts || []).map((row) => row.id));
  return {
    users: users || [],
    allowances: (allowances || []).map((row) => ({ ...row, obligations: (obligations || []).filter((item) => item.allowance_id === row.id) })),
    loans: (loans || []).map((row) => ({ ...row, payments: (payments || []).filter((item) => item.loan_id === row.id) })),
    expenseAccounts: (accounts || []).map((row) => ({ ...row, movements: (movements || []).filter((item) => item.account_id === row.id) })),
    notifications: notifications || [],
    scope: { admin, userIds: admin ? (users || []).map((row) => row.id) : visibleUserIds(session), allowanceIds: [...allowedAllowanceIds], loanIds: [...allowedLoanIds], accountIds: [...allowedAccountIds] }
  };
}

export async function createAllowance(session, input) {
  if (!isAdmin(session) && input.responsibleUserId !== session.user.id) { const error = new Error('No puedes crear una mesada a nombre de otra persona.');error.status = 403;throw error; }
  const frequency = String(input.frequency || 'monthly');
  if (!['weekly','biweekly','monthly','custom'].includes(frequency)) { const error = new Error('Frecuencia no válida.');error.status = 400;throw error; }
  const allowance = await familyDb('allowance_create', {
    beneficiary_user_id: input.beneficiaryUserId, responsible_user_id: input.responsibleUserId || session.user.id,
    amount_minor: money(input.amountMinor), currency: input.currency || 'CLP', frequency, pay_day: input.payDay || null,
    custom_interval_days: input.customIntervalDays || null, starts_on: input.startsOn, ends_on: input.endsOn || null,
    status: input.status || 'active', notes: input.notes || null, created_by: session.user.id
  });
  await notify(input.beneficiaryUserId, 'allowance_created', 'Mesada configurada', 'Se configuró una nueva mesada en MiSolar.', 'allowance', allowance?.id);
  await audit(session.user.id, 'allowance.created', 'allowance', allowance?.id, null, allowance);
  return allowance;
}

export async function generateAllowanceObligations() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
  const allowances = await familyDb('allowances_active', { today }) || [];
  let created = 0;
  for (const allowance of allowances || []) {
    const due = dueToday(allowance, today);
    if (!due) continue;
    const idempotencyKey = `allowance:${allowance.id}:${today}`;
    const result = await familyDb('obligation_create', { allowance_id: allowance.id, due_on: today, amount_minor: allowance.amount_minor, idempotency_key: idempotencyKey });
    if (result?.inserted) { created += 1;await notify(allowance.beneficiary_user_id, 'allowance_generated', 'Mesada generada', 'Se generó la obligación programada de tu mesada.', 'allowance_obligation', result.row.id); }
  }
  return { date: today, created };
}

function dueToday(allowance, today) {
  const current = new Date(`${today}T12:00:00Z`), start = new Date(`${allowance.starts_on}T12:00:00Z`);
  const days = Math.floor((current - start) / 86_400_000);
  if (days < 0) return false;
  if (allowance.frequency === 'weekly') return days % 7 === 0;
  if (allowance.frequency === 'biweekly') return days % 14 === 0;
  if (allowance.frequency === 'custom') return days % Math.max(1, Number(allowance.custom_interval_days || 1)) === 0;
  return current.getUTCDate() === Number(allowance.pay_day || start.getUTCDate());
}

export async function createExpenseMovement(session, input) {
  const account = await familyDb('account_get', { account_id: input.accountId });
  if (!account || (!isAdmin(session) && account.user_id !== session.user.id)) { const error = new Error('Cuenta de rendición no autorizada.');error.status = 403;throw error; }
  const income = money(input.incomeMinor || 0), expense = money(input.expenseMinor || 0);
  if ((income > 0) === (expense > 0)) { const error = new Error('El movimiento debe ser ingreso o gasto, pero no ambos.');error.status = 400;throw error; }
  const created = await familyDb('movement_create', { account_id: account.id, movement_date: input.date, detail: input.detail, income_minor: income, expense_minor: expense, currency: account.currency, status: input.status || 'pending', created_by: session.user.id });
  await audit(session.user.id, 'expense.created', 'expense_movement', created?.id, null, created);
  return created;
}

export async function createLoan(session, input) {
  if (!isAdmin(session) && input.lenderUserId !== session.user.id && input.borrowerUserId !== session.user.id) { const error = new Error('Debes participar en el préstamo.');error.status = 403;throw error; }
  if (input.lenderUserId === input.borrowerUserId) { const error = new Error('Prestamista y deudor deben ser distintos.');error.status = 400;throw error; }
  const loan = await familyDb('loan_create', { lender_user_id: input.lenderUserId, borrower_user_id: input.borrowerUserId, loan_date: input.date, original_amount_minor: money(input.amountMinor), currency: input.currency || 'CLP', detail: input.detail, due_date: input.dueDate || null, created_by: session.user.id });
  await Promise.all([
    notify(input.lenderUserId, 'loan_created', 'Préstamo registrado', 'Se registró un préstamo en el que participas.', 'family_loan', loan?.id),
    notify(input.borrowerUserId, 'loan_created', 'Préstamo registrado', 'Se registró un préstamo en el que participas.', 'family_loan', loan?.id),
    audit(session.user.id, 'loan.created', 'family_loan', loan?.id, null, loan)
  ]);
  return loan;
}

export async function recordLoanPayment(session, loanId, input) {
  const loan = await familyDb('loan_get', { loan_id: loanId });
  if (!loan || (!isAdmin(session) && ![loan.lender_user_id, loan.borrower_user_id].includes(session.user.id))) { const error = new Error('Préstamo no autorizado.');error.status = 403;throw error; }
  const amount = money(input.amountMinor);
  if (!amount) { const error = new Error('El pago debe ser mayor que cero.');error.status = 400;throw error; }
  if (amount > Number(loan.original_amount_minor) - Number(loan.paid_amount_minor) && !input.confirmOverpayment) { const error = new Error('El pago supera el saldo. Confirma explícitamente el excedente.');error.status = 409;throw error; }
  const result = await familyDb('loan_payment', { loan_id: Number(loanId), amount_minor: amount, payment_date: input.date, detail: input.detail || '', created_by: session.user.id, idempotency_key: input.idempotencyKey || crypto.randomUUID(), allow_overpayment: Boolean(input.confirmOverpayment) });
  await Promise.all([
    notify(loan.lender_user_id, 'loan_payment', 'Pago de préstamo registrado', 'Se registró un pago en un préstamo en el que participas.', 'family_loan', loan.id),
    notify(loan.borrower_user_id, 'loan_payment', 'Pago de préstamo registrado', 'Se registró un pago en un préstamo en el que participas.', 'family_loan', loan.id),
    audit(session.user.id, 'loan.payment_recorded', 'family_loan', loan.id, { paidAmountMinor: loan.paid_amount_minor }, result)
  ]);
  return result;
}

async function notify(userId, type, title, body, entityType, entityId) {
  if (!userId) return;
  await familyDb('notify', { user_id: userId, type, title, body, entity_type: entityType || '', entity_id: entityId == null ? '' : String(entityId) });
}

async function audit(actorUserId, action, entityType, entityId, beforeValues, afterValues) {
  await familyDb('audit', { actor_user_id: actorUserId || '', action, entity_type: entityType, entity_id: entityId == null ? '' : String(entityId), before_values: beforeValues, after_values: afterValues });
}
