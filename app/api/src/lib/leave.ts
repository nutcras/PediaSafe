import { and, eq, inArray, ne } from 'drizzle-orm';
import { db, employees, classSchedules } from '@lava/db';

export interface ReplacementCandidate {
  teacherId: string;
  name: string;
  department: string;
  freePeriods: { dayOfWeek: number; periodNumber: number }[];
}

// ────────────────────────────────────────────────────────────────────────────
// Finds teachers in the same department who are free during any of the
// absent teacher's class periods over the given weekdays.
// 3 queries + in-memory set lookup → no N+1.
// ────────────────────────────────────────────────────────────────────────────
export async function findReplacementTeachers(
  absentTeacherId: string,
  affectedDays: number[]
): Promise<ReplacementCandidate[]> {
  if (affectedDays.length === 0) return [];

  const [absentTeacher, absentSchedule] = await Promise.all([
    db.query.employees.findFirst({ where: eq(employees.teacherId, absentTeacherId) }),
    db.select().from(classSchedules).where(
      and(
        eq(classSchedules.teacherId, absentTeacherId),
        inArray(classSchedules.dayOfWeek, affectedDays)
      )
    ),
  ]);

  if (!absentTeacher || absentSchedule.length === 0) return [];

  const deptTeachers = await db.select()
    .from(employees)
    .where(
      and(
        eq(employees.department, absentTeacher.department),
        ne(employees.teacherId, absentTeacherId)
      )
    );

  if (deptTeachers.length === 0) return [];

  const deptTeacherIds = deptTeachers.map((t) => t.teacherId);
  const deptSchedules = await db.select({
    teacherId: classSchedules.teacherId,
    dayOfWeek: classSchedules.dayOfWeek,
    periodNumber: classSchedules.periodNumber,
  })
    .from(classSchedules)
    .where(
      and(
        inArray(classSchedules.teacherId, deptTeacherIds),
        inArray(classSchedules.dayOfWeek, affectedDays)
      )
    );

  const busySlots = new Set(
    deptSchedules.map((s) => `${s.teacherId}:${s.dayOfWeek}:${s.periodNumber}`)
  );

  return deptTeachers
    .map((teacher) => ({
      teacherId: teacher.teacherId,
      name: teacher.name,
      department: teacher.department,
      freePeriods: absentSchedule
        .filter((slot) => !busySlots.has(`${teacher.teacherId}:${slot.dayOfWeek}:${slot.periodNumber}`))
        .map((slot) => ({ dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber })),
    }))
    .filter((r) => r.freePeriods.length > 0);
}

export function countWeekdays(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const d = cur.getDay();
    if (d >= 1 && d <= 5) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function getAffectedWeekdays(start: Date, end: Date): number[] {
  const days = new Set<number>();
  const cur = new Date(start);
  while (cur <= end) {
    const d = cur.getDay();
    if (d >= 1 && d <= 5) days.add(d);
    cur.setDate(cur.getDate() + 1);
  }
  return Array.from(days);
}
