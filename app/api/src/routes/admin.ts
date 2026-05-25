import { Hono } from 'hono';
import { and, eq, gte, lte, inArray } from 'drizzle-orm';
import { db, employees, managerAssignments, leaveRequests, type Employee } from '@lava/db';

export const admin = new Hono();

// ── Auth ──────────────────────────────────────────────────────────────────────
// Two ways to authenticate the caller:
//   - x-line-user-id            → LIFF (opened inside LINE; resolve by lineId)
//   - x-teacher-id + x-id-card  → manual web login (teacherId + last-4 ID card)
// Role gating is applied per route by the require* helpers below.
async function authUser(c: { req: { header: (n: string) => string | undefined } }): Promise<Employee | null> {
  const lineId = c.req.header('x-line-user-id');
  if (lineId) {
    return (await db.query.employees.findFirst({ where: eq(employees.lineId, lineId) })) ?? null;
  }
  const tid = c.req.header('x-teacher-id');
  const idc = c.req.header('x-id-card');
  if (!tid || !idc) return null;
  const u = await db.query.employees.findFirst({ where: eq(employees.teacherId, tid) });
  if (!u || u.idCardLast4 !== idc) return null;
  return u;
}
async function requireManagerOrAdmin(c: Parameters<typeof authUser>[0]) {
  const u = await authUser(c);
  return u && (u.role === 'MANAGER' || u.role === 'ADMIN') ? u : null;
}
async function requireAdmin(c: Parameters<typeof authUser>[0]) {
  const u = await authUser(c);
  return u && u.role === 'ADMIN' ? u : null;
}

const todayBKK = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

// ── POST /admin/login ─────────────────────────────────────────────────────────
admin.post('/login', async (c) => {
  const b = await c.req.json<{ teacherId?: string; idCardLast4?: string }>().catch(() => null);
  if (!b?.teacherId || !b?.idCardLast4) return c.json({ error: 'กรุณากรอกรหัสครูและเลขบัตร' }, 400);
  const u = await db.query.employees.findFirst({ where: eq(employees.teacherId, b.teacherId.trim()) });
  if (!u || u.idCardLast4 !== b.idCardLast4) return c.json({ error: 'รหัสครูหรือเลขบัตรไม่ถูกต้อง' }, 401);
  if (u.role !== 'MANAGER' && u.role !== 'ADMIN') {
    return c.json({ error: 'ไม่มีสิทธิ์เข้าถึง (เฉพาะหัวหน้า/แอดมิน)' }, 403);
  }
  return c.json({ teacherId: u.teacherId, name: u.name, role: u.role, department: u.department, section: u.section });
});

// ── GET /admin/employees  (ADMIN) — all teachers + HEAD/DEPUTY ────────────────
admin.get('/employees', async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: 'Forbidden' }, 403);
  const [emps, assigns] = await Promise.all([
    db.select().from(employees),
    db.select().from(managerAssignments),
  ]);
  const links = new Map<string, { head: string | null; deputy: string | null }>();
  for (const a of assigns) {
    const cur = links.get(a.employeeId) ?? { head: null, deputy: null };
    if (a.role === 'HEAD') cur.head = a.managerId; else cur.deputy = a.managerId;
    links.set(a.employeeId, cur);
  }
  const result = emps.map((e) => ({
    teacherId: e.teacherId, name: e.name, department: e.department, section: e.section,
    role: e.role, lineId: e.lineId,
    head: links.get(e.teacherId)?.head ?? null,
    deputy: links.get(e.teacherId)?.deputy ?? null,
  }));
  return c.json({ employees: result });
});

