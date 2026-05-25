import { Hono } from 'hono';
import { and, desc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import {
  db,
  employees,
  leaveRequests,
  type Employee,
} from '@lava/db';
import { pushMessage } from '../lib/line';
import { countWeekdays } from '../lib/leave';
import { getReportIds, getManagers, isManagerOf } from '../lib/org';

export const leave = new Hono();

// ────────────────────────────────────────────────────────────────────────────
// Auth helpers
//
// Manager/Admin auth accepts either:
//   - X-Line-User-Id  (LINE clients / webhook context)
//   - X-Teacher-Id    (web dashboard — manager types their teacher ID)
// ────────────────────────────────────────────────────────────────────────────
async function requireManagerOrAdmin(c: {
  req: { header: (name: string) => string | undefined };
}): Promise<Employee | null> {
  const lineId   = c.req.header('x-line-user-id');
  const teacherId = c.req.header('x-teacher-id');

  if (!lineId && !teacherId) return null;

  const user = lineId
    ? await db.query.employees.findFirst({ where: eq(employees.lineId, lineId) })
    : await db.query.employees.findFirst({ where: eq(employees.teacherId, teacherId!) });

  if (!user) return null;
  if (user.role !== 'MANAGER' && user.role !== 'ADMIN') return null;
  return user;
}

// ────────────────────────────────────────────────────────────────────────────
// POST /leave  →  employee submits a new Leave or Late request.
//
// Body:
//   {
//     teacherId:  string;                           // who is submitting
//     requestType: 'LEAVE' | 'LATE';
//     leaveType?: 'SICK' | 'PERSONAL' | 'ANNUAL';  // required when LEAVE
//     startDate:  string;   // YYYY-MM-DD
//     endDate?:   string;   // YYYY-MM-DD (defaults to startDate for LATE)
//     reason:     string;
//   }
//
// LINE notifications fired:
//   A — employee: "Your request has been submitted."
//   B — manager:  "A new request needs approval." + dashboard link
// ────────────────────────────────────────────────────────────────────────────
leave.post('/', async (c) => {
  interface SubmitBody {
    teacherId:   string;
    requestType: 'LEAVE' | 'LATE';
    leaveType?:  'SICK' | 'PERSONAL' | 'ANNUAL';
    startDate:   string;
    endDate?:    string;
    reason:      string;
  }

  const body = await c.req.json<SubmitBody>().catch(() => null);

  if (
    !body ||
    typeof body.teacherId !== 'string'   || body.teacherId.trim() === '' ||
    typeof body.startDate !== 'string'   || body.startDate.trim() === '' ||
    typeof body.reason    !== 'string'   || body.reason.trim()    === '' ||
    (body.requestType !== 'LEAVE' && body.requestType !== 'LATE') ||
    (body.requestType === 'LEAVE' && !['SICK', 'PERSONAL', 'ANNUAL'].includes(body.leaveType ?? ''))
  ) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const employee = await db.query.employees.findFirst({
    where: eq(employees.teacherId, body.teacherId.trim()),
  });
  if (!employee) return c.json({ error: 'Employee not found' }, 404);

  const isLate     = body.requestType === 'LATE';
  const startDate  = body.startDate;
  const endDate    = isLate ? startDate : (body.endDate ?? startDate);
  const leaveType  = isLate ? 'LATE' : body.leaveType!;

  // ── Date guards ────────────────────────────────────────────────────────────
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDate.test(startDate) || !isoDate.test(endDate)) {
    return c.json({ error: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)' }, 400);
  }
  // No back-dating: start must be today or later (Asia/Bangkok). YYYY-MM-DD compares lexicographically.
  const todayBKK = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  if (startDate < todayBKK) {
    return c.json({ error: 'ไม่สามารถยื่นคำขอย้อนหลังได้ กรุณาเลือกวันที่ปัจจุบันหรืออนาคต' }, 400);
  }
  if (endDate < startDate) {
    return c.json({ error: 'วันสุดท้ายต้องไม่ก่อนวันเริ่มต้น' }, 400);
  }

  const totalDays  = isLate ? 0 : countWeekdays(new Date(startDate), new Date(endDate));

  const [newRequest] = await db
    .insert(leaveRequests)
    .values({
      userId:    employee.teacherId,
      leaveType: leaveType as 'SICK' | 'PERSONAL' | 'ANNUAL' | 'LATE',
      startDate,
      endDate,
      totalDays,
      reason:    body.reason.trim(),
      status:    'PENDING',
    })
    .returning();

  // Fire-and-forget LINE notifications (A + B)
  void notifyOnSubmit(newRequest.id, employee);

  return c.json({ ok: true, requestId: newRequest.id }, 201);
});

// Sends Scenario A (to employee) and Scenario B (to manager) LINE messages.
async function notifyOnSubmit(
  requestId: number,
  employee:  Employee,
): Promise<void> {
  const dashboardUrl = process.env.DASHBOARD_URL ?? 'https://example.com';
  const requestUrl   = `${dashboardUrl}/dashboard`;

  const typeLabel = (type: string) => {
    if (type === 'LATE')     return 'สาย';
    if (type === 'SICK')     return 'ลาป่วย';
    if (type === 'PERSONAL') return 'ลากิจ';
    if (type === 'ANNUAL')   return 'ลาพักร้อน';
    return type;
  };

  // Fetch the full request to get leaveType / dates for the manager message
  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, requestId),
  });
  if (!request) return;

  // Scenario A — notify the employee
  if (employee.lineId) {
    await pushMessage(employee.lineId, [{
      type: 'text',
      text: `✅ คำขอ${typeLabel(request.leaveType)}ของคุณได้รับการบันทึกแล้ว\nระบบจะแจ้งผลการพิจารณาให้ทราบ`,
    }]);
  }

  // Scenario B — notify the employee's managers (HEAD + DEPUTY)
  const managers = await getManagers(employee.teacherId);
  if (managers.length === 0) return;

  const dateRange = request.startDate === request.endDate
    ? request.startDate
    : `${request.startDate} ถึง ${request.endDate}`;

  const managerText =
    `📋 มีคำขอ${typeLabel(request.leaveType)}รอการอนุมัติ\n` +
    `ผู้ส่งคำขอ: ${employee.name}\n` +
    `วันที่: ${dateRange}\n` +
    `เหตุผล: ${request.reason}\n\n` +
    `👉 อนุมัติได้ที่: ${requestUrl}`;

  for (const manager of managers) {
    if (manager.lineId) {
      await pushMessage(manager.lineId, [{ type: 'text', text: managerText }]);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GET /leave/pending  →  list of PENDING requests visible to the calling manager.
//   - MANAGER sees only requests from their direct reports
//   - ADMIN sees everything
// ────────────────────────────────────────────────────────────────────────────
leave.get('/pending', async (c) => {
  const caller = await requireManagerOrAdmin(c);
  if (!caller) return c.json({ error: 'Unauthorized' }, 401);

  const reportIds = caller.role === 'ADMIN' ? null : await getReportIds(caller.teacherId);

  // A manager with no direct reports sees nothing.
  if (reportIds && reportIds.length === 0) return c.json({ requests: [] });

  const pendingRows = await db.query.leaveRequests.findMany({
    where: reportIds
      ? and(
          eq(leaveRequests.status, 'PENDING'),
          inArray(leaveRequests.userId, reportIds)
        )
      : eq(leaveRequests.status, 'PENDING'),
    with: { user: true },
    orderBy: [desc(leaveRequests.createdAt)],
  });

  return c.json({ requests: pendingRows });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /leave/:id/approve
// ────────────────────────────────────────────────────────────────────────────
leave.post('/:id/approve', async (c) => {
  const caller = await requireManagerOrAdmin(c);
  if (!caller) return c.json({ error: 'Unauthorized' }, 401);

  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'Invalid id' }, 400);

  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, id),
    with: { user: true },
  });
  if (!request) return c.json({ error: 'Not found' }, 404);
  if (request.status !== 'PENDING') {
    return c.json({ error: `Request is already ${request.status}` }, 409);
  }
  if (caller.role === 'MANAGER' && !(await isManagerOf(caller.teacherId, request.userId))) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const [updated] = await db
    .update(leaveRequests)
    .set({ status: 'APPROVED', approvedBy: caller.teacherId, approvedAt: new Date() })
    .where(eq(leaveRequests.id, id))
    .returning();

  // Scenario C — notify employee the request was approved
  void notifyEmployee(request.user, 'APPROVED', caller.name);

  return c.json({ request: updated });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /leave/:id/reject
// Body: { reason?: string }
// ────────────────────────────────────────────────────────────────────────────
leave.post('/:id/reject', async (c) => {
  const caller = await requireManagerOrAdmin(c);
  if (!caller) return c.json({ error: 'Unauthorized' }, 401);

  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'Invalid id' }, 400);

  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, id),
    with: { user: true },
  });
  if (!request) return c.json({ error: 'Not found' }, 404);
  if (request.status !== 'PENDING') {
    return c.json({ error: `Request is already ${request.status}` }, 409);
  }
  if (caller.role === 'MANAGER' && !(await isManagerOf(caller.teacherId, request.userId))) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const [updated] = await db
    .update(leaveRequests)
    .set({ status: 'REJECTED', approvedBy: caller.teacherId, approvedAt: new Date() })
    .where(eq(leaveRequests.id, id))
    .returning();

  // Scenario C — notify employee the request was rejected
  void notifyEmployee(request.user, 'REJECTED', caller.name);

  return c.json({ request: updated });
});

