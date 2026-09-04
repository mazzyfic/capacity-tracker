export interface StaffMember {
  id: string;
  name: string;
  role?: string;
  notes?: string;
}

export interface WeekHorizon {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  archived: boolean;
}

export type ProjectEndDateType = 'date' | 'ongoing' | 'secondary_tasks';

export interface AllocationItem {
  project: string;
  percent: number;
  changed?: boolean;
  endDateType?: ProjectEndDateType;
  endDate?: string;
}

export interface AppData {
  teamTitle: string;
  teamLeadId: string;
  staff: StaffMember[];
  weeks: WeekHorizon[];
  allocations: Record<string, AllocationItem[]>;
  notes?: Record<string, string>;
}

export interface TeamSummary {
  id: string;
  name: string;
  leadName: string;
}

export interface DataSnapshot {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
  description?: string;
  teamId: string;
  teamTitle: string;
  data: AppData;
}