// ── POST /admin/employees  (ADMIN) — create one employee ──────────────────────
admin.post('/employees', async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: 'Forbidden' }, 403);
  const b = await c.req.json<{ teacherId?: string; name?: string; department?: string; section?: string; role?: string; idCardLast4?: string }>().catch(() => null);
  const teacherId = (b?.teacherId ?? '').trim();
  const name = (b?.name ?? '').trim();
  const department = (b?.department ?? '').trim();
  const section = b?.section ? String(b.section).trim() : null;
  const role = (b?.role ?? 'STAFF').trim().toUpperCase();
  const idCardLast4 = (b?.idCardLast4 ?? '').trim();

  if (!teacherId || !name || !department) return c.json({ error: 'กรอกข้อมูลไม่ครบ (รหัส/ชื่อ/แผนก)' }, 400);
  if (!/^\d{4}$/.test(idCardLast4)) return c.json({ error: 'เลขบัตร 4 หลักไม่ถูกต้อง' }, 400);
  if (!['STAFF', 'MANAGER', 'ADMIN'].includes(role)) return c.json({ error: 'role ไม่ถูกต้อง' }, 400);

  const exists = await db.query.employees.findFirst({ where: eq(employees.teacherId, teacherId) });
  if (exists) return c.json({ error: `มีรหัสครู ${teacherId} อยู่แล้ว` }, 409);

  await db.insert(employees).values({ teacherId, name, department, section, role: role as 'STAFF' | 'MANAGER' | 'ADMIN', idCardLast4 });
  return c.json({ ok: true }, 201);
});

// ── DELETE /admin/employees/:id  (ADMIN) — delete an employee ─────────────────
// manager_assignments + own leave_requests cascade; null out approvedBy refs first.
admin.delete('/employees/:id', async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: 'Forbidden' }, 403);
  const id = c.req.param('id');
  const exists = await db.query.employees.findFirst({ where: eq(employees.teacherId, id) });
  if (!exists) return c.json({ error: 'Not found' }, 404);

  await db.update(leaveRequests).set({ approvedBy: null }).where(eq(leaveRequests.approvedBy, id));
  await db.delete(employees).where(eq(employees.teacherId, id));
  return c.json({ ok: true });
});

// ── PUT /admin/assignments  (ADMIN) — set HEAD/DEPUTY of an employee ──────────
admin.put('/assignments', async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: 'Forbidden' }, 403);
  const b = await c.req.json<{ employeeId?: string; managerId?: string; role?: 'HEAD' | 'DEPUTY' }>().catch(() => null);
  if (!b?.employeeId || !b?.managerId || (b.role !== 'HEAD' && b.role !== 'DEPUTY')) {
    return c.json({ error: 'Invalid body' }, 400);
  }
  if (b.employeeId === b.managerId) return c.json({ error: 'ตั้งตัวเองเป็นหัวหน้าไม่ได้' }, 400);
  const found = await db.select({ id: employees.teacherId }).from(employees)
    .where(inArray(employees.teacherId, [b.employeeId, b.managerId]));
  if (found.length < 2) return c.json({ error: 'ไม่พบครู' }, 404);

  // Replace any existing assignment for this (employee, role)
  await db.delete(managerAssignments).where(and(
    eq(managerAssignments.employeeId, b.employeeId),
    eq(managerAssignments.role, b.role),
  ));
  await db.insert(managerAssignments).values({ employeeId: b.employeeId, managerId: b.managerId, role: b.role });
  return c.json({ ok: true });
});

// ── DELETE /admin/assignments  (ADMIN) — remove HEAD/DEPUTY ───────────────────
admin.delete('/assignments', async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: 'Forbidden' }, 403);
  const b = await c.req.json<{ employeeId?: string; role?: 'HEAD' | 'DEPUTY' }>().catch(() => null);
  if (!b?.employeeId || (b.role !== 'HEAD' && b.role !== 'DEPUTY')) return c.json({ error: 'Invalid body' }, 400);
  await db.delete(managerAssignments).where(and(
    eq(managerAssignments.employeeId, b.employeeId),
    eq(managerAssignments.role, b.role),
  ));
  return c.json({ ok: true });
});