// Scenario C: push approval/rejection result back to the employee.
async function notifyEmployee(
  employee:  Employee,
  decision:  'APPROVED' | 'REJECTED',
  managerName: string,
): Promise<void> {
  if (!employee.lineId) return;

  const text = decision === 'APPROVED'
    ? `✅ คำขอของคุณได้รับการ อนุมัติ โดย ${managerName}`
    : `❌ คำขอของคุณถูก ปฏิเสธ โดย ${managerName}`;

  await pushMessage(employee.lineId, [{ type: 'text', text }]);
}

// ────────────────────────────────────────────────────────────────────────────
// GET /leave/team  →  peers in the same department (or section) see each other's
// leave. LATE ("สาย") is excluded here — only HEAD/DEPUTY managers + admin see it.
//
// Auth: any registered teacher (x-line-user-id from LIFF, or x-teacher-id).
// Query: ?scope=department|section (default department), ?start, ?end (YYYY-MM-DD)
// Must be registered BEFORE '/:id' so it isn't captured as an id param.
// ────────────────────────────────────────────────────────────────────────────
leave.get('/team', async (c) => {
  const lineId = c.req.header('x-line-user-id');
  const teacherId = c.req.header('x-teacher-id');
  const caller = lineId
    ? await db.query.employees.findFirst({ where: eq(employees.lineId, lineId) })
    : teacherId
      ? await db.query.employees.findFirst({ where: eq(employees.teacherId, teacherId) })
      : null;
  if (!caller) return c.json({ error: 'Unauthorized' }, 401);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  const start = c.req.query('start') ?? today;
  const end = c.req.query('end') ?? start;
  const scopeParam = c.req.query('scope');
  const scope = scopeParam === 'section' ? 'section' : scopeParam === 'all' ? 'all' : 'department';

  // 'all' = whole org; otherwise same department (and same section for 'section').
  const peerConds = [ne(employees.teacherId, caller.teacherId)];
  if (scope !== 'all') peerConds.push(eq(employees.department, caller.department));
  if (scope === 'section' && caller.section) peerConds.push(eq(employees.section, caller.section));

  const peers = await db.select({ teacherId: employees.teacherId }).from(employees).where(and(...peerConds));
  const peerIds = peers.map((p) => p.teacherId);
  if (peerIds.length === 0) return c.json({ scope, start, end, requests: [] });

  const rows = await db.query.leaveRequests.findMany({
    where: and(
      inArray(leaveRequests.userId, peerIds),
      ne(leaveRequests.leaveType, 'LATE'),            // สาย เห็นเฉพาะหัวหน้า
      lte(leaveRequests.startDate, end),
      gte(leaveRequests.endDate, start),
      inArray(leaveRequests.status, ['APPROVED', 'PENDING']),
    ),
    with: { user: true },
    orderBy: [leaveRequests.startDate],
  });
  return c.json({ scope, start, end, requests: rows });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /leave/:id  →  full detail (managers only)
// ────────────────────────────────────────────────────────────────────────────
leave.get('/:id', async (c) => {
  const caller = await requireManagerOrAdmin(c);
  if (!caller) return c.json({ error: 'Unauthorized' }, 401);

  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'Invalid id' }, 400);

  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, id),
    with: { user: true },
  });
  if (!request) return c.json({ error: 'Not found' }, 404);

  if (caller.role === 'MANAGER' && !(await isManagerOf(caller.teacherId, request.userId))) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  return c.json({ request });
});
