import crypto from 'node:crypto';
import { privateRpc } from './privateRpc.js';
import { validateFinancialImage } from './financialReceiptAi.js';

const BUCKET = 'family-finance-documents';

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
  const { users = [], allowances = [], obligations = [], allowance_payments: allowancePayments = [], loans = [], payments = [], accounts = [], movements = [], attachments = [], notifications = [] } = await familyDb('dashboard', { user_id: session.user.id, admin }) || {};
  const allowedAllowanceIds = new Set((allowances || []).map((row) => row.id));
  const allowedLoanIds = new Set((loans || []).map((row) => row.id));
  const allowedAccountIds = new Set((accounts || []).map((row) => row.id));
  return {
    users: users || [],
    allowances: (allowances || []).map((row) => ({ ...row, obligations: (obligations || []).filter((item) => item.allowance_id === row.id).map((item) => ({ ...item, payments: allowancePayments.filter((payment) => payment.obligation_id === item.id) })) })),
    loans: (loans || []).map((row) => ({ ...row, attachments: entityAttachments(attachments, 'family_loan', row.id), payments: (payments || []).filter((item) => item.loan_id === row.id).map((item) => ({ ...item, attachments: entityAttachments(attachments, 'loan_payment', item.id) })) })),
    expenseAccounts: (accounts || []).map((row) => ({ ...row, movements: (movements || []).filter((item) => item.account_id === row.id).map((item) => ({ ...item, attachments: entityAttachments(attachments, 'expense_movement', item.id) })) })),
    notifications: notifications || [],
    scope: { admin, userIds: admin ? (users || []).map((row) => row.id) : visibleUserIds(session), allowanceIds: [...allowedAllowanceIds], loanIds: [...allowedLoanIds], accountIds: [...allowedAccountIds] }
  };
}

