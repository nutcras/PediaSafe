// Age helpers — calculate a readable age from a date of birth (YYYY-MM-DD).

export interface AgeParts {
  years: number;
  months: number;
  days: number;
}

// Calendar-accurate years/months/days between dob and `asOf` (default: now).
export function calculateAge(dobISO: string, asOf: Date = new Date()): AgeParts {
  const dob = new Date(`${dobISO}T00:00:00`);

  let years = asOf.getFullYear() - dob.getFullYear();
  let months = asOf.getMonth() - dob.getMonth();
  let days = asOf.getDate() - dob.getDate();

  if (days < 0) {
    months -= 1;
    // Borrow the number of days in the month preceding `asOf`.
    days += new Date(asOf.getFullYear(), asOf.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

// Human-readable age, e.g. "8 months, 12 days", "2 years", "2 years, 3 months".
export function formatAge(dobISO: string | null | undefined, asOf: Date = new Date()): string {
  if (!dobISO) return '';
  const { years, months, days } = calculateAge(dobISO, asOf);
  if (years < 0) return ''; // DOB in the future → not meaningful

  if (years >= 1) {
    return months > 0 ? `${plural(years, 'year')}, ${plural(months, 'month')}` : plural(years, 'year');
  }
  if (months >= 1) {
    return days > 0 ? `${plural(months, 'month')}, ${plural(days, 'day')}` : plural(months, 'month');
  }
  return plural(days, 'day');
}
