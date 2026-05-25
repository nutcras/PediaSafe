'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';

import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

// Thin wrapper around react-day-picker (v10). Theme accent comes from the app's
// design tokens, applied via the rdp CSS variables on a parent (they inherit
// down to .rdp-root), which is robust against CSS load-order.
function Calendar({ className, weekStartsOn = 0, ...props }: CalendarProps) {
  return (
    <div
      className={cn('inline-block text-sm [&_.rdp-day_button]:rounded-md', className)}
      style={
        {
          '--rdp-accent-color': 'hsl(var(--primary))',
          '--rdp-accent-background-color': 'hsl(var(--accent))',
          '--rdp-today-color': 'hsl(var(--primary))',
          '--rdp-range_middle-background-color': 'hsl(var(--accent))',
          '--rdp-range_middle-color': 'hsl(var(--accent-foreground))',
        } as React.CSSProperties
      }
    >
      <DayPicker weekStartsOn={weekStartsOn} {...props} />
    </div>
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
