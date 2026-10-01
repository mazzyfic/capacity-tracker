import { AppData, AllocationItem } from '../types';

const LEGACY_FACTORY_PROJECTS = new Set([
  // Legacy Mazzy factory placeholders
  'api v2 integrations',
  'client sdk support',
  'lms migration architecture',
  'sprint review & qa',
  'security audit & iam',
  'pen-testing fixes',
  'enterprise client onboarding',
  'training workshops',
  'cloud infrastructure & k8s',
  // Legacy Lindsay factory placeholders
  'team lead & management sync',
  'curriculum strategy & review',
  'escalation triage',
  'cross-functional alignment',
  'digital learning module authoring',
  'faculty onboarding',
  'interactive lab prototyping',
  'qa & accessibility checks',
  'content translation & localization',
  'assessment rubric design',
  'video lesson post-production',
  'instructor script coordination',
  'lms platform integration',
  'student technical inquiries',
  // Legacy Kimyatta factory placeholders
  'operations lead & planning',
  'global cohort schedule rollout',
  'resource balancing',
  'academic integrity automation',
  'data pipeline support',
  'student success portal ui',
  'user interviews & feedback',
  'cohort analytics dashboard',
  'weekly metric reporting',
]);

/**
 * Detects whether a team data payload's active rolling weeks contain obsolete
 * generic factory mock data across any of the three teams.
 */
export function isCorruptedFactoryData(data: AppData | null | undefined, _teamId?: string): boolean {
  if (!data) return false;

  const allocations = data.allocations || {};
  const activeWeekIds = Array.isArray(data.weeks)
    ? data.weeks.map(w => w?.id).filter(Boolean)
    : [];

  const keysToInspect = activeWeekIds.length > 0
    ? Object.keys(allocations).filter(k => activeWeekIds.some(wId => k.endsWith(`_${wId}`)))
    : Object.keys(allocations);

  for (const key of keysToInspect) {
    const items = allocations[key];
    if (Array.isArray(items)) {
      for (const item of items) {
        const proj = item?.project?.trim().toLowerCase();
        if (proj && LEGACY_FACTORY_PROJECTS.has(proj)) {
          return true;
        }
      }
    }
  }
  return false;
}

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
