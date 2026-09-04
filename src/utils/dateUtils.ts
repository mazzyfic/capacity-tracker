import { AppData, WeekHorizon, AllocationItem } from '../types';

export function getMondayOfWeek(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  // Sunday (0) maps to -6 days to get the Monday of the concluding work week
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.getFullYear(), d.getMonth(), diff, 0, 0, 0, 0);
  return monday;
}

export function parseDateIso(isoString: string): Date {
  const [year, month, day] = isoString.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function formatDateIso(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatWeekLabel(startDate: Date, endDate: Date): string {
  const startMonth = startDate.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const endMonth = endDate.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const startDay = startDate.getDate();
  const endDay = endDate.getDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${startMonth} ${endDay}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

export function getRolling2Weeks(baseDate: Date = new Date()): WeekHorizon[] {
  const w1Start = getMondayOfWeek(baseDate);
  const w1End = new Date(w1Start.getFullYear(), w1Start.getMonth(), w1Start.getDate() + 4, 23, 59, 59);

  const w2Start = new Date(w1Start.getFullYear(), w1Start.getMonth(), w1Start.getDate() + 7, 0, 0, 0);
  const w2End = new Date(w2Start.getFullYear(), w2Start.getMonth(), w2Start.getDate() + 4, 23, 59, 59);

  const w1IsoStart = formatDateIso(w1Start);
  const w1IsoEnd = formatDateIso(w1End);

  const w2IsoStart = formatDateIso(w2Start);
  const w2IsoEnd = formatDateIso(w2End);

  return [
    {
      id: `w_${w1IsoStart}`,
      label: formatWeekLabel(w1Start, w1End),
      startDate: w1IsoStart,
      endDate: w1IsoEnd,
      archived: false,
    },
    {
      id: `w_${w2IsoStart}`,
      label: formatWeekLabel(w2Start, w2End),
      startDate: w2IsoStart,
      endDate: w2IsoEnd,
      archived: false,
    },
  ];
}

/**
 * Filter items that are still active for a given week start date.
 * - 'ongoing' items always continue
 * - 'secondary_tasks' always continue
 * - 'date' items continue if their endDate >= weekStartDate
 */
export function filterActiveAllocations(items: AllocationItem[], weekStartDate: string): AllocationItem[] {
  return items.filter(item => {
    if (!item.project || item.project.trim() === '') return false;
    if (item.endDateType === 'date' && item.endDate) {
      return item.endDate >= weekStartDate;
    }
    return true;
  });
}

/**
 * Ensures that appData has the active 2-week rolling window and automatically copies
 * previous week allocations over when a new week arrives so no manual re-entry is needed.
 * Every new week added is an exact duplicate of the previous week.
 */
export function syncRollingWeeksAndAllocations(prevData: AppData, baseDate: Date = new Date()): AppData {
  const rollingWeeks = getRolling2Weeks(baseDate);
  const [currentWeek, nextWeek] = rollingWeeks;

  const currentWeeks = prevData.weeks || [];
  const updatedAllocations: Record<string, AllocationItem[]> = { ...(prevData.allocations || {}) };

  const staffList = (prevData.staff || []).slice().sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  staffList.forEach(staff => {
    const currentKey = `${staff.id}_${currentWeek.id}`;
    const nextKey = `${staff.id}_${nextWeek.id}`;

    // 1. Current Week Allocations
    let currentItems = updatedAllocations[currentKey];

    if (!currentItems || currentItems.length === 0) {
      // Check if this week was previously configured in currentWeeks
      const matchedWeek = currentWeeks.find(w => w.startDate === currentWeek.startDate);
      if (matchedWeek && updatedAllocations[`${staff.id}_${matchedWeek.id}`]?.length) {
        currentItems = updatedAllocations[`${staff.id}_${matchedWeek.id}`];
      } else {
        // Find the most recent recorded allocation for this staff member in any week
        const staffKeys = Object.keys(updatedAllocations)
          .filter(k => k.startsWith(`${staff.id}_`))
          .sort();
        if (staffKeys.length > 0) {
          currentItems = updatedAllocations[staffKeys[staffKeys.length - 1]];
        }
      }

      // If still nothing (brand new staff member with no history)
      if (!currentItems || currentItems.length === 0) {
        currentItems = [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
        ];
      }

      updatedAllocations[currentKey] = currentItems.map(item => ({
        ...item,
        changed: item.changed || false,
      }));
    }

    // 2. Next Week Allocations: Duplicate the current week's allocations
    let nextItems = updatedAllocations[nextKey];

    if (!nextItems || nextItems.length === 0) {
      const matchedNext = currentWeeks.find(w => w.startDate === nextWeek.startDate);
      if (matchedNext && updatedAllocations[`${staff.id}_${matchedNext.id}`]?.length) {
        nextItems = updatedAllocations[`${staff.id}_${matchedNext.id}`];
      } else {
        // Duplicate the current week's allocations directly
        nextItems = updatedAllocations[currentKey];
      }

      if (!nextItems || nextItems.length === 0) {
        nextItems = [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
        ];
      }

      updatedAllocations[nextKey] = nextItems.map(item => ({
        ...item,
        changed: false,
      }));
    }
  });

  return {
    ...prevData,
    staff: staffList,
    weeks: rollingWeeks,
    allocations: updatedAllocations,
  };
}
