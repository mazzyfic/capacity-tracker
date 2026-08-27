import { AppData, WeekHorizon, AllocationItem } from '../types';

export function getMondayOfWeek(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  // Sunday (0) maps to -6 days to get the Monday of the concluding work week
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.getFullYear(), d.getMonth(), diff, 0, 0, 0, 0);
  return monday;
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
 */
export function syncRollingWeeksAndAllocations(prevData: AppData, baseDate: Date = new Date()): AppData {
  const rollingWeeks = getRolling2Weeks(baseDate);
  const [currentWeek, nextWeek] = rollingWeeks;

  const currentWeeks = prevData.weeks || [];
  const hasExactWeeks =
    currentWeeks.length >= 2 &&
    currentWeeks[0].startDate === currentWeek.startDate &&
    currentWeeks[1].startDate === nextWeek.startDate;

  const updatedAllocations: Record<string, AllocationItem[]> = { ...prevData.allocations };

  prevData.staff.forEach(staff => {
    const currentKey = `${staff.id}_${currentWeek.id}`;
    const nextKey = `${staff.id}_${nextWeek.id}`;

    // 1. Resolve Current Week Allocations
    let sourceForCurrent: AllocationItem[] | undefined = updatedAllocations[currentKey];

    if (!sourceForCurrent || sourceForCurrent.length === 0) {
      // Check if this week was previously configured as Week 2 or by date match in currentWeeks
      const matchedPreviousWeek = currentWeeks.find(w => w.startDate === currentWeek.startDate);
      if (matchedPreviousWeek && updatedAllocations[`${staff.id}_${matchedPreviousWeek.id}`]?.length) {
        sourceForCurrent = updatedAllocations[`${staff.id}_${matchedPreviousWeek.id}`];
      } else {
        // Find the most recent available allocation for this staff member in any previous week
        // Look through currentWeeks in reverse order, or legacy w2, w1 keys
        let fallbackFound: AllocationItem[] | undefined;
        for (let i = currentWeeks.length - 1; i >= 0; i--) {
          const w = currentWeeks[i];
          const candidate = updatedAllocations[`${staff.id}_${w.id}`];
          if (candidate && candidate.length > 0) {
            fallbackFound = candidate;
            break;
          }
        }

        if (!fallbackFound) {
          if (updatedAllocations[`${staff.id}_w2`]?.length) {
            fallbackFound = updatedAllocations[`${staff.id}_w2`];
          } else if (updatedAllocations[`${staff.id}_w1`]?.length) {
            fallbackFound = updatedAllocations[`${staff.id}_w1`];
          } else {
            // Find any key for this staff
            const staffKeys = Object.keys(updatedAllocations).filter(k => k.startsWith(`${staff.id}_`));
            if (staffKeys.length > 0) {
              fallbackFound = updatedAllocations[staffKeys[staffKeys.length - 1]];
            }
          }
        }

        sourceForCurrent = fallbackFound;
      }
    }

    if (!sourceForCurrent || sourceForCurrent.length === 0) {
      sourceForCurrent = [
        { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
      ];
    }

    // Filter out past-due projects whose end date elapsed before the current week
    const validCurrentItems = filterActiveAllocations(sourceForCurrent, currentWeek.startDate);

    updatedAllocations[currentKey] = validCurrentItems.map(item => ({
      ...item,
      changed: item.changed || false,
    }));

    // 2. Resolve Next Week Allocations (Copy forward from Current Week)
    let sourceForNext: AllocationItem[] | undefined = updatedAllocations[nextKey];

    if (!sourceForNext || sourceForNext.length === 0) {
      // Check if next week was previously configured
      const matchedNextWeek = currentWeeks.find(w => w.startDate === nextWeek.startDate);
      if (matchedNextWeek && updatedAllocations[`${staff.id}_${matchedNextWeek.id}`]?.length) {
        sourceForNext = updatedAllocations[`${staff.id}_${matchedNextWeek.id}`];
      } else {
        // Automatically copy all valid allocations from the new Current Week to Next Week
        sourceForNext = validCurrentItems;
      }
    }

    const validNextItems = filterActiveAllocations(sourceForNext || validCurrentItems, nextWeek.startDate);

    // Determine change flag: if next week matches current week, changed is false; if percent differs, mark changed
    updatedAllocations[nextKey] = validNextItems.map(nextItem => {
      const currentMatching = validCurrentItems.find(c => c.project.toLowerCase() === nextItem.project.toLowerCase());
      const hasChangedPct = currentMatching ? currentMatching.percent !== nextItem.percent : false;
      return {
        ...nextItem,
        changed: nextItem.changed ?? hasChangedPct,
      };
    });
  });

  return {
    ...prevData,
    staff: (prevData.staff || []).slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    weeks: rollingWeeks,
    allocations: updatedAllocations,
  };
}