// ── POST /admin/import  (ADMIN) — bulk create/update employees from CSV rows ──
// Body: { rows: [{ teacherId, name, department, section?, role?, idCardLast4 }] }
// Existing teacherId → updated (lineId preserved); new → created.
admin.post('/import', async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json<{ rows?: Array<Record<string, unknown>> }>().catch(() => null);
  if (!body?.rows || !Array.isArray(body.rows)) return c.json({ error: 'Invalid body' }, 400);

  const validRoles = ['STAFF', 'MANAGER', 'ADMIN'] as const;
  type Role = typeof validRoles[number];
  let created = 0, updated = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < body.rows.length; i++) {
    const r = body.rows[i] ?? {};
    const teacherId = String(r.teacherId ?? '').trim();
    const name = String(r.name ?? '').trim();
    const department = String(r.department ?? '').trim();
    const section = r.section ? String(r.section).trim() : null;
    const role = String(r.role ?? 'STAFF').trim().toUpperCase();
    const idCardLast4 = String(r.idCardLast4 ?? '').trim();

    if (!teacherId || !name || !department) { errors.push({ row: i + 1, error: 'ข้อมูลไม่ครบ (รหัส/ชื่อ/แผนก)' }); continue; }
    if (!/^\d{4}$/.test(idCardLast4)) { errors.push({ row: i + 1, error: 'เลขบัตร 4 หลักไม่ถูกต้อง' }); continue; }
    if (!validRoles.includes(role as Role)) { errors.push({ row: i + 1, error: `role ไม่ถูกต้อง: ${role}` }); continue; }

    const existing = await db.query.employees.findFirst({ where: eq(employees.teacherId, teacherId) });
    if (existing) {
      await db.update(employees)
        .set({ name, department, section, role: role as Role, idCardLast4, updatedAt: new Date() })
        .where(eq(employees.teacherId, teacherId));
      updated++;
    } else {
      await db.insert(employees).values({ teacherId, name, department, section, role: role as Role, idCardLast4 });
      created++;
    }
  }
  return c.json({ created, updated, errors });
});

// ── GET /admin/on-leave?start=&end=  (MANAGER+ADMIN) — who is on leave ─────────
// Returns APPROVED/PENDING requests overlapping [start, end].
admin.get('/on-leave', async (c) => {
  if (!(await requireManagerOrAdmin(c))) return c.json({ error: 'Forbidden' }, 403);
  const start = c.req.query('start');
  const end = c.req.query('end') ?? start;
  if (!start || !end) return c.json({ error: 'Missing start/end' }, 400);

  const rows = await db.query.leaveRequests.findMany({
    where: and(
      lte(leaveRequests.startDate, end),     // overlap: starts on/before range end
      gte(leaveRequests.endDate, start),     // and ends on/after range start
      inArray(leaveRequests.status, ['APPROVED', 'PENDING']),
    ),
    with: { user: true },
    orderBy: [leaveRequests.startDate],
  });
  return c.json({ start, end, requests: rows });
});

// ── GET /admin/dashboard?date=  (MANAGER+ADMIN) — summary cards + chart data ──
admin.get('/dashboard', async (c) => {
  if (!(await requireManagerOrAdmin(c))) return c.json({ error: 'Forbidden' }, 403);
  const date = c.req.query('date') ?? todayBKK();

  const [onLeave, pending, allEmp] = await Promise.all([
    db.query.leaveRequests.findMany({
      where: and(
        lte(leaveRequests.startDate, date),
        gte(leaveRequests.endDate, date),
        eq(leaveRequests.status, 'APPROVED'),
      ),
      with: { user: true },
    }),
    db.select({ id: leaveRequests.id }).from(leaveRequests).where(eq(leaveRequests.status, 'PENDING')),
    db.select({ id: employees.teacherId }).from(employees),
  ]);

  const byType: Record<string, number> = {};
  const byDept: Record<string, number> = {};
  for (const r of onLeave) {
    byType[r.leaveType] = (byType[r.leaveType] ?? 0) + 1;
    byDept[r.user.department] = (byDept[r.user.department] ?? 0) + 1;
  }

  return c.json({
    date,
    totalEmployees: allEmp.length,
    onLeaveToday: onLeave.length,
    pendingCount: pending.length,
    byType: Object.entries(byType).map(([name, value]) => ({ name, value })),
    byDept: Object.entries(byDept).map(([name, value]) => ({ name, value })),
  });
});
