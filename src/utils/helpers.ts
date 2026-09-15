import { AppData, AllocationItem } from '../types';

/**
 * Normalizes team title, resolves the designated team lead,
 * and maintains alphabetical sorting of team roster.
 */
export function normalizeTeamData(data: AppData, teamId: string): AppData {
  if (!data) {
    return {
      teamTitle: 'Capacity Tracker',
      teamLeadId: '',
      weeks: [],
      staff: [],
      allocations: {},
    };
  }

  const cleaned: AppData = { ...data };

  if (teamId === 'team_mazzy') {
    cleaned.teamTitle = 'Team Mazzy';
    const mazzyMember = (cleaned.staff || []).find(s => s && s.name && s.name.toLowerCase() === 'mazzy');
    if (mazzyMember && cleaned.teamLeadId !== mazzyMember.id) {
      cleaned.teamLeadId = mazzyMember.id;
    }
  } else if (teamId === 'team_lindsay') {
    cleaned.teamTitle = 'Team Lindsay';
    const lindsayMember = (cleaned.staff || []).find(s => s && s.name && s.name.toLowerCase() === 'lindsay');
    if (lindsayMember && cleaned.teamLeadId !== lindsayMember.id) {
      cleaned.teamLeadId = lindsayMember.id;
    }
  } else if (teamId === 'team_kimyatta') {
    cleaned.teamTitle = 'Team Kimyatta';
    const kimyattaMember = (cleaned.staff || []).find(s => s && s.name && s.name.toLowerCase() === 'kimyatta') || (cleaned.staff && cleaned.staff[0]);
    if (kimyattaMember && cleaned.teamLeadId !== kimyattaMember.id) {
      cleaned.teamLeadId = kimyattaMember.id;
    }
  }

  if (Array.isArray(cleaned.staff)) {
    cleaned.staff = cleaned.staff
      .filter(Boolean)
      .slice()
      .sort((a, b) => {
        const nameA = a?.name || '';
        const nameB = b?.name || '';
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      });
  } else {
    cleaned.staff = [];
  }

  return cleaned;
}

/**
 * Standardized descriptive text for project allocation items across tooltips,
 * popovers, and CSV exports.
 */
export function formatAllocationDetail(item: AllocationItem): string {
  if (!item) return '';
  const projName = item.project ? String(item.project).trim() : 'Unnamed Project';
  const pct = typeof item.percent === 'number' && !isNaN(item.percent) ? item.percent : (Number(item.percent) || 0);

  let endInfo = '';
  if (item.endDateType === 'ongoing') {
    endInfo = ' (Ongoing)';
  } else if (item.endDateType === 'secondary_tasks') {
    endInfo = ' (Secondary Tasks)';
  } else if (item.endDate) {
    endInfo = ` (End: ${item.endDate})`;
  }

  return `${projName}: ${pct}%${endInfo}`;
}
