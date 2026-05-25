import { Hono } from 'hono';
import { and, eq, ilike, isNull, or } from 'drizzle-orm';
import { db, employees } from '@lava/db';
import { pushMessage } from '../lib/line';

export const register = new Hono();

// GET /api/register/search?q=  → find UNREGISTERED teachers by name or teacherId,
// so users who don't know their own code can pick themselves during registration.
register.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 1) return c.json({ results: [] });
  const like = `%${q}%`;
  const results = await db
    .select({ teacherId: employees.teacherId, name: employees.name, department: employees.department, section: employees.section })
    .from(employees)
    .where(and(
      isNull(employees.lineId),                                    // only not-yet-registered
      or(ilike(employees.teacherId, like), ilike(employees.name, like)),
    ))
    .limit(20);
  return c.json({ results });
});

interface RegisterBody {
  teacherId: string;
  idCardLast4: string;
  lineId: string;
}

// POST /api/register
// Called by the LIFF page at <DASHBOARD_URL>/register after the teacher fills
// in their Teacher ID and last-4 ID-card digits.
//
// Flow:
//   1. Validate body shape
//   2. Find employee row matching teacherId + idCardLast4
//   3. Reject if already bound to a different lineId (prevent hijacking)
//   4. Bind the lineId, reply 200
//   5. Push a LINE welcome message to the newly registered user
register.post('/', async (c) => {
  const body = await c.req.json<RegisterBody>().catch(() => null);

  if (
    !body ||
    typeof body.teacherId !== 'string' || body.teacherId.trim() === '' ||
    typeof body.idCardLast4 !== 'string' || !/^\d{4}$/.test(body.idCardLast4) ||
    typeof body.lineId !== 'string' || body.lineId.trim() === ''
  ) {
    return c.json(
      { error: 'Invalid body. Required: teacherId (string), idCardLast4 (4 digits), lineId (string)' },
      400
    );
  }

  const { teacherId, idCardLast4, lineId } = body;

  const employee = await db.query.employees.findFirst({
    where: and(
      eq(employees.teacherId, teacherId.trim()),
      eq(employees.idCardLast4, idCardLast4)
    ),
  });

  if (!employee) {
    return c.json(
      { error: 'ไม่พบข้อมูลครู กรุณาตรวจสอบรหัสครูและเลขบัตรประชาชน 4 หลักสุดท้าย' },
      404
    );
  }

  // Prevent a second LINE account from hijacking a registered teacher's slot
  if (employee.lineId !== null && employee.lineId !== lineId) {
    return c.json(
      { error: 'บัญชีนี้ถูกเชื่อมต่อกับ LINE อื่นแล้ว กรุณาติดต่อผู้ดูแลระบบ' },
      409
    );
  }

  // Idempotent: if the same lineId is already bound, return success
  if (employee.lineId === lineId) {
    return c.json({ ok: true, message: `ลงทะเบียนสำเร็จแล้ว ยินดีต้อนรับ คุณครู ${employee.name}` });
  }

  const [updated] = await db
    .update(employees)
    .set({ lineId, updatedAt: new Date() })
    .where(eq(employees.teacherId, teacherId))
    .returning();

  console.log(JSON.stringify({
    tag: 'register.success',
    teacherId: updated.teacherId,
    lineId: updated.lineId,
  }));

  // Fire-and-forget — webhook response must not block on this
  void pushMessage(lineId, [{
    type: 'text',
    text: `✅ ลงทะเบียนสำเร็จ! ยินดีต้อนรับ คุณครู ${updated.name}\n\nพิมพ์ "แจ้งลา" เพื่อเริ่มแจ้งลางานได้เลย`,
  }]);

  return c.json({ ok: true, message: `ลงทะเบียนสำเร็จ ยินดีต้อนรับ คุณครู ${updated.name}` });
});
