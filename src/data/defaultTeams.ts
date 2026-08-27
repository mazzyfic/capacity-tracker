import { AppData } from '../types';
import { getRolling2Weeks } from '../utils/dateUtils';

export interface TeamSummary {
  id: string;
  name: string;
  leadName: string;
}

export const DEFAULT_TEAMS_LIST: TeamSummary[] = [
  { id: 'theglobal5', name: 'TheGlobal5', leadName: 'Amy' },
  { id: 'team_lindsay', name: 'Team Lindsay', leadName: 'Lindsay' },
  { id: 'team_marcus', name: 'Team Marcus', leadName: 'Marcus' },
];

export const getDefaultTeamData = (teamId: string): AppData => {
  const initialWeeks = getRolling2Weeks();
  const [w1, w2] = initialWeeks;

  if (teamId === 'team_lindsay') {
    return {
      teamTitle: 'Team Lindsay Capacity Tracker',
      teamLeadId: 'staff_lindsay_1',
      staff: [
        { id: 'staff_lindsay_1', name: 'Lindsay' },
        { id: 'staff_lindsay_2', name: 'Mary' },
        { id: 'staff_lindsay_3', name: 'Thomas' },
        { id: 'staff_lindsay_4', name: 'Sherien' },
        { id: 'staff_lindsay_5', name: 'Laura' },
        { id: 'staff_lindsay_6', name: 'Ben' },
      ],
      weeks: initialWeeks,
      allocations: {
        // Lindsay (Team Lead)
        [`staff_lindsay_1_${w1.id}`]: [
          { project: 'Team Lead & Management Sync', percent: 30, changed: false, endDateType: 'ongoing' },
          { project: 'Curriculum Strategy & Review', percent: 40, changed: false, endDateType: 'date', endDate: '2026-09-30' },
          { project: 'Escalation Triage', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Cross-functional Alignment', percent: 15, changed: false, endDateType: 'secondary_tasks' },
        ],
        [`staff_lindsay_1_${w2.id}`]: [
          { project: 'Team Lead & Management Sync', percent: 30, changed: false, endDateType: 'ongoing' },
          { project: 'Curriculum Strategy & Review', percent: 40, changed: false, endDateType: 'date', endDate: '2026-09-30' },
          { project: 'Escalation Triage', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Cross-functional Alignment', percent: 15, changed: false, endDateType: 'secondary_tasks' },
        ],
        // Mary
        [`staff_lindsay_2_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Digital Learning Module Authoring', percent: 55, changed: false, endDateType: 'date', endDate: '2026-09-25' },
          { project: 'Faculty Onboarding', percent: 30, changed: false, endDateType: 'ongoing' },
        ],
        [`staff_lindsay_2_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Digital Learning Module Authoring', percent: 55, changed: false, endDateType: 'date', endDate: '2026-09-25' },
          { project: 'Faculty Onboarding', percent: 30, changed: false, endDateType: 'ongoing' },
        ],
        // Thomas
        [`staff_lindsay_3_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Interactive Lab Prototyping', percent: 65, changed: false, endDateType: 'date', endDate: '2026-10-10' },
          { project: 'QA & Accessibility Checks', percent: 20, changed: false, endDateType: 'secondary_tasks' },
        ],
        [`staff_lindsay_3_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Interactive Lab Prototyping', percent: 65, changed: false, endDateType: 'date', endDate: '2026-10-10' },
          { project: 'QA & Accessibility Checks', percent: 20, changed: false, endDateType: 'secondary_tasks' },
        ],
        // Sherien
        [`staff_lindsay_4_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Content Translation & Localization', percent: 60, changed: false, endDateType: 'date', endDate: '2026-09-18' },
          { project: 'Assessment Rubric Design', percent: 25, changed: false, endDateType: 'secondary_tasks' },
        ],
        [`staff_lindsay_4_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Content Translation & Localization', percent: 60, changed: false, endDateType: 'date', endDate: '2026-09-18' },
          { project: 'Assessment Rubric Design', percent: 25, changed: false, endDateType: 'secondary_tasks' },
        ],
        // Laura
        [`staff_lindsay_5_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Video Lesson Post-Production', percent: 50, changed: false, endDateType: 'date', endDate: '2026-09-22' },
          { project: 'Instructor Script Coordination', percent: 35, changed: false, endDateType: 'ongoing' },
        ],
        [`staff_lindsay_5_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Video Lesson Post-Production', percent: 50, changed: false, endDateType: 'date', endDate: '2026-09-22' },
          { project: 'Instructor Script Coordination', percent: 35, changed: false, endDateType: 'ongoing' },
        ],
        // Ben
        [`staff_lindsay_6_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'LMS Platform Integration', percent: 70, changed: false, endDateType: 'date', endDate: '2026-10-05' },
          { project: 'Student Technical Inquiries', percent: 15, changed: false, endDateType: 'ongoing' },
        ],
        [`staff_lindsay_6_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'LMS Platform Integration', percent: 70, changed: false, endDateType: 'date', endDate: '2026-10-05' },
          { project: 'Student Technical Inquiries', percent: 15, changed: false, endDateType: 'ongoing' },
        ],
      },
    };
  }

  if (teamId === 'team_marcus') {
    return {
      teamTitle: 'Team Marcus Capacity Tracker',
      teamLeadId: 'staff_marcus_1',
      staff: [
        { id: 'staff_marcus_1', name: 'Marcus' },
        { id: 'staff_marcus_2', name: 'David' },
        { id: 'staff_marcus_3', name: 'Elena' },
        { id: 'staff_marcus_4', name: 'Jason' },
        { id: 'staff_marcus_5', name: 'Chloe' },
        { id: 'staff_marcus_6', name: 'Sam' },
      ],
      weeks: initialWeeks,
      allocations: {
        [`staff_marcus_1_${w1.id}`]: [
          { project: 'Operations Lead & Planning', percent: 35, changed: false, endDateType: 'ongoing' },
          { project: 'Global Cohort Schedule Rollout', percent: 45, changed: false, endDateType: 'date', endDate: '2026-09-28' },
          { project: 'Resource Balancing', percent: 20, changed: false, endDateType: 'secondary_tasks' },
        ],
        [`staff_marcus_1_${w2.id}`]: [
          { project: 'Operations Lead & Planning', percent: 35, changed: false, endDateType: 'ongoing' },
          { project: 'Global Cohort Schedule Rollout', percent: 45, changed: false, endDateType: 'date', endDate: '2026-09-28' },
          { project: 'Resource Balancing', percent: 20, changed: false, endDateType: 'secondary_tasks' },
        ],
        [`staff_marcus_2_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Academic Integrity Automation', percent: 65, changed: false, endDateType: 'date', endDate: '2026-10-02' },
          { project: 'Data Pipeline Support', percent: 20, changed: false, endDateType: 'secondary_tasks' },
        ],
        [`staff_marcus_2_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Academic Integrity Automation', percent: 65, changed: false, endDateType: 'date', endDate: '2026-10-02' },
          { project: 'Data Pipeline Support', percent: 20, changed: false, endDateType: 'secondary_tasks' },
        ],
        [`staff_marcus_3_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Student Success Portal UI', percent: 60, changed: false, endDateType: 'date', endDate: '2026-09-24' },
          { project: 'User Interviews & Feedback', percent: 25, changed: false, endDateType: 'ongoing' },
        ],
        [`staff_marcus_3_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Student Success Portal UI', percent: 60, changed: false, endDateType: 'date', endDate: '2026-09-24' },
          { project: 'User Interviews & Feedback', percent: 25, changed: false, endDateType: 'ongoing' },
        ],
        [`staff_marcus_4_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Partner University Data Sync', percent: 55, changed: false, endDateType: 'date', endDate: '2026-09-18' },
          { project: 'API Gateway Maintenance', percent: 30, changed: false, endDateType: 'ongoing' },
        ],
        [`staff_marcus_4_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Partner University Data Sync', percent: 55, changed: false, endDateType: 'date', endDate: '2026-09-18' },
          { project: 'API Gateway Maintenance', percent: 30, changed: false, endDateType: 'ongoing' },
        ],
        [`staff_marcus_5_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Live Webinar Streaming Infrastructure', percent: 50, changed: false, endDateType: 'date', endDate: '2026-10-15' },
          { project: 'Technical Host Support', percent: 35, changed: false, endDateType: 'ongoing' },
        ],
        [`staff_marcus_5_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Live Webinar Streaming Infrastructure', percent: 50, changed: false, endDateType: 'date', endDate: '2026-10-15' },
          { project: 'Technical Host Support', percent: 35, changed: false, endDateType: 'ongoing' },
        ],
        [`staff_marcus_6_${w1.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Cohort Analytics Dashboard', percent: 70, changed: false, endDateType: 'date', endDate: '2026-09-30' },
          { project: 'Weekly Metric Reporting', percent: 15, changed: false, endDateType: 'secondary_tasks' },
        ],
        [`staff_marcus_6_${w2.id}`]: [
          { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
          { project: 'Cohort Analytics Dashboard', percent: 70, changed: false, endDateType: 'date', endDate: '2026-09-30' },
          { project: 'Weekly Metric Reporting', percent: 15, changed: false, endDateType: 'secondary_tasks' },
        ],
      },
    };
  }

  // Default: theglobal5
  return {
    teamTitle: 'TheGlobal5 Capacity Tracker',
    teamLeadId: 'staff_1',
    staff: [
      { id: 'staff_1', name: 'Amy' },
      { id: 'staff_2', name: 'Gai' },
      { id: 'staff_3', name: 'Mazzy' },
      { id: 'staff_4', name: 'Megan' },
      { id: 'staff_5', name: 'Michele' },
      { id: 'staff_6', name: 'Molly' },
    ],
    weeks: initialWeeks,
    allocations: {
      [`staff_1_${w1.id}`]: [
        { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
        { project: 'Triage', percent: 10, changed: false, endDateType: 'ongoing' },
        { project: 'MO-LLM.LOL', percent: 45, changed: false, endDateType: 'date', endDate: '2026-09-18' },
        { project: 'MO-AIPB', percent: 20, changed: false, endDateType: 'date', endDate: '2026-09-25' },
        { project: 'AI Initiative - Resource Audit', percent: 5, changed: false, endDateType: 'secondary_tasks' },
        { project: 'AI Tutor Bot Working Group', percent: 10, changed: false, endDateType: 'date', endDate: '2026-10-02' },
      ],
      [`staff_1_${w2.id}`]: [
        { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
        { project: 'Triage', percent: 10, changed: false, endDateType: 'ongoing' },
        { project: 'MO-LLM.LOL', percent: 45, changed: true, endDateType: 'date', endDate: '2026-09-18' },
        { project: 'MO-AIPB', percent: 20, changed: false, endDateType: 'date', endDate: '2026-09-25' },
        { project: 'AI Initiative - Resource Audit', percent: 5, changed: false, endDateType: 'secondary_tasks' },
        { project: 'AI Tutor Bot Working Group', percent: 10, changed: false, endDateType: 'date', endDate: '2026-10-02' },
      ],
      [`staff_2_${w1.id}`]: [
        { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
        { project: 'LMS Migration Architecture', percent: 65, changed: false, endDateType: 'date', endDate: '2026-09-30' },
        { project: 'Sprint Review & QA', percent: 20, changed: false, endDateType: 'ongoing' },
      ],
      [`staff_2_${w2.id}`]: [
        { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
        { project: 'LMS Migration Architecture', percent: 65, changed: false, endDateType: 'date', endDate: '2026-09-30' },
        { project: 'Sprint Review & QA', percent: 20, changed: false, endDateType: 'ongoing' },
      ],
      [`staff_3_${w1.id}`]: [
        { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
        { project: 'API v2 Integrations', percent: 85, changed: false, endDateType: 'date', endDate: '2026-09-15' },
        { project: 'Client SDK Support', percent: 10, changed: false, endDateType: 'secondary_tasks' },
      ],
      [`staff_3_${w2.id}`]: [
        { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
        { project: 'API v2 Integrations', percent: 85, changed: true, endDateType: 'date', endDate: '2026-09-15' },
        { project: 'Client SDK Support', percent: 10, changed: false, endDateType: 'secondary_tasks' },
      ],
      [`staff_4_${w1.id}`]: [
        { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
        { project: 'Security Audit & IAM', percent: 45, changed: false, endDateType: 'date', endDate: '2026-09-11' },
        { project: 'Pen-testing Fixes', percent: 30, changed: false, endDateType: 'secondary_tasks' },
      ],
      [`staff_4_${w2.id}`]: [
        { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
        { project: 'Security Audit & IAM', percent: 45, changed: false, endDateType: 'date', endDate: '2026-09-11' },
        { project: 'Pen-testing Fixes', percent: 30, changed: true, endDateType: 'secondary_tasks' },
      ],
      [`staff_5_${w1.id}`]: [
        { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
        { project: 'Enterprise Client Onboarding', percent: 70, changed: false, endDateType: 'date', endDate: '2026-10-15' },
        { project: 'Training Workshops', percent: 15, changed: false, endDateType: 'ongoing' },
      ],
      [`staff_5_${w2.id}`]: [
        { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
        { project: 'Enterprise Client Onboarding', percent: 70, changed: false, endDateType: 'date', endDate: '2026-10-15' },
        { project: 'Training Workshops', percent: 15, changed: false, endDateType: 'ongoing' },
      ],
      [`staff_6_${w1.id}`]: [
        { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
        { project: 'Cloud Infrastructure & K8s', percent: 80, changed: false, endDateType: 'date', endDate: '2026-09-22' },
      ],
      [`staff_6_${w2.id}`]: [
        { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
        { project: 'Cloud Infrastructure & K8s', percent: 80, changed: false, endDateType: 'date', endDate: '2026-09-22' },
      ],
    },
  };
};
