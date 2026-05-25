import { and, eq, inArray } from 'drizzle-orm';
import { db, managerAssignments, employees, type Employee } from '@lava/db';

// teacherIds of everyone this person manages (as HEAD or DEPUTY).
export async function getReportIds(managerTeacherId: string): Promise<string[]> {
  const rows = await db
    .select({ employeeId: managerAssignments.employeeId })
    .from(managerAssignments)
    .where(eq(managerAssignments.managerId, managerTeacherId));
  return [...new Set(rows.map((r) => r.employeeId))];
}

// The HEAD + DEPUTY manager records of a given employee.
export async function getManagers(employeeTeacherId: string): Promise<Employee[]> {
  const rows = await db
    .select({ managerId: managerAssignments.managerId })
    .from(managerAssignments)
    .where(eq(managerAssignments.employeeId, employeeTeacherId));
  const ids = [...new Set(rows.map((r) => r.managerId))];
  if (ids.length === 0) return [];
  return db.select().from(employees).where(inArray(employees.teacherId, ids));
}

// Is `managerTeacherId` a HEAD/DEPUTY of `employeeTeacherId`?
export async function isManagerOf(managerTeacherId: string, employeeTeacherId: string): Promise<boolean> {
  const row = await db
    .select({ id: managerAssignments.id })
    .from(managerAssignments)
    .where(and(
      eq(managerAssignments.managerId, managerTeacherId),
      eq(managerAssignments.employeeId, employeeTeacherId),
    ))
    .limit(1);
  return row.length > 0;
}
