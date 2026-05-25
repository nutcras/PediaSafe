import { Hono } from 'hono';
import { and, eq, gte, lt } from 'drizzle-orm';
import { db, employees, leaveRequests, type LeaveRequest } from '@lava/db';
import {
  validateLineSignature,
  replyMessage,
  pushMessage,
  type LineWebhookBody,
  type LineEvent,
} from '../lib/line';

export const webhook = new Hono();

// Base URL of the web app (LIFF). Leave/late submission happens there.
const WEB_URL = process.env.DASHBOARD_URL ?? 'https://example.com';

webhook.post('/', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('x-line-signature') ?? '';

  if (!validateLineSignature(rawBody, signature)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const body: LineWebhookBody = JSON.parse(rawBody);
  await Promise.allSettled(body.events.map(handleEvent));

  return c.json({ status: 'ok' });
});

async function handleEvent(event: LineEvent): Promise<void> {
  if (event.deliveryContext.isRedelivery) {
    console.log(JSON.stringify({ tag: 'line.event.skip_redelivery', webhookEventId: event.webhookEventId }));
    return;
  }

  console.log(JSON.stringify({
    tag: 'line.event',
    type: event.type,
    userId: event.source.userId ?? null,
    messageType: event.message?.type ?? null,
  }));

  // Teacher adds LINE OA as friend → send registration instructions / menu
  if (event.type === 'follow' && event.source.userId) {
    await handleFollow(event);
    return;
  }

  if (event.type === 'message' && event.message?.type === 'text') {
    await handleTextMessage(event);
    return;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Follow event: user adds the LINE OA for the first time (or unblocks it).
// ────────────────────────────────────────────────────────────────────────────
async function handleFollow(event: LineEvent): Promise<void> {
  const lineUserId = event.source.userId!;

  const existing = await db.query.employees.findFirst({
    where: eq(employees.lineId, lineUserId),
  });

  if (existing) {
    await pushMessage(lineUserId, [{
      type: 'text',
      text: `ยินดีต้อนรับกลับ คุณครู${existing.name}! 👋\n\n${menuText()}`,
    }]);
    return;
  }

  await pushMessage(lineUserId, [{ type: 'text', text: registrationInstructionText() }]);
  console.log(JSON.stringify({ tag: 'line.follow.unregistered', lineUserId }));
}

// ────────────────────────────────────────────────────────────────────────────
// Text message dispatcher.
//
//   "ลงทะเบียน ..."  → registration (still handled in chat)
//   "สถานะ"          → show this teacher's requests (last 7 days + all future)
//   anything else    → menu with the web link (leave/late submission is web-only)
// ────────────────────────────────────────────────────────────────────────────
async function handleTextMessage(event: LineEvent): Promise<void> {
  const userId = event.source.userId ?? 'unknown';
  const text = (event.message?.text ?? '').trim();
  console.log(JSON.stringify({ tag: 'line.message.text', userId, text }));

  if (text.startsWith('ลงทะเบียน')) {
    // Registration moved to the web (it has a name/code search) → just send the link.
    if (event.replyToken) await replyMessage(event.replyToken, [{ type: 'text', text: registrationInstructionText() }]);
    return;
  }

  if (text === 'สถานะ' || text === 'ดูสถานะ' || text.startsWith('สถานะ')) {
    await handleStatus(event);
    return;
  }

  // Everything else (including old "แจ้งลา"/"แจ้งสาย" attempts) → show the menu.
  // Submitting leave/late via chat is intentionally disabled — use the web form.
  if (event.replyToken) {
    await replyMessage(event.replyToken, [{ type: 'text', text: menuText() }]);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Status: show this teacher's own requests, split into:
//   • last 7 days  — leave dates within [today-7, today)
//   • all future   — leave dates >= today
// ────────────────────────────────────────────────────────────────────────────
async function handleStatus(event: LineEvent): Promise<void> {
  const replyToken = event.replyToken;
  const lineUserId = event.source.userId;
  if (!replyToken || !lineUserId) return;

  const employee = await db.query.employees.findFirst({
    where: eq(employees.lineId, lineUserId),
  });
  if (!employee) {
    await replyMessage(replyToken, [{ type: 'text', text: registrationInstructionText() }]);
    return;
  }

  const today = todayBangkok();
  const weekAgo = addDays(today, -7);

  const [recent, future] = await Promise.all([
    db.select().from(leaveRequests).where(and(
      eq(leaveRequests.userId, employee.teacherId),
      gte(leaveRequests.startDate, weekAgo),
      lt(leaveRequests.startDate, today),
    )),
    db.select().from(leaveRequests).where(and(
      eq(leaveRequests.userId, employee.teacherId),
      gte(leaveRequests.startDate, today),
    )),
  ]);

  recent.sort((a, b) => b.startDate.localeCompare(a.startDate)); // newest first
  future.sort((a, b) => a.startDate.localeCompare(b.startDate)); // soonest first

  const text =
    `📊 สถานะคำขอของคุณครู${employee.name}\n\n` +
    `🗓️ ล่าสุด 7 วัน (${weekAgo} ถึง ${today})\n` +
    (recent.length ? recent.map(formatRequestLine).join('\n') : '   – ไม่มีรายการ') +
    `\n\n🔮 อนาคตทั้งหมด\n` +
    (future.length ? future.map(formatRequestLine).join('\n') : '   – ไม่มีรายการ');

  await replyMessage(replyToken, [{ type: 'text', text }]);
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function menuText(): string {
  return (
    '📋 เมนูระบบลางาน\n\n' +
    `📝 แจ้งลา / มาสาย → ทำผ่านเว็บ:\n${WEB_URL}/request\n\n` +
    '📊 ดูสถานะคำขอ → พิมพ์: สถานะ\n\n' +
    '(การแจ้งลาผ่านแชทถูกปิดแล้ว กรุณาใช้เว็บ)'
  );
}

function registrationInstructionText(): string {
  return (
    'ยังไม่ได้ลงทะเบียน — ลงทะเบียนผ่านเว็บได้เลย\n' +
    '(ค้นหาชื่อ/รหัสของคุณได้ ไม่ต้องจำรหัสครู):\n' +
    `${WEB_URL}/register`
  );
}

const LEAVE_TYPE_LABEL_TH: Record<string, string> = {
  LATE: 'มาสาย',
  SICK: 'ลาป่วย',
  PERSONAL: 'ลากิจ',
  ANNUAL: 'ลาพักร้อน',
};

function leaveTypeLabelTH(t: string): string {
  return LEAVE_TYPE_LABEL_TH[t] ?? t;
}

const STATUS_LABEL_TH: Record<string, string> = {
  PENDING: 'รออนุมัติ',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ปฏิเสธ',
};
const STATUS_EMOJI: Record<string, string> = {
  PENDING: '⏳',
  APPROVED: '✅',
  REJECTED: '❌',
};

function formatRequestLine(r: LeaveRequest): string {
  const dateStr = r.startDate === r.endDate ? r.startDate : `${r.startDate} – ${r.endDate}`;
  const emoji = STATUS_EMOJI[r.status] ?? '•';
  return `   ${emoji} ${leaveTypeLabelTH(r.leaveType)} ${dateStr} (${STATUS_LABEL_TH[r.status] ?? r.status})`;
}

// Today's date (YYYY-MM-DD) in Asia/Bangkok.
function todayBangkok(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

// Add (or subtract) days to a YYYY-MM-DD string, returning YYYY-MM-DD.
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