export async function createAllowance(session, input) {
  if (!isAdmin(session) && input.responsibleUserId !== session.user.id) { const error = new Error('No puedes crear una mesada a nombre de otra persona.');error.status = 403;throw error; }
  const frequency = String(input.frequency || 'monthly');
  if (!['weekly','biweekly','monthly','custom'].includes(frequency)) { const error = new Error('Frecuencia no válida.');error.status = 400;throw error; }
  const payDay = Number(input.payDay);
  if (frequency === 'weekly' && (!Number.isInteger(payDay) || payDay < 1 || payDay > 7)) { const error = new Error('Selecciona un día de la semana.');error.status = 400;throw error; }
  if (frequency === 'monthly' && (!Number.isInteger(payDay) || payDay < 1 || payDay > 31)) { const error = new Error('Selecciona un día del mes entre 1 y 31.');error.status = 400;throw error; }
  const allowance = await familyDb('allowance_create', {
    beneficiary_user_id: input.beneficiaryUserId, responsible_user_id: input.responsibleUserId || session.user.id,
    amount_minor: money(input.amountMinor), currency: input.currency || 'CLP', frequency, pay_day: payDay || null,
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

export function dueToday(allowance, today) {
  const current = new Date(`${today}T12:00:00Z`), start = new Date(`${allowance.starts_on}T12:00:00Z`);
  const days = Math.floor((current - start) / 86_400_000);
  if (days < 0) return false;
  if (allowance.frequency === 'weekly') return (current.getUTCDay() || 7) === Number(allowance.pay_day || (start.getUTCDay() || 7));
  if (allowance.frequency === 'biweekly') return days % 14 === 0;
  if (allowance.frequency === 'custom') return days % Math.max(1, Number(allowance.custom_interval_days || 1)) === 0;
  return current.getUTCDate() === Number(allowance.pay_day || start.getUTCDate());
}

export async function createExpenseMovement(session, input) {
  const account = await familyDb('account_get', { account_id: input.accountId });
  if (!account || (!isAdmin(session) && account.user_id !== session.user.id)) { const error = new Error('Cuenta de rendición no autorizada.');error.status = 403;throw error; }
  const income = money(input.incomeMinor || 0), expense = money(input.expenseMinor || 0);
  if ((income > 0) === (expense > 0)) { const error = new Error('El movimiento debe ser ingreso o gasto, pero no ambos.');error.status = 400;throw error; }
  if (!input.image) { const error = new Error('Adjunta una fotografía del comprobante.');error.status = 400;throw error; }
  const attachment = await uploadFinancialImage(session.user.id, 'movements', input.image);
  let created;
  try {
    created = await familyDb('movement_create', { account_id: account.id, movement_date: input.date, detail: input.detail, income_minor: income, expense_minor: expense, currency: account.currency, movement_type: input.movementType || (expense ? 'expense_report' : 'deposit'), depositor_user_id: input.depositorUserId, recipient_user_id: input.recipientUserId, merchant_name: input.merchant || '', created_by: session.user.id, attachment, ai_proposal: input.aiProposal || undefined, ai_model: input.aiModel || '', corrected_values: input.correctedValues || {} });
  } catch (error) { await removeStored(attachment.storage_path);throw error; }
  const movementRow = created?.record || created;
  await audit(session.user.id, 'expense.created', 'expense_movement', movementRow?.id, null, created);
  const admins = await adminUsers();
  await Promise.all(admins.map((user) => notify(user.id, 'expense_pending', 'Rendición pendiente', `${input.detail}: requiere revisión.`, 'expense_movement', movementRow?.id)));
  return created;
}

export async function createLoan(session, input) {
  if (!isAdmin(session) && input.lenderUserId !== session.user.id && input.borrowerUserId !== session.user.id) { const error = new Error('Debes participar en el préstamo.');error.status = 403;throw error; }
  if (input.lenderUserId === input.borrowerUserId) { const error = new Error('Prestamista y deudor deben ser distintos.');error.status = 400;throw error; }
  if (!input.image) { const error = new Error('Adjunta una fotografía del comprobante del préstamo.');error.status = 400;throw error; }
  const attachment = await uploadFinancialImage(session.user.id, 'loans', input.image);
  let loan;
  try { loan = await familyDb('loan_create', { lender_user_id: input.lenderUserId, borrower_user_id: input.borrowerUserId, loan_date: input.date, original_amount_minor: money(input.amountMinor), currency: input.currency || 'CLP', detail: input.detail, due_date: input.dueDate || null, created_by: session.user.id, attachment, ai_proposal: input.aiProposal || undefined, ai_model: input.aiModel || '', corrected_values: input.correctedValues || {} }); }
  catch (error) { await removeStored(attachment.storage_path);throw error; }
  const loanRow = loan?.record || loan;
  await Promise.all([
    notify(input.lenderUserId, 'loan_created', 'Préstamo por aprobar', 'Se registró un préstamo en el que participas.', 'family_loan', loanRow?.id),
    notify(input.borrowerUserId, 'loan_created', 'Préstamo por aprobar', 'Se registró un préstamo en el que participas.', 'family_loan', loanRow?.id),
    audit(session.user.id, 'loan.created', 'family_loan', loanRow?.id, null, loan)
  ]);
  return loan;
}

export async function recordLoanPayment(session, loanId, input) {
  const loan = await familyDb('loan_get', { loan_id: loanId });
  if (!loan || (!isAdmin(session) && ![loan.lender_user_id, loan.borrower_user_id].includes(session.user.id))) { const error = new Error('Préstamo no autorizado.');error.status = 403;throw error; }
  const amount = money(input.amountMinor);
  if (!amount) { const error = new Error('El pago debe ser mayor que cero.');error.status = 400;throw error; }
  if (amount > Number(loan.original_amount_minor) - Number(loan.paid_amount_minor) && !input.confirmOverpayment) { const error = new Error('El pago supera el saldo. Confirma explícitamente el excedente.');error.status = 409;throw error; }
  if (!input.image) { const error = new Error('Adjunta la fotografía del pago.');error.status = 400;throw error; }
  const attachment = await uploadFinancialImage(session.user.id, 'loan-payments', input.image);
  let result;
  try { result = await familyDb('loan_payment', { loan_id: Number(loanId), amount_minor: amount, payment_date: input.date, detail: input.detail || '', created_by: session.user.id, idempotency_key: input.idempotencyKey || crypto.randomUUID(), allow_overpayment: Boolean(input.confirmOverpayment), attachment, ai_proposal: input.aiProposal || undefined, ai_model: input.aiModel || '', corrected_values: input.correctedValues || {} }); }
  catch (error) { await removeStored(attachment.storage_path);throw error; }
  await Promise.all([
    notify(loan.lender_user_id, 'loan_payment', 'Pago pendiente de aprobación', 'Se registró un pago con comprobante.', 'family_loan', loan.id),
    notify(loan.borrower_user_id, 'loan_payment', 'Pago pendiente de aprobación', 'Se registró un pago con comprobante.', 'family_loan', loan.id),
    audit(session.user.id, 'loan.payment_recorded', 'family_loan', loan.id, { paidAmountMinor: loan.paid_amount_minor }, result)
  ]);
  return result;
}

export async function reviewExpenseMovement(session, movementId, input) {
  if (!isAdmin(session)) { const error = new Error('Solo el superadministrador puede aprobar rendiciones.');error.status = 403;throw error; }
  const decision = input.decision === 'approved' ? 'approved' : 'rejected';
  const result = await familyDb('movement_review', { movement_id: Number(movementId), decision, reviewed_by: session.user.id, note: input.note || '' });
  if (!result) { const error = new Error('El movimiento ya fue revisado o no existe.');error.status = 409;throw error; }
  await audit(session.user.id, `expense.${decision}`, 'expense_movement', movementId, { status: 'pending' }, result);
  return result;
}

export async function reviewLoan(session, loanId, input) {
  if (!isAdmin(session)) { const error = new Error('Solo el superadministrador puede aprobar préstamos.');error.status = 403;throw error; }
  const decision = input.decision === 'approved' ? 'approved' : 'rejected';
  const result = await familyDb('loan_review', { loan_id: Number(loanId), decision, reviewed_by: session.user.id, note: input.note || '' });
  if (!result) { const error = new Error('El préstamo ya fue revisado o no existe.');error.status = 409;throw error; }
  await audit(session.user.id, `loan.${decision}`, 'family_loan', loanId, { approvalStatus: 'pending' }, result);
  return result;
}

export async function reviewLoanPayment(session, paymentId, input) {
  if (!isAdmin(session)) { const error = new Error('Solo el superadministrador puede aprobar pagos.');error.status = 403;throw error; }
  const decision = input.decision === 'approved' ? 'approved' : 'rejected';
  const result = await familyDb('loan_payment_review', { payment_id: Number(paymentId), decision, reviewed_by: session.user.id, note: input.note || '' });
  if (!result) { const error = new Error('El pago ya fue revisado o no existe.');error.status = 409;throw error; }
  await audit(session.user.id, `loan_payment.${decision}`, 'loan_payment', paymentId, { status: 'pending' }, result);
  return result;
}

export async function readFinancialAttachment(session, attachmentId) {
  const dashboard = await familyDashboard(session);
  const visible = dashboard.expenseAccounts.flatMap((account) => account.movements.flatMap((movement) => movement.attachments || []))
    .concat(dashboard.loans.flatMap((loan) => [...(loan.attachments || []), ...loan.payments.flatMap((payment) => payment.attachments || [])]));
  if (!visible.some((item) => item.id === attachmentId)) { const error = new Error('Comprobante no autorizado.');error.status = 403;throw error; }
  const row = await familyDb('attachment_get', { attachment_id: attachmentId });
  if (!row) { const error = new Error('Comprobante no encontrado.');error.status = 404;throw error; }
  return readStored(row.storage_path, row.mime_type, row.original_name);
}

function entityAttachments(rows, type, id) { return (rows || []).filter((row) => row.entity_type === type && String(row.entity_id) === String(id)); }

async function adminUsers() {
  const { users = [] } = await familyDb('dashboard', { user_id: '00000000-0000-0000-0000-000000000000', admin: true }) || {};
  return users.filter((user) => user.username === 'ecodjamb');
}

function storageConfiguration() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY, appKey = process.env.MISOLAR_DB_KEY;
  if (!url || !key || !appKey) throw Object.assign(new Error('El almacenamiento privado no está configurado.'), { status: 503 });
  return { url, key, appKey };
}

async function uploadFinancialImage(ownerId, prefix, image) {
  validateFinancialImage(image);
  const match = image.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  const buffer = Buffer.from(match[2], 'base64'), mimeType = match[1];
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const storagePath = `${ownerId}/${prefix}/${crypto.randomUUID()}-${sha256.slice(0,12)}.${extension}`;
  const { url, key, appKey } = storageConfiguration();
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${storagePath.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'x-misolar-key': appKey, 'Content-Type': mimeType, 'x-upsert': 'false' }, body: buffer });
  if (!response.ok) throw Object.assign(new Error('No fue posible respaldar el comprobante privado.'), { status: 502 });
  return { storage_path: storagePath, original_name: String(image.name || `comprobante.${extension}`).slice(0,180), mime_type: mimeType, size_bytes: buffer.length, sha256, metadata: { source: 'family-finance' } };
}

async function removeStored(path) {
  if (!path) return;
  const { url, key, appKey } = storageConfiguration();
  await fetch(`${url}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}`, 'x-misolar-key': appKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }) });
}

async function readStored(path, mimeType, originalName) {
  const { url, key, appKey } = storageConfiguration();
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${String(path).split('/').map(encodeURIComponent).join('/')}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, 'x-misolar-key': appKey } });
  if (!response.ok) throw Object.assign(new Error('No fue posible abrir el comprobante.'), { status: response.status === 404 ? 404 : 502 });
  return { buffer: Buffer.from(await response.arrayBuffer()), mimeType: mimeType || response.headers.get('content-type') || 'image/jpeg', originalName: originalName || 'comprobante.jpg' };
}

async function notify(userId, type, title, body, entityType, entityId) {
  if (!userId) return;
  await familyDb('notify', { user_id: userId, type, title, body, entity_type: entityType || '', entity_id: entityId == null ? '' : String(entityId) });
}

async function audit(actorUserId, action, entityType, entityId, beforeValues, afterValues) {
  await familyDb('audit', { actor_user_id: actorUserId || '', action, entity_type: entityType, entity_id: entityId == null ? '' : String(entityId), before_values: beforeValues, after_values: afterValues });
}
