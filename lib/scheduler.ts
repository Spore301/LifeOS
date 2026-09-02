import { Task, TimeSlot, ScheduledTask, ProposedSchedule, Priority } from './types';
import { getTimeZone, zonedWallClock } from './timezone';
import { isDueOn } from './recurrence';

interface WorkHours {
  startHour: number; // e.g. 9 for 09:00
  endHour: number;   // e.g. 18 for 18:00
}

const DEFAULT_WORK_HOURS: WorkHours = {
  startHour: parseInt(process.env.NEXT_PUBLIC_WORK_START?.split(':')[0] || '9', 10),
  endHour: parseInt(process.env.NEXT_PUBLIC_WORK_END?.split(':')[0] || '18', 10),
};

const PRIORITY_WEIGHT: Record<Priority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Pure TypeScript Greedy First-Fit Scheduling & Cascade Rescheduling Engine
 */
export function calculateProposedSchedule(
  tasks: Task[],
  existingBusySlots: TimeSlot[] = [],
  workHours: WorkHours = DEFAULT_WORK_HOURS,
  targetDate: Date = new Date(),
  timeZone: string = getTimeZone()
): ProposedSchedule {
  const conflictWarnings: string[] = [];
  const scheduledTasks: ScheduledTask[] = [];
  const unscheduledTasks: Task[] = [];
  const bumpedTasks: Task[] = [];

  // Filter out blocked tasks from immediate scheduling
  const unblocked = tasks.filter(t => !t.isBlocked);
  const blockedTasks = tasks.filter(t => t.isBlocked);

  // A recurring task only belongs on the days its rule names. Without this a
  // routine set to BYDAY=TU,TH,SU was also booked today, duplicating its series.
  const activeTasks = unblocked.filter(t => isDueOn(t.recurrence, targetDate, timeZone));
  for (const t of unblocked) {
    if (!activeTasks.includes(t)) {
      conflictWarnings.push(
        `Task "${t.title}" recurs on other days (${t.recurrence}) and is not due today.`
      );
    }
  }

  if (blockedTasks.length > 0) {
    blockedTasks.forEach(bt => {
      conflictWarnings.push(`Task "${bt.title}" is flagged as blocked (${bt.blockerReason || 'Waiting on dependency'}) and was postponed.`);
      unscheduledTasks.push(bt);
    });
  }

  // A fixed commitment (a meeting, a call) is not a duration looking for a gap.
  // Place it where it actually is, then plan the day around it. Previously every
  // task was treated as movable, so the scheduler kept relocating a standup that
  // could not move and the agent had to write slots by hand.
  const fixedTasks = activeTasks.filter((t) => t.fixedStart);
  const flexibleTasks = activeTasks.filter((t) => !t.fixedStart);

  const fixedSlots: TimeSlot[] = [];
  for (const task of fixedTasks) {
    const start = new Date(task.fixedStart as string);
    if (Number.isNaN(start.getTime())) {
      conflictWarnings.push(`Task "${task.title}" has an unreadable fixed time and was skipped.`);
      unscheduledTasks.push(task);
      continue;
    }
    const end = task.fixedEnd
      ? new Date(task.fixedEnd)
      : new Date(start.getTime() + task.durationMinutes * 60 * 1000);

    // Report a clash rather than resolving it: only the user can decide whether
    // to leave a meeting or the thing it collides with.
    const clash = existingBusySlots.find(
      (b) => new Date(b.start) < end && new Date(b.end) > start
    );
    if (clash) {
      conflictWarnings.push(
        `"${task.title}" is fixed at this time but overlaps something already on the calendar.`
      );
    }

    const slot = { start: start.toISOString(), end: end.toISOString() };
    scheduledTasks.push({ task, slot });
    fixedSlots.push(slot);
  }

  // Everything else is planned around the fixed commitments as if they were busy.
  const blockedOut = [...existingBusySlots, ...fixedSlots];

  // Sort tasks by priority descending
  const sortedTasks = [...flexibleTasks].sort(
    (a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
  );

  // Working window, anchored to the USER's wall clock. setHours() here would use the
  // server's local zone (UTC in the container), which put a "09:00" block at 14:30 IST.
  const dayStart = zonedWallClock(targetDate, workHours.startHour, 0, timeZone);
  const dayEnd = zonedWallClock(targetDate, workHours.endHour, 0, timeZone);

  // If target date is today and now is within work hours, start search from current time rounded up
  const now = new Date();
  let searchCursor = new Date(dayStart);
  if (now > dayStart && now < dayEnd) {
    // Round cursor to next 15-min block
    const roundedMinutes = Math.ceil(now.getMinutes() / 15) * 15;
    searchCursor = new Date(now);
    searchCursor.setMinutes(roundedMinutes, 0, 0);
  }

  // Sort busy slots chronologically
  const busySorted = [...blockedOut].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  // Find all free gaps between searchCursor and dayEnd
  const freeGaps: TimeSlot[] = [];
  let currentPointer = new Date(searchCursor);

  for (const busy of busySorted) {
    const busyStart = new Date(busy.start);
    const busyEnd = new Date(busy.end);

    if (busyEnd <= currentPointer) continue; // Past busy block

    if (busyStart > currentPointer) {
      // Free gap found
      const gapEnd = busyStart < dayEnd ? busyStart : new Date(dayEnd);
      if (gapEnd > currentPointer) {
        freeGaps.push({
          start: currentPointer.toISOString(),
          end: gapEnd.toISOString(),
        });
      }
    }

    if (busyEnd > currentPointer) {
      currentPointer = new Date(busyEnd);
    }
  }

  // Add final gap if pointer hasn't reached dayEnd
  if (currentPointer < dayEnd) {
    freeGaps.push({
      start: currentPointer.toISOString(),
      end: dayEnd.toISOString(),
    });
  }

  // Greedy First-Fit Placement
  for (const task of sortedTasks) {
    const durationMs = task.durationMinutes * 60 * 1000;
    let placed = false;

    for (let i = 0; i < freeGaps.length; i++) {
      const gap = freeGaps[i];
      const gapStartMs = new Date(gap.start).getTime();
      const gapEndMs = new Date(gap.end).getTime();
      const gapDurationMs = gapEndMs - gapStartMs;

      if (gapDurationMs >= durationMs) {
        // Fits in this gap!
        const slotStart = new Date(gapStartMs);
        const slotEnd = new Date(gapStartMs + durationMs);

        scheduledTasks.push({
          task,
          slot: {
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
          },
        });

        // Update remaining gap space
        if (gapEndMs - slotEnd.getTime() >= 15 * 60 * 1000) {
          freeGaps[i] = {
            start: slotEnd.toISOString(),
            end: gap.end,
          };
        } else {
          // Remove filled gap
          freeGaps.splice(i, 1);
        }

        placed = true;
        break;
      }
    }

    // Cascade Reschedule / Bumping logic if an urgent task cannot fit
    if (!placed) {
      if (task.priority === 'urgent' || task.priority === 'high') {
        // Try bumping lower-priority scheduled task
        const lowerPriorityScheduled = scheduledTasks.filter(
          // A fixed commitment is never bumped - it is not ours to move, however
          // urgent the thing competing for its slot happens to be.
          st => !st.task.fixedStart && PRIORITY_WEIGHT[st.task.priority] < PRIORITY_WEIGHT[task.priority]
        );

        if (lowerPriorityScheduled.length > 0) {
          // Bump the lowest priority item
          const lowest = lowerPriorityScheduled.sort(
            (a, b) => PRIORITY_WEIGHT[a.task.priority] - PRIORITY_WEIGHT[b.task.priority]
          )[0];

          // Swap slots
          const bumpIndex = scheduledTasks.findIndex(st => st.task.id === lowest.task.id);
          if (bumpIndex !== -1) {
            const freedSlot = scheduledTasks[bumpIndex].slot;
            scheduledTasks.splice(bumpIndex, 1);
            bumpedTasks.push(lowest.task);

            scheduledTasks.push({
              task,
              slot: freedSlot,
            });

            conflictWarnings.push(
              `Bumped lower-priority task "${lowest.task.title}" to accommodate urgent task "${task.title}".`
            );
            placed = true;
          }
        }
      }

      if (!placed) {
        unscheduledTasks.push(task);
        conflictWarnings.push(`Could not find an available slot today for "${task.title}" (${task.durationMinutes} mins).`);
      }
    }
  }

  // Sort final scheduled tasks chronologically by start time
  scheduledTasks.sort((a, b) => new Date(a.slot.start).getTime() - new Date(b.slot.start).getTime());

  return {
    scheduledTasks,
    unscheduledTasks,
    bumpedTasks,
    conflictWarnings,
  };
}
