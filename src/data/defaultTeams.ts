import { AppData, TeamSummary } from '../types';
import { getRolling2Weeks } from '../utils/dateUtils';

export type { TeamSummary };

export const DEFAULT_TEAMS_LIST: TeamSummary[] = [
  { id: 'team_mazzy', name: 'Team Mazzy', leadName: 'Mazzy' },
  { id: 'team_kimyatta', name: 'Team Kimyatta', leadName: 'Kimyatta' },
  { id: 'team_lindsay', name: 'Team Lindsay', leadName: 'Lindsay' },
];

export const getDefaultTeamData = (teamId: string): AppData => {
  const initialWeeks = getRolling2Weeks();
  const [w1, w2] = initialWeeks;

  if (teamId === 'team_lindsay') {
    return {
      teamTitle: 'Team Lindsay',
      teamLeadId: 'staff_lindsay_1',
      staff: [
        { id: 'staff_lindsay_6', name: 'Ben' },
        { id: 'staff_lindsay_5', name: 'Laura' },
        { id: 'staff_lindsay_1', name: 'Lindsay', notes: 'PTO - Sept 24, 25, 28' },
        { id: 'staff_lindsay_2', name: 'Mary', notes: 'Current ongoing health issues' },
        {
          id: 'staff_lindsay_4',
          name: 'Sherien',
          notes: 'UCLAA-AIGOV or UCLAA-SEP are up in the air with when they are actually going to start',
        },
        { id: 'staff_lindsay_3', name: 'Thomas' },
      ],
      notes: {
        staff_lindsay_1: 'PTO - Sept 24, 25, 28',
        staff_lindsay_2: 'Current ongoing health issues',
        staff_lindsay_4: 'UCLAA-AIGOV or UCLAA-SEP are up in the air with when they are actually going to start',
      },
      weeks: initialWeeks,
      allocations: {
        [`staff_lindsay_1_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'People Management', percent: 50, changed: false, endDateType: 'ongoing', endDate: '2026-09-30' },
          { project: 'School SPOC', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'New Hire Onboarding (HMS-LHAP and WH-HRAI)', percent: 35, changed: false, endDateType: 'ongoing', endDate: '' },
        ],
        [`staff_lindsay_1_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'People Management', percent: 50, changed: false, endDateType: 'ongoing', endDate: '2026-09-30' },
          { project: 'School SPOC', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'New Hire Onboarding (HMS-LHAP and WH-HRAI)', percent: 35, changed: false, endDateType: 'ongoing', endDate: '' },
        ],
        [`staff_lindsay_2_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'ROT-AIF', percent: 40, changed: false, endDateType: 'date', endDate: '2026-10-25' },
        ],
        [`staff_lindsay_2_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'ROT-AIF', percent: 40, changed: false, endDateType: 'date', endDate: '2026-10-25' },
        ],
        [`staff_lindsay_3_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'CJ-AIM', percent: 20, changed: false, endDateType: 'date', endDate: '2026-09-28' },
        ],
        [`staff_lindsay_3_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'CJ-AIM', percent: 20, changed: false, endDateType: 'date', endDate: '2026-09-28' },
        ],
        [`staff_lindsay_4_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'KLG-MLP Redesign Scoping', percent: 15, changed: false, endDateType: 'date', endDate: '2026-10-04' },
          { project: 'CJ-LSPA', percent: 66, changed: false, endDateType: 'date', endDate: '2026-10-04' },
        ],
        [`staff_lindsay_4_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'KLG-MLP Redesign Scoping', percent: 15, changed: false, endDateType: 'date', endDate: '2026-10-04' },
          { project: 'CJ-LSPA', percent: 66, changed: false, endDateType: 'date', endDate: '2026-10-04' },
        ],
        [`staff_lindsay_5_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'WH-CSO redesign scoping', percent: 33, changed: false, endDateType: 'date', endDate: '2026-10-22' },
        ],
        [`staff_lindsay_5_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'WH-CSO redesign scoping', percent: 33, changed: false, endDateType: 'date', endDate: '2026-10-22' },
        ],
        [`staff_lindsay_6_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'WH-HRAI', percent: 20, changed: false, endDateType: 'date', endDate: '2026-11-29' },
        ],
        [`staff_lindsay_6_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'WH-HRAI', percent: 20, changed: false, endDateType: 'date', endDate: '2026-11-29' },
        ],
      },
    };
  }

  if (teamId === 'team_kimyatta') {
    return {
      teamTitle: 'Team Kimyatta',
      teamLeadId: 'staff_kimyatta_1',
      staff: [
        { id: 'staff_kimyatta_2', name: 'Anna' },
        { id: 'staff_kimyatta_3', name: 'Belle' },
        { id: 'staff_kimyatta_4', name: 'Caroline', notes: 'Part-time schedule/20hrs per week' },
        { id: 'staff_kimyatta_5', name: 'Jenna', notes: 'Pick up of STF-AGAI' },
        { id: 'staff_kimyatta_6', name: 'Kelley' },
        { id: 'staff_kimyatta_1', name: 'Kimyatta' },
      ],
      notes: {
        staff_kimyatta_4: 'Part-time schedule/20hrs per week',
        staff_kimyatta_5: 'Pick up of STF-AGAI',
      },
      weeks: initialWeeks,
      allocations: {
        [`staff_kimyatta_1_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'People Management', percent: 50, changed: false, endDateType: 'ongoing', endDate: '2026-09-28' },
          { project: 'UCH-AI', percent: 40, changed: false, endDateType: 'date', endDate: '2026-12-09' },
        ],
        [`staff_kimyatta_1_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'People Management', percent: 50, changed: false, endDateType: 'ongoing', endDate: '2026-09-28' },
          { project: 'UCH-AI', percent: 40, changed: false, endDateType: 'date', endDate: '2026-12-09' },
        ],
        [`staff_kimyatta_2_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'ROT-EPI', percent: 40, changed: false, endDateType: 'date', endDate: '2026-12-03' },
          { project: 'STF-AISE (Blended)', percent: 10, changed: false, endDateType: 'date', endDate: '2026-10-08' },
          { project: 'CBT-CEO Redesign', percent: 14, changed: false, endDateType: 'date', endDate: '2027-02-02' },
          { project: 'UMIB-OPM Blended', percent: 18, changed: false, endDateType: 'date', endDate: '2026-10-23' },
        ],
        [`staff_kimyatta_2_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'ROT-EPI', percent: 40, changed: false, endDateType: 'date', endDate: '2026-12-03' },
          { project: 'STF-AISE (Blended)', percent: 10, changed: false, endDateType: 'date', endDate: '2026-10-08' },
          { project: 'CBT-CEO Redesign', percent: 14, changed: false, endDateType: 'date', endDate: '2027-02-02' },
          { project: 'UMIB-OPM Blended', percent: 18, changed: false, endDateType: 'date', endDate: '2026-10-23' },
        ],
        [`staff_kimyatta_3_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'IMP-CDAIO', percent: 45, changed: false, endDateType: 'date', endDate: '2026-10-29' },
          { project: 'KLG-CMO redesign scoping', percent: 30, changed: false, endDateType: 'date', endDate: '2026-10-10' },
        ],
        [`staff_kimyatta_3_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'IMP-CDAIO', percent: 45, changed: false, endDateType: 'date', endDate: '2026-10-29' },
          { project: 'KLG-CMO redesign scoping', percent: 30, changed: false, endDateType: 'date', endDate: '2026-10-10' },
        ],
        [`staff_kimyatta_4_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'Onboarding', percent: 30, changed: false, endDateType: 'date', endDate: '2026-12-18' },
        ],
        [`staff_kimyatta_4_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'Onboarding', percent: 30, changed: false, endDateType: 'date', endDate: '2026-12-18' },
        ],
        [`staff_kimyatta_5_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'STF-NCAI', percent: 45, changed: false, endDateType: 'date', endDate: '2026-11-23' },
          { project: 'UMIB-AILHC', percent: 8, changed: false, endDateType: 'date', endDate: '2026-10-21' },
          { project: 'UCH-AILLF blended and UCH-AILG LOL combo', percent: 8, changed: false, endDateType: 'date', endDate: '2026-10-16' },
          { project: 'WH-AIF', percent: 20, changed: false, endDateType: 'date', endDate: '2027-02-18' },
        ],
        [`staff_kimyatta_5_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'STF-NCAI', percent: 45, changed: false, endDateType: 'date', endDate: '2026-11-23' },
          { project: 'UMIB-AILHC', percent: 8, changed: false, endDateType: 'date', endDate: '2026-10-21' },
          { project: 'UCH-AILLF blended and UCH-AILG LOL combo', percent: 8, changed: false, endDateType: 'date', endDate: '2026-10-16' },
          { project: 'WH-AIF', percent: 20, changed: false, endDateType: 'date', endDate: '2027-02-18' },
        ],
        [`staff_kimyatta_6_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'MO-AIPB', percent: 50, changed: false, endDateType: 'date', endDate: '2026-11-12' },
          { project: 'MPE-AIS (MPE-AIST LOL to Asynch)', percent: 10, changed: false, endDateType: 'date', endDate: '2027-02-28' },
          { project: 'CBT-AIF Blended', percent: 20, changed: false, endDateType: 'date', endDate: '2026-10-01' },
        ],
        [`staff_kimyatta_6_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
          { project: 'MO-AIPB', percent: 50, changed: false, endDateType: 'date', endDate: '2026-11-12' },
          { project: 'MPE-AIS (MPE-AIST LOL to Asynch)', percent: 10, changed: false, endDateType: 'date', endDate: '2027-02-28' },
          { project: 'CBT-AIF Blended', percent: 20, changed: false, endDateType: 'date', endDate: '2026-10-01' },
        ],
      },
    };
  }

  // Default: Team Mazzy (team_mazzy)
  return {
    teamTitle: 'Team Mazzy',
    teamLeadId: 'staff_3',
    staff: [
      { id: 'staff_1', name: 'Amy', notes: 'MS-EPING delayed, helping Jenna with CRs' },
      { id: 'staff_3', name: 'Mazzy' },
      { id: 'staff_4', name: 'Megan', notes: 'PTO Ocotber 5' },
      {
        id: 'staff_5',
        name: 'Michele',
        notes:
          "MPE.BCA DHD was 09.17. The amount of hours for CHB.CHO is going to increase and the schedule will be very tight. Still haven't met with 2 faculty and don't have 2 of 3 contact info. Also not sure about program alignment with new outcomes. Also, marketing told me we won't have this project all correct for dec 14th launch and I should consider that this will be ongoing design through the next few runs.",
      },
      { id: 'staff_6', name: 'Molly', notes: 'CBT-CIO content is late from Vito, UCH-AICH slides are late' },
    ],
    notes: {
      staff_1: 'MS-EPING delayed, helping Jenna with CRs',
      staff_2: 'LAST DAY 11 SEPT',
      staff_4: 'PTO Ocotber 5',
      staff_5:
        "MPE.BCA DHD was 09.17. The amount of hours for CHB.CHO is going to increase and the schedule will be very tight. Still haven't met with 2 faculty and don't have 2 of 3 contact info. Also not sure about program alignment with new outcomes. Also, marketing told me we won't have this project all correct for dec 14th launch and I should consider that this will be ongoing design through the next few runs.",
      staff_6: 'CBT-CIO content is late from Vito, UCH-AICH slides are late',
    },
    weeks: initialWeeks,
    allocations: {
      [`staff_1_${w1.id}`]: [
        { project: 'Course Maintenance', percent: 20, changed: true, endDateType: 'ongoing', endDate: '' },
        { project: 'Triage', percent: 10, changed: false, endDateType: 'ongoing', endDate: '' },
        { project: 'AI Tutor Bot Working Group', percent: 10, changed: true, endDateType: 'ongoing', endDate: '2026-10-02' },
        { project: 'AI Initiative - Resource Audit', percent: 5, changed: false, endDateType: 'ongoing', endDate: '' },
        { project: 'MO-LLM.LOL', percent: 8, changed: true, endDateType: 'date', endDate: '2026-09-18' },
        { project: 'MO-AIPB', percent: 20, changed: true, endDateType: 'date', endDate: '2026-11-26' },
        { project: 'MS-EPING', percent: 5, changed: true, endDateType: 'date', endDate: '2027-08-29' },
        { project: 'UMIB-AILHC/UCH-AIF', percent: 10, changed: false, endDateType: 'secondary_tasks', endDate: '' },
      ],
      [`staff_1_${w2.id}`]: [
        { project: 'Course Maintenance', percent: 20, changed: false, endDateType: 'ongoing', endDate: '' },
        { project: 'Triage', percent: 10, changed: false, endDateType: 'ongoing', endDate: '' },
        { project: 'AI Tutor Bot Working Group', percent: 5, changed: false, endDateType: 'ongoing', endDate: '2026-10-02' },
        { project: 'AI Initiative - Resource Audit', percent: 5, changed: false, endDateType: 'ongoing', endDate: '' },
        { project: 'MO-LLM.LOL', percent: 8, changed: false, endDateType: 'date', endDate: '2026-09-18' },
        { project: 'MO-AIPB', percent: 5, changed: true, endDateType: 'date', endDate: '2026-11-26' },
        { project: 'MS-EPING', percent: 5, changed: false, endDateType: 'date', endDate: '2027-08-29' },
        { project: 'UMIB-AILHC/UCH-AIF', percent: 20, changed: true, endDateType: 'secondary_tasks', endDate: '' },
      ],
      [`staff_3_${w1.id}`]: [
        { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
        { project: 'People Management', percent: 50, changed: false, endDateType: 'ongoing', endDate: '2026-09-15' },
        { project: 'School Design SPOC', percent: 10, changed: false, endDateType: 'ongoing', endDate: '' },
        { project: 'Onboarding', percent: 15, changed: false, endDateType: 'date', endDate: '2026-12-18' },
        { project: 'INS-SL R2', percent: 20, changed: false, endDateType: 'date', endDate: '2026-11-02' },
      ],
      [`staff_3_${w2.id}`]: [
        { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
        { project: 'People Management', percent: 50, changed: false, endDateType: 'ongoing', endDate: '2026-09-15' },
        { project: 'School Design SPOC', percent: 10, changed: false, endDateType: 'ongoing', endDate: '' },
        { project: 'Onboarding', percent: 15, changed: false, endDateType: 'date', endDate: '2026-12-18' },
        { project: 'INS-SL R2', percent: 20, changed: false, endDateType: 'date', endDate: '2026-11-02' },
      ],
      [`staff_4_${w1.id}`]: [
        { project: 'Course Maintenance', percent: 20, changed: false, endDateType: 'ongoing', endDate: '' },
        { project: 'ROT-AIF', percent: 55, changed: true, endDateType: 'date', endDate: '2026-10-29' },
        { project: "GAI'S PROJECTS", percent: 15, changed: true, endDateType: 'secondary_tasks', endDate: '' },
        { project: 'ONBOARDING', percent: 10, changed: false, endDateType: 'date', endDate: '2026-12-28' },
        { project: 'MS-EPING', percent: 0, changed: true, endDateType: 'date', endDate: '2027-08-29' },
      ],
      [`staff_4_${w2.id}`]: [
        { project: 'Course Maintenance', percent: 20, changed: false, endDateType: 'ongoing', endDate: '' },
        { project: 'ROT-AIF', percent: 55, changed: true, endDateType: 'date', endDate: '2026-10-29' },
        { project: "GAI'S PROJECTS", percent: 15, changed: true, endDateType: 'secondary_tasks', endDate: '' },
        { project: 'ONBOARDING', percent: 10, changed: false, endDateType: 'date', endDate: '2026-12-28' },
        { project: 'MS-EPING', percent: 0, changed: true, endDateType: 'date', endDate: '2027-08-29' },
      ],
      [`staff_5_${w1.id}`]: [
        { project: 'Course Maintenance', percent: 10, changed: false, endDateType: 'ongoing', endDate: '' },
        { project: 'AI Committee', percent: 3, changed: false, endDateType: 'ongoing', endDate: '2026-10-15' },
        { project: 'KLG-LHAI', percent: 50, changed: false, endDateType: 'date', endDate: '2026-09-01' },
        { project: 'CBT-CHRO', percent: 40, changed: false, endDateType: 'date', endDate: '2026-09-02' },
      ],
      [`staff_5_${w2.id}`]: [
        { project: 'Course Maintenance', percent: 10, changed: false, endDateType: 'ongoing', endDate: '' },
        { project: 'AI Committee', percent: 3, changed: false, endDateType: 'ongoing', endDate: '2026-10-15' },
        { project: 'KLG-LHAI', percent: 60, changed: true, endDateType: 'date', endDate: '2026-09-01' },
        { project: 'CBT-CHRO', percent: 35, changed: true, endDateType: 'date', endDate: '2026-09-02' },
        { project: 'CE-CPMB', percent: 3, changed: false, endDateType: 'date', endDate: '' },
      ],
      [`staff_6_${w1.id}`]: [
        { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
        { project: 'CBT-CIO LOL', percent: 20, changed: true, endDateType: 'date', endDate: '2026-09-11' },
        { project: 'STF-AICM', percent: 25, changed: true, endDateType: 'date', endDate: '2026-09-13' },
        { project: 'UCH-AILC Blended and UCH-AIHC LOL combo', percent: 18, changed: false, endDateType: 'date', endDate: '2026-09-13' },
        { project: 'CBT-BOD Blended', percent: 15, changed: false, endDateType: 'date', endDate: '2026-10-11' },
        { project: 'UCH-AIINP In-person Event for AI Hub Blended courses', percent: 10, changed: false, endDateType: 'date', endDate: '2026-10-09' },
      ],
      [`staff_6_${w2.id}`]: [
        { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing', endDate: '' },
        { project: 'CBT-CIO LOL', percent: 20, changed: false, endDateType: 'date', endDate: '2026-09-11' },
        { project: 'STF-AICM', percent: 25, changed: false, endDateType: 'date', endDate: '2026-09-13' },
        { project: 'UCH-AILC Blended and UCH-AIHC LOL combo', percent: 18, changed: false, endDateType: 'date', endDate: '2026-09-13' },
        { project: 'CBT-BOD Blended', percent: 15, changed: false, endDateType: 'date', endDate: '2026-10-11' },
        { project: 'UCH-AIINP In-person Event for AI Hub Blended courses', percent: 10, changed: false, endDateType: 'date', endDate: '2026-10-09' },
      ],
    },
  };
};
