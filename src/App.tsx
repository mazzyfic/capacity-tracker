import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';
import { 
  Users, 
  CalendarPlus, 
  FileSpreadsheet, 
  Edit2,
  Edit3, 
  Check, 
  X, 
  Plus, 
  Trash2, 
  ArrowDownToLine, 
  ExternalLink, 
  Zap, 
  CheckCircle2, 
  UserCheck, 
  UserPlus, 
  AlertTriangle,
  Cloud,
  CloudCheck,
  CloudOff,
  RefreshCw
} from 'lucide-react';
import { StaffMember, WeekHorizon, AllocationItem, AppData, TeamSummary } from './types';
import { getRolling2Weeks, syncRollingWeeksAndAllocations, filterActiveAllocations } from './utils/dateUtils';
import { DEFAULT_TEAMS_LIST, getDefaultTeamData } from './data/defaultTeams';
import { TeamSwitcher } from './components/TeamSwitcher';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';

Chart.register(...registerables);

const FIRESTORE_COLLECTION = 'capacity_tracker';

export default function App() {
  const [cloudStatus, setCloudStatus] = useState<'syncing' | 'connected' | 'error'>('syncing');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const skipNextCloudSave = useRef(false);

  // Teams List & Active Team ID
  const [teamsList, setTeamsList] = useState<TeamSummary[]>(() => {
    try {
      const stored = localStorage.getItem('g5_teams_list_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Failed to parse cached teams list', e);
    }
    return DEFAULT_TEAMS_LIST;
  });

  const [currentTeamId, setCurrentTeamId] = useState<string>(() => {
    return localStorage.getItem('g5_active_team_id') || 'theglobal5';
  });

  // App Data for the active team
  const [appData, setAppData] = useState<AppData>(() => {
    try {
      const activeId = localStorage.getItem('g5_active_team_id') || 'theglobal5';
      const raw = localStorage.getItem(`g5_team_${activeId}`) || 
                  (activeId === 'theglobal5' ? (localStorage.getItem('g5_workload_tracker_rolling_v1') || localStorage.getItem('g5_workload_tracker_2week_v5')) : null);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.staff) && parsed.staff.length > 0) {
          return syncRollingWeeksAndAllocations(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to parse local storage team data', e);
    }
    const activeId = localStorage.getItem('g5_active_team_id') || 'theglobal5';
    return syncRollingWeeksAndAllocations(getDefaultTeamData(activeId));
  });

  // 1. Sync Teams Registry with Firestore
  useEffect(() => {
    const regRef = doc(db, FIRESTORE_COLLECTION, 'teams_registry');
    const unsubscribe = onSnapshot(
      regRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (Array.isArray(data?.teams) && data.teams.length > 0) {
            setTeamsList(data.teams);
            try {
              localStorage.setItem('g5_teams_list_v1', JSON.stringify(data.teams));
            } catch (e) {}
          }
        } else {
          // Initialize teams registry document
          setDoc(regRef, { teams: DEFAULT_TEAMS_LIST }).catch(err => {
            console.error('Error seeding teams registry:', err);
          });
        }
      },
      (err) => {
        console.error('Teams registry sync error:', err);
      }
    );

    return () => unsubscribe();
  }, []);

  // 2. Real-time Firestore sync listener for active team
  useEffect(() => {
    setIsInitialLoad(true);
    setCloudStatus('syncing');

    // Document ID for active team
    const docId = currentTeamId === 'theglobal5' ? 'theglobal5_state' : `team_${currentTeamId}`;
    const docRef = doc(db, FIRESTORE_COLLECTION, docId);
    
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const remoteData = snapshot.data() as AppData;
          if (remoteData && Array.isArray(remoteData.staff) && remoteData.staff.length > 0) {
            skipNextCloudSave.current = true;
            setAppData(syncRollingWeeksAndAllocations(remoteData));
          }
        } else {
          // Document does not exist yet; seed it with current team default data
          const initialData = syncRollingWeeksAndAllocations(getDefaultTeamData(currentTeamId));
          setDoc(docRef, initialData).catch(err => {
            console.error('Error seeding initial team Firestore doc:', err);
          });
        }
        setCloudStatus('connected');
        setIsInitialLoad(false);
      },
      (error) => {
        console.error('Firestore snapshot listener error for team:', error);
        setCloudStatus('error');
        setIsInitialLoad(false);
      }
    );

    return () => unsubscribe();
  }, [currentTeamId]);

  // 3. Save active team changes to Firestore and localStorage
  useEffect(() => {
    // Sync to team-specific localStorage
    try {
      localStorage.setItem(`g5_team_${currentTeamId}`, JSON.stringify(appData));
      localStorage.setItem('g5_active_team_id', currentTeamId);
    } catch (e) {
      console.error('Failed to persist team to localStorage', e);
    }

    // Skip saving to cloud if this update came from the remote snapshot
    if (skipNextCloudSave.current) {
      skipNextCloudSave.current = false;
      return;
    }

    if (!isInitialLoad) {
      setCloudStatus('syncing');
      const docId = currentTeamId === 'theglobal5' ? 'theglobal5_state' : `team_${currentTeamId}`;
      const docRef = doc(db, FIRESTORE_COLLECTION, docId);
      const timer = setTimeout(() => {
        setDoc(docRef, appData, { merge: true })
          .then(() => {
            setCloudStatus('connected');
          })
          .catch((err) => {
            console.error('Failed to update Firestore team document:', err);
            setCloudStatus('error');
          });
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [appData, currentTeamId, isInitialLoad]);

  // Automatically roll forward when a new week arrives or tab is focused
  useEffect(() => {
    const handleCheckWeek = () => {
      setAppData(prev => syncRollingWeeksAndAllocations(prev));
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleCheckWeek();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    const interval = setInterval(handleCheckWeek, 60000 * 15); // check every 15 mins

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, []);

  // Filters & Side panel view mode
  const [capacityFilter, setCapacityFilter] = useState<'all' | 'overload' | 'target'>('all');
  const [rightPanelTab, setRightPanelTab] = useState<'heatmap' | 'chart'>('heatmap');
  
  // Workload Allocation Modal State
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [modalStaffId, setModalStaffId] = useState<string | null>(null);
  const [modalWeekId, setModalWeekId] = useState<string | null>(null);
  const [modalRows, setModalRows] = useState<AllocationItem[]>([]);

  // Title Edit State
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(appData.teamTitle);

  // Manage Team Modal State
  const [manageTeamModalOpen, setManageTeamModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editingStaffName, setEditingStaffName] = useState('');

  // Add Week Modal State
  const [addWeekModalOpen, setAddWeekModalOpen] = useState(false);
  const [newWeekLabel, setNewWeekLabel] = useState('');
  const [newWeekStart, setNewWeekStart] = useState('');
  const [newWeekEnd, setNewWeekEnd] = useState('');

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Active 2 weeks horizon
  const active2Weeks = useMemo(() => {
    const list = appData.weeks.filter(w => !w.archived);
    return list.length > 0 ? list.slice(0, 2) : appData.weeks.slice(0, 2);
  }, [appData.weeks]);

  // Lead member
  const leadMember = useMemo(() => {
    return appData.staff.find(s => s.id === appData.teamLeadId) || appData.staff[0];
  }, [appData.staff, appData.teamLeadId]);

  // Staff calculations
  const staffLoadStats = useMemo(() => {
    return appData.staff.map(staff => {
      let sumTotal = 0;
      const weekLoads: Record<string, { total: number; hasChanged: boolean; items: AllocationItem[] }> = {};

      active2Weeks.forEach(w => {
        const key = `${staff.id}_${w.id}`;
        const list = appData.allocations[key] || [];
        const sum = list.reduce((acc, p) => acc + (Number(p.percent) || 0), 0);
        const hasChanged = list.some(p => p.changed);
        sumTotal += sum;
        weekLoads[w.id] = { total: sum, hasChanged, items: list };
      });

      const avg = active2Weeks.length > 0 ? Math.round(sumTotal / active2Weeks.length) : 0;
      return {
        staff,
        weekLoads,
        avg,
      };
    });
  }, [appData.staff, appData.allocations, active2Weeks]);

  // Overall KPIs
  const kpis = useMemo(() => {
    const totalStaff = appData.staff.length;
    let totalAvgSum = 0;
    let overCapacitySlots = 0;

    staffLoadStats.forEach(stat => {
      totalAvgSum += stat.avg;
      active2Weeks.forEach(w => {
        if ((stat.weekLoads[w.id]?.total || 0) > 100) {
          overCapacitySlots++;
        }
      });
    });

    const avgLoad = totalStaff > 0 ? Math.round(totalAvgSum / totalStaff) : 0;

    return {
      totalStaff,
      avgLoad,
      overCapacitySlots,
    };
  }, [staffLoadStats, appData.staff.length, active2Weeks]);

  // Filtered rows for the matrix
  const filteredStaffStats = useMemo(() => {
    if (capacityFilter === 'all') return staffLoadStats;
    if (capacityFilter === 'overload') {
      return staffLoadStats.filter(s =>
        active2Weeks.some(w => (s.weekLoads[w.id]?.total || 0) > 100)
      );
    }
    if (capacityFilter === 'target') {
      return staffLoadStats.filter(s =>
        active2Weeks.some(w => {
          const load = s.weekLoads[w.id]?.total || 0;
          return load >= 80 && load <= 100;
        })
      );
    }
    return staffLoadStats;
  }, [staffLoadStats, capacityFilter, active2Weeks]);

  // Chart ref
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (rightPanelTab !== 'chart') return;
    if (!chartCanvasRef.current) return;
    const ctx = chartCanvasRef.current.getContext('2d');
    if (!ctx) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    const labels = active2Weeks.map(w => w.label);
    const palette = ['#2563eb', '#10b981', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

    const datasets = appData.staff.map((s, idx) => {
      const color = palette[idx % palette.length];
      return {
        label: s.name,
        data: active2Weeks.map(w => {
          const list = appData.allocations[`${s.id}_${w.id}`] || [];
          return list.reduce((acc, p) => acc + (Number(p.percent) || 0), 0);
        }),
        backgroundColor: color,
        borderColor: color,
        borderWidth: 1,
        borderRadius: 4,
      };
    });

    chartInstanceRef.current = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 10,
              usePointStyle: true,
              font: { family: 'Inter', weight: 600, size: 11 },
              color: '#64748b',
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label}: ${context.parsed.y}% allocation`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: Math.max(120, ...datasets.flatMap(d => d.data).map(v => Math.ceil(v / 20) * 20)),
            ticks: {
              callback: (value) => `${value}%`,
              font: { family: 'Inter', weight: 500, size: 10 },
              color: '#94a3b8',
            },
            grid: {
              color: '#f1f5f9',
            },
          },
          x: {
            ticks: {
              font: { family: 'Inter', weight: 600, size: 11 },
              color: '#475569',
            },
            grid: {
              display: false,
            },
          },
        },
      },
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [appData.staff, appData.allocations, active2Weeks, rightPanelTab]);

  // Open Allocation Modal for a specific member and week
  const handleOpenAllocationModal = (staffId: string, weekId: string) => {
    setModalStaffId(staffId);
    setModalWeekId(weekId);
    const key = `${staffId}_${weekId}`;
    const list = appData.allocations[key] || [
      { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
    ];
    setModalRows(list.map(item => ({ 
      ...item, 
      endDateType: item.endDateType || 'date',
      endDate: item.endDate || ''
    })));
    setAllocationModalOpen(true);
  };

  const handleCloseAllocationModal = () => {
    setAllocationModalOpen(false);
    setModalStaffId(null);
    setModalWeekId(null);
    setModalRows([]);
  };

  const handleAddProjectRow = () => {
    setModalRows(prev => [
      ...prev, 
      { project: '', percent: 0, changed: false, endDateType: 'date', endDate: '' }
    ]);
  };

  const handleRemoveProjectRow = (index: number) => {
    setModalRows(prev => prev.filter((_, i) => i !== index));
  };

  const handleRowChange = (
    index: number, 
    field: 'project' | 'percent' | 'endDateType' | 'endDate', 
    value: string | number
  ) => {
    setModalRows(prev => {
      const next = [...prev];
      if (field === 'project') {
        next[index] = { ...next[index], project: String(value) };
      } else if (field === 'endDateType') {
        const newType = value as 'date' | 'ongoing' | 'secondary_tasks';
        next[index] = { ...next[index], endDateType: newType };
      } else if (field === 'endDate') {
        next[index] = { ...next[index], endDate: String(value) };
      } else {
        const newPct = Math.max(0, Number(value) || 0);
        const hasPctChanged = next[index].percent !== newPct;
        next[index] = { 
          ...next[index], 
          percent: newPct,
          changed: hasPctChanged ? true : next[index].changed 
        };
      }
      return next;
    });
  };

  const handleToggleRowChanged = (index: number) => {
    setModalRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], changed: !next[index].changed };
      return next;
    });
  };

  // Copy helper 1: Copy From Prev Week
  const handleCopyFromPrevWeek = () => {
    if (!modalStaffId || !modalWeekId) return;
    const currentWeekIndex = appData.weeks.findIndex(w => w.id === modalWeekId);
    if (currentWeekIndex <= 0) {
      showToast('No previous week found in schedule to copy from');
      return;
    }
    const prevWeek = appData.weeks[currentWeekIndex - 1];
    const prevKey = `${modalStaffId}_${prevWeek.id}`;
    const prevAllocations = appData.allocations[prevKey];

    if (!prevAllocations || prevAllocations.length === 0) {
      showToast(`No allocations recorded in previous week (${prevWeek.label})`);
      return;
    }

    setModalRows(prevAllocations.map(item => ({ 
      ...item, 
      changed: false,
      endDateType: item.endDateType || 'date',
      endDate: item.endDate || ''
    })));
    showToast(`Copied allocations from ${prevWeek.label}`);
  };

  // Copy helper 2: Duplicate To Next Week
  const handleDuplicateToNextWeek = () => {
    if (!modalStaffId || !modalWeekId) return;
    const currentWeekIndex = appData.weeks.findIndex(w => w.id === modalWeekId);
    
    let targetWeek: WeekHorizon;
    let nextWeeks = [...appData.weeks];

    if (currentWeekIndex === appData.weeks.length - 1) {
      const lastWeek = appData.weeks[currentWeekIndex];
      const nextStart = new Date(lastWeek.startDate);
      nextStart.setDate(nextStart.getDate() + 7);
      const nextEnd = new Date(lastWeek.endDate);
      nextEnd.setDate(nextEnd.getDate() + 7);

      const formatLabel = (d1: Date, d2: Date) => {
        const m1 = d1.toLocaleString('default', { month: 'long' });
        const m2 = d2.toLocaleString('default', { month: 'long' });
        return `${m1} ${d1.getDate()} - ${m2} ${d2.getDate()}`;
      };

      const newWeekId = `w_${Date.now()}`;
      targetWeek = {
        id: newWeekId,
        label: formatLabel(nextStart, nextEnd),
        startDate: nextStart.toISOString().split('T')[0],
        endDate: nextEnd.toISOString().split('T')[0],
        archived: false,
      };
      nextWeeks.push(targetWeek);
    } else {
      targetWeek = appData.weeks[currentWeekIndex + 1];
    }

    const nextKey = `${modalStaffId}_${targetWeek.id}`;
    const currentValidRows = modalRows.filter(r => r.project.trim() !== '');

    setAppData(prev => ({
      ...prev,
      weeks: nextWeeks,
      allocations: {
        ...prev.allocations,
        [nextKey]: currentValidRows.map(r => ({ 
          project: r.project.trim(), 
          percent: Number(r.percent) || 0, 
          changed: true,
          endDateType: r.endDateType || 'date',
          endDate: r.endDate || ''
        })),
      },
    }));

    showToast(`Duplicated allocations to next week (${targetWeek.label})`);
  };

  // Copy all current week allocations to next week for all staff members
  const handleCopyAllToNextWeek = () => {
    if (active2Weeks.length < 2) return;
    const [currentW, nextW] = active2Weeks;
    if (!window.confirm(`Copy all current week (${currentW.label}) allocations to next week (${nextW.label}) for the entire team?`)) {
      return;
    }

    setAppData(prev => {
      const updatedAllocations: Record<string, AllocationItem[]> = { ...prev.allocations };
      prev.staff.forEach(staff => {
        const currentKey = `${staff.id}_${currentW.id}`;
        const nextKey = `${staff.id}_${nextW.id}`;
        const currentList = prev.allocations[currentKey] || [];
        const activeItems = filterActiveAllocations(currentList, nextW.startDate);
        updatedAllocations[nextKey] = activeItems.map(item => ({
          ...item,
          changed: false,
        }));
      });

      return {
        ...prev,
        allocations: updatedAllocations,
      };
    });

    showToast(`Copied all team allocations from Current Week to Next Week (${nextW.label})`);
  };

  const modalCalculatedTotal = useMemo(() => {
    return modalRows.reduce((acc, row) => acc + (Number(row.percent) || 0), 0);
  }, [modalRows]);

  const handleSaveAllocations = () => {
    if (!modalStaffId || !modalWeekId) return;
    const key = `${modalStaffId}_${modalWeekId}`;
    const oldList = appData.allocations[key] || [];

    const updatedList = modalRows
      .filter(r => r.project.trim() !== '')
      .map(r => {
        const projName = r.project.trim();
        const newPct = Number(r.percent) || 0;
        const existing = oldList.find(p => p.project.toLowerCase() === projName.toLowerCase());
        const isChanged = r.changed || (existing ? existing.percent !== newPct : true);
        return { 
          project: projName, 
          percent: newPct, 
          changed: isChanged,
          endDateType: r.endDateType || 'date',
          endDate: r.endDate || ''
        };
      });

    setAppData(prev => ({
      ...prev,
      allocations: {
        ...prev.allocations,
        [key]: updatedList,
      },
    }));

    showToast('Allocations saved successfully');
    handleCloseAllocationModal();
  };

  // CSV Export
  const exportToCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    
    // Header
    const weekHeaders = active2Weeks.map(w => `"${w.label} Total %"`).join(',');
    csvContent += `"Team Member","Role",${weekHeaders},"2-Week Avg %","Detailed Allocations"\n`;

    // Rows
    staffLoadStats.forEach(stat => {
      const weekTotals = active2Weeks.map(w => stat.weekLoads[w.id]?.total || 0).join(',');
      const breakdown = active2Weeks.map(w => {
        const items = stat.weekLoads[w.id]?.items || [];
        const details = items.map(i => {
          let endInfo = '';
          if (i.endDateType === 'ongoing') endInfo = ' (End: Ongoing)';
          else if (i.endDateType === 'secondary_tasks') endInfo = ' (End: Secondary Tasks)';
          else if (i.endDate) endInfo = ` (End: ${i.endDate})`;
          return `${i.project}: ${i.percent}%${endInfo}`;
        }).join('; ');
        return `[${w.label}: ${details || 'None'}]`;
      }).join(' | ');

      csvContent += `"${stat.staff.name}","${stat.staff.id === appData.teamLeadId ? '(TL)' : 'Member'}",${weekTotals},"${stat.avg}%","${breakdown.replace(/"/g, '""')}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `capacity_tracker_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV report exported successfully');
  };

  // Add Week
  const handleAddWeek = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWeekLabel.trim()) return;

    const newId = `w_${Date.now()}`;
    const newWeek: WeekHorizon = {
      id: newId,
      label: newWeekLabel.trim(),
      startDate: newWeekStart || new Date().toISOString().split('T')[0],
      endDate: newWeekEnd || new Date().toISOString().split('T')[0],
      archived: false,
    };

    setAppData(prev => ({
      ...prev,
      weeks: [...prev.weeks, newWeek],
    }));

    setNewWeekLabel('');
    setNewWeekStart('');
    setNewWeekEnd('');
    setAddWeekModalOpen(false);
    showToast(`Week "${newWeek.label}" added`);
  };

  // Add Staff Member
  const handleAddStaffMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;

    const newId = `staff_${Date.now()}`;
    const newStaff: StaffMember = {
      id: newId,
      name: newMemberName.trim(),
    };

    // Pre-populate baseline maintenance
    const initialAllocations: Record<string, AllocationItem[]> = {};
    appData.weeks.forEach(w => {
      initialAllocations[`${newId}_${w.id}`] = [{ project: 'Course Maintenance', percent: 15, changed: false }];
    });

    setAppData(prev => ({
      ...prev,
      staff: [...prev.staff, newStaff],
      allocations: {
        ...prev.allocations,
        ...initialAllocations,
      },
    }));

    setNewMemberName('');
    showToast(`Added ${newStaff.name} to team`);
  };

  const handleUpdateStaffMember = (id: string, updatedName: string) => {
    if (!updatedName.trim()) return;
    const trimmedName = updatedName.trim();
    
    setAppData(prev => {
      const updatedStaff = prev.staff.map(s => s.id === id ? { ...s, name: trimmedName } : s);
      
      // If this member is the team lead, also update the teams_registry leadName
      if (prev.teamLeadId === id) {
        const updatedTeams = teamsList.map(t => 
          t.id === currentTeamId ? { ...t, leadName: trimmedName } : t
        );
        setTeamsList(updatedTeams);
        const regRef = doc(db, FIRESTORE_COLLECTION, 'teams_registry');
        setDoc(regRef, { teams: updatedTeams }, { merge: true }).catch(console.error);
      }

      return {
        ...prev,
        staff: updatedStaff,
      };
    });

    setEditingStaffId(null);
    setEditingStaffName('');
    showToast(`Updated name to "${trimmedName}"`);
  };

  const handleRemoveStaffMember = (id: string, name: string) => {
    if (appData.staff.length <= 1) {
      alert('You must have at least one team member.');
      return;
    }
    setAppData(prev => {
      const nextStaff = prev.staff.filter(s => s.id !== id);
      const nextLead = prev.teamLeadId === id ? (nextStaff[0]?.id || '') : prev.teamLeadId;
      const nextLeadMember = nextStaff.find(s => s.id === nextLead);
      if (nextLeadMember) {
        const updatedTeams = teamsList.map(t => 
          t.id === currentTeamId ? { ...t, leadName: nextLeadMember.name } : t
        );
        setTeamsList(updatedTeams);
        const regRef = doc(db, FIRESTORE_COLLECTION, 'teams_registry');
        setDoc(regRef, { teams: updatedTeams }, { merge: true }).catch(console.error);
      }
      return {
        ...prev,
        teamLeadId: nextLead,
        staff: nextStaff,
      };
    });
    showToast(`Removed ${name} from team`);
  };

  const handleSetTeamLead = (id: string) => {
    setAppData(prev => {
      const nextLeadMember = prev.staff.find(s => s.id === id);
      if (nextLeadMember) {
        const updatedTeams = teamsList.map(t => 
          t.id === currentTeamId ? { ...t, leadName: nextLeadMember.name } : t
        );
        setTeamsList(updatedTeams);
        const regRef = doc(db, FIRESTORE_COLLECTION, 'teams_registry');
        setDoc(regRef, { teams: updatedTeams }, { merge: true }).catch(console.error);
      }
      return { ...prev, teamLeadId: id };
    });
    showToast('(TL) updated');
  };

  // Team Switcher Actions
  const handleSelectTeam = (teamId: string) => {
    if (teamId === currentTeamId) return;
    setCurrentTeamId(teamId);
    try {
      localStorage.setItem('g5_active_team_id', teamId);
      const cached = localStorage.getItem(`g5_team_${teamId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.staff) && parsed.staff.length > 0) {
          setAppData(syncRollingWeeksAndAllocations(parsed));
        }
      } else {
        setAppData(syncRollingWeeksAndAllocations(getDefaultTeamData(teamId)));
      }
    } catch (e) {}
    const target = teamsList.find(t => t.id === teamId);
    showToast(`Switched to ${target?.name || 'Team'}`);
  };

  const handleCreateTeam = (name: string, leadName: string) => {
    const newTeamId = `team_${Date.now()}`;
    const newSummary: TeamSummary = {
      id: newTeamId,
      name: name,
      leadName: leadName,
    };
    const updatedTeams = [...teamsList, newSummary];
    setTeamsList(updatedTeams);

    // Initial team appData
    const initialWeeks = getRolling2Weeks();
    const [w1, w2] = initialWeeks;
    const leadId = 'staff_1';
    const newTeamData: AppData = {
      teamTitle: name.toLowerCase().includes('tracker') ? name : `${name} Capacity Tracker`,
      teamLeadId: leadId,
      staff: [
        { id: leadId, name: leadName },
      ],
      weeks: initialWeeks,
      allocations: {
        [`${leadId}_${w1.id}`]: [
          { project: 'Team Lead & Management Sync', percent: 35, changed: false, endDateType: 'ongoing' },
          { project: 'Key Project Deliverables', percent: 65, changed: false, endDateType: 'ongoing' },
        ],
        [`${leadId}_${w2.id}`]: [
          { project: 'Team Lead & Management Sync', percent: 35, changed: false, endDateType: 'ongoing' },
          { project: 'Key Project Deliverables', percent: 65, changed: false, endDateType: 'ongoing' },
        ],
      },
    };

    // Save to Firestore registry and new team doc
    const regRef = doc(db, FIRESTORE_COLLECTION, 'teams_registry');
    setDoc(regRef, { teams: updatedTeams }).catch(console.error);

    const teamDocRef = doc(db, FIRESTORE_COLLECTION, `team_${newTeamId}`);
    setDoc(teamDocRef, newTeamData).catch(console.error);

    setCurrentTeamId(newTeamId);
    setAppData(newTeamData);
    try {
      localStorage.setItem('g5_teams_list_v1', JSON.stringify(updatedTeams));
      localStorage.setItem('g5_active_team_id', newTeamId);
      localStorage.setItem(`g5_team_${newTeamId}`, JSON.stringify(newTeamData));
    } catch (e) {}

    showToast(`Created ${name}`);
  };

  const handleUpdateTeam = (teamId: string, updatedName: string, updatedLead: string) => {
    const cleanName = updatedName.replace(/\s+capacity\s+tracker$/i, '').trim() || updatedName;
    const updatedTeams = teamsList.map(t => 
      t.id === teamId ? { ...t, name: cleanName, leadName: updatedLead } : t
    );
    setTeamsList(updatedTeams);

    // Save updated registry
    const regRef = doc(db, FIRESTORE_COLLECTION, 'teams_registry');
    setDoc(regRef, { teams: updatedTeams }, { merge: true }).catch(console.error);

    // If active team was updated, update its local appData and firestore doc as well
    if (teamId === currentTeamId) {
      setAppData(prev => {
        const updatedTitle = updatedName.toLowerCase().includes('tracker') ? updatedName : `${updatedName} Capacity Tracker`;
        // Update the staff lead name if lead exists in staff
        const updatedStaff = prev.staff.map(s => s.id === prev.teamLeadId ? { ...s, name: updatedLead } : s);
        return {
          ...prev,
          teamTitle: updatedTitle,
          staff: updatedStaff,
        };
      });
    }

    try {
      localStorage.setItem('g5_teams_list_v1', JSON.stringify(updatedTeams));
    } catch (e) {}

    showToast(`Updated ${cleanName}`);
  };

  const handleDeleteTeam = (teamId: string) => {
    if (teamsList.length <= 1) {
      showToast('Cannot delete the only remaining team');
      return;
    }
    const updatedTeams = teamsList.filter(t => t.id !== teamId);
    setTeamsList(updatedTeams);

    const regRef = doc(db, FIRESTORE_COLLECTION, 'teams_registry');
    setDoc(regRef, { teams: updatedTeams }).catch(console.error);

    try {
      localStorage.setItem('g5_teams_list_v1', JSON.stringify(updatedTeams));
    } catch (e) {}

    if (teamId === currentTeamId) {
      const nextTeam = updatedTeams[0];
      handleSelectTeam(nextTeam.id);
    }
    showToast('Team removed');
  };

  const currentModalStaff = appData.staff.find(s => s.id === modalStaffId);
  const currentModalWeek = appData.weeks.find(w => w.id === modalWeekId);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 border border-slate-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header - Multi-Team Architecture & Switcher */}
      <header className="h-16 min-h-[64px] bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between shadow-xs sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <TeamSwitcher
                teams={teamsList}
                currentTeamId={currentTeamId}
                onSelectTeam={handleSelectTeam}
                onCreateTeam={handleCreateTeam}
                onUpdateTeam={handleUpdateTeam}
                onDeleteTeam={handleDeleteTeam}
                activeTeamTitle={appData.teamTitle}
                activeLeadName={leadMember?.name || 'Amy'}
              />
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-medium">
              <span>(TL): <span id="leadNameDisplay" className="text-blue-600 font-semibold">{leadMember?.name || 'Amy'}</span></span>
              <span>•</span>
              <span className="text-slate-400">{appData.staff.length} Members</span>
              <span>•</span>
              {cloudStatus === 'connected' && (
                <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md text-[11px] font-semibold">
                  <CloudCheck className="w-3 h-3 text-emerald-600" />
                  <span>Cloud Live (Firestore)</span>
                </span>
              )}
              {cloudStatus === 'syncing' && (
                <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-md text-[11px] font-semibold">
                  <RefreshCw className="w-3 h-3 text-blue-600 animate-spin" />
                  <span>Syncing...</span>
                </span>
              )}
              {cloudStatus === 'error' && (
                <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md text-[11px] font-semibold" title="Using local storage cache. Changes will sync once reconnected.">
                  <CloudOff className="w-3 h-3 text-amber-600" />
                  <span>Local Cache</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            id="addWeekBtn"
            type="button"
            onClick={() => {
              const now = new Date();
              const nextMonday = new Date();
              nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7));
              const nextFriday = new Date(nextMonday);
              nextFriday.setDate(nextMonday.getDate() + 4);
              
              const formatLabel = (d1: Date, d2: Date) => {
                const m1 = d1.toLocaleString('default', { month: 'long' });
                const m2 = d2.toLocaleString('default', { month: 'long' });
                return `${m1} ${d1.getDate()} - ${m2} ${d2.getDate()}`;
              };

              setNewWeekLabel(formatLabel(nextMonday, nextFriday));
              setNewWeekStart(nextMonday.toISOString().split('T')[0]);
              setNewWeekEnd(nextFriday.toISOString().split('T')[0]);
              setAddWeekModalOpen(true);
            }}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <CalendarPlus className="w-3.5 h-3.5 text-slate-600" />
            <span>+ Add Week</span>
          </button>

          <button
            id="manageTeamBtn"
            type="button"
            onClick={() => setManageTeamModalOpen(true)}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Manage Team</span>
          </button>

          <button
            id="exportCsvBtn"
            type="button"
            onClick={exportToCSV}
            className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
            title="Export CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="max-w-7xl mx-auto p-6 flex-1 w-full space-y-6">
        {/* Top 4 KPI Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Active Team */}
          <div id="cardActiveTeam" className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between shadow-xs hover:shadow-sm transition-shadow">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Active Team</p>
              <p id="kpiTeamCount" className="text-3xl font-bold text-slate-900">{kpis.totalStaff} Members</p>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-4">
              <div className="h-full w-full bg-blue-600 rounded-full"></div>
            </div>
          </div>

          {/* Card 2: 2-Week Avg Load */}
          <div id="cardAvgLoad" className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between shadow-xs hover:shadow-sm transition-shadow">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">2-Week Avg Load</p>
              <p id="kpiAvgLoad" className="text-3xl font-bold text-slate-900">{kpis.avgLoad}%</p>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-4">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(Math.max(kpis.avgLoad, 5), 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Card 3: Core Allocation */}
          <div id="cardBaseline" className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between shadow-xs hover:shadow-sm transition-shadow">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Core Allocation</p>
              <p className="text-3xl font-bold text-slate-900">15%</p>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 font-medium italic">Mandatory course maintenance baseline</p>
          </div>

          {/* Card 4: Overload Alerts */}
          <div id="cardOverCapacity" className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between shadow-xs hover:shadow-sm transition-shadow">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Overload Alerts</p>
              <p id="kpiFourthValue" className={`text-3xl font-bold ${kpis.overCapacitySlots > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                {kpis.overCapacitySlots} Slots
              </p>
            </div>
            {kpis.overCapacitySlots === 0 ? (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-bold mt-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                <span>All Capacity Optimal</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] text-rose-600 font-bold mt-2">
                <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>
                <span>Requires Workload Rebalancing</span>
              </div>
            )}
          </div>
        </div>

        {/* Main 12-Column Layout */}
        <div className="grid grid-cols-12 gap-6">
          {/* Left Column (Col 8): Workload Breakdown Grid */}
          <section id="workloadMatrixSection" className="col-span-12 lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-xs">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-blue-600 rounded-full"></span>
                <span>Workload Breakdown Grid</span>
              </h2>
              <div className="flex items-center flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyAllToNextWeek}
                  className="text-[11px] bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 px-2.5 py-1 rounded-md text-slate-700 font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                  title="Copy all current week active allocations to next week for the whole team"
                >
                  <ExternalLink className="w-3 h-3 text-blue-600" />
                  <span>Copy All to Next Week</span>
                </button>
                <span className="text-[10px] bg-amber-50 border border-amber-200 px-2 py-1 rounded-md text-amber-700 font-bold flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-500 fill-amber-500" /> Changed
                </span>
                <select
                  id="gridCapacityFilter"
                  value={capacityFilter}
                  onChange={e => setCapacityFilter(e.target.value as any)}
                  className="px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-blue-500 cursor-pointer"
                >
                  <option value="all">All Levels</option>
                  <option value="overload">Over-Capacity (&gt;100%)</option>
                  <option value="target">Target (80%-100%)</option>
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm border-collapse min-w-[580px]">
                <thead className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-6 text-left border-b border-slate-200">Team Member</th>
                    {active2Weeks.map((w, idx) => (
                      <th key={w.id} className="py-3 px-6 text-left border-b border-slate-200">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{w.label}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-normal ${idx === 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-700'}`}>
                            {idx === 0 ? 'Current Week' : 'Next Week'}
                          </span>
                        </div>
                      </th>
                    ))}
                    <th className="py-3 px-6 text-left border-b border-slate-200 bg-slate-100/50">2-Wk Avg</th>
                  </tr>
                </thead>
                <tbody id="gridTbody" className="divide-y divide-slate-100">
                  {filteredStaffStats.length === 0 ? (
                    <tr>
                      <td colSpan={2 + active2Weeks.length} className="py-8 text-center text-slate-400 font-medium text-xs">
                        No team members match this capacity filter.
                      </td>
                    </tr>
                  ) : (
                    filteredStaffStats.map(({ staff, weekLoads, avg }) => (
                      <tr key={staff.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-4 px-6 font-semibold text-slate-700">
                          <div className="flex items-center gap-2">
                            <span 
                              onClick={() => {
                                if (active2Weeks[0]) {
                                  handleOpenAllocationModal(staff.id, active2Weeks[0].id);
                                }
                              }}
                              className="cursor-pointer hover:text-blue-600 transition-colors font-bold text-slate-800"
                              title="Click to view/edit workload"
                            >
                              {staff.name}
                            </span>
                            {staff.id === appData.teamLeadId && (
                              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-bold">
                                (TL)
                              </span>
                            )}
                          </div>
                        </td>

                        {active2Weeks.map(w => {
                          const weekData = weekLoads[w.id] || { total: 0, hasChanged: false, items: [] };
                          const sum = weekData.total;
                          const isOver = sum > 100;
                          const isTarget = sum >= 80 && sum <= 100;
                          const changedItems = (weekData.items || []).filter(p => p.changed);
                          const changedTooltip = changedItems.length > 0
                            ? `Changed projects:\n${changedItems.map(p => `• ${p.project}: ${p.percent}%`).join('\n')}`
                            : 'Recently changed';

                          let pillStyle = 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300';
                          if (isOver) {
                            pillStyle = 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 hover:border-rose-300';
                          } else if (isTarget) {
                            pillStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300';
                          }

                          return (
                            <td
                              key={w.id}
                              className="py-4 px-6 text-left"
                            >
                              <div className="flex items-center justify-start gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenAllocationModal(staff.id, w.id);
                                  }}
                                  className={`px-3 py-1 border rounded-full font-bold text-xs transition-all transform hover:scale-105 cursor-pointer shadow-2xs ${pillStyle}`}
                                  title={`Click to edit workload for ${staff.name} (${w.label})`}
                                >
                                  {sum}%
                                </button>
                                {weekData.hasChanged && (
                                  <div className="relative group/zap inline-flex items-center">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenAllocationModal(staff.id, w.id);
                                      }}
                                      className="p-1 rounded-md hover:bg-amber-100/80 transition-colors cursor-pointer"
                                      title={changedTooltip}
                                    >
                                      <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                    </button>
                                    {/* Rich Tooltip Popover */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/zap:flex flex-col z-50 bg-slate-900 text-white text-[11px] py-2 px-3 rounded-xl shadow-xl pointer-events-none border border-slate-700 min-w-[190px] text-left">
                                      <div className="flex items-center gap-1.5 text-amber-400 font-bold border-b border-slate-700 pb-1 mb-1">
                                        <Zap className="w-3 h-3 fill-amber-400 shrink-0" />
                                        <span>Changed Projects</span>
                                      </div>
                                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                        {changedItems.map((cp, idx) => {
                                          let endBadge = '';
                                          if (cp.endDateType === 'ongoing') endBadge = 'Ongoing';
                                          else if (cp.endDateType === 'secondary_tasks') endBadge = 'Secondary Tasks';
                                          else if (cp.endDate) endBadge = cp.endDate;

                                          return (
                                            <div key={idx} className="flex items-center justify-between gap-2 text-slate-200">
                                              <div className="flex flex-col truncate max-w-[140px]">
                                                <span className="truncate font-medium">{cp.project}</span>
                                                {endBadge && (
                                                  <span className="text-[9px] text-amber-300/80 font-normal">
                                                    {cp.endDateType === 'date' || !cp.endDateType ? `End: ${endBadge}` : endBadge}
                                                  </span>
                                                )}
                                              </div>
                                              <span className="font-bold text-amber-300 shrink-0">{cp.percent}%</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}

                        <td
                          className="py-4 px-6 text-left font-bold text-slate-900 bg-slate-100/30 cursor-pointer hover:bg-blue-50/40 transition-colors"
                          onClick={() => {
                            if (active2Weeks[0]) {
                              handleOpenAllocationModal(staff.id, active2Weeks[0].id);
                            }
                          }}
                          title="Click to view primary week allocations"
                        >
                          <span className={`${avg > 100 ? 'text-rose-600 font-extrabold' : 'text-slate-800 font-bold'}`}>{avg}%</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Right Column (Col 4): Allocation Heatmap & Comparison */}
          <section className="col-span-12 lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 flex flex-col shadow-xs justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-800">
                  {rightPanelTab === 'heatmap' ? 'Allocation Heatmap' : 'Workload Comparison'}
                </h2>
                <div className="flex bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setRightPanelTab('heatmap')}
                    className={`px-2.5 py-0.5 rounded-md transition-colors cursor-pointer ${
                      rightPanelTab === 'heatmap' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Heatmap
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightPanelTab('chart')}
                    className={`px-2.5 py-0.5 rounded-md transition-colors cursor-pointer ${
                      rightPanelTab === 'chart' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Chart
                  </button>
                </div>
              </div>

              {/* Tab 1: Allocation Heatmap */}
              {rightPanelTab === 'heatmap' ? (
                <div className="space-y-4 pt-2">
                  {staffLoadStats.map(stat => {
                    const avg = stat.avg;
                    const isOver = avg > 100;
                    const isOptimal = avg >= 80 && avg <= 100;
                    const memberChangedItems = active2Weeks.flatMap(w => 
                      (stat.weekLoads[w.id]?.items || [])
                        .filter(p => p.changed)
                        .map(p => `${p.project} (${p.percent}%)`)
                    );
                    const hasChanged = memberChangedItems.length > 0;
                    
                    let barColor = 'bg-blue-600';
                    if (isOver) barColor = 'bg-rose-500';
                    else if (isOptimal) barColor = 'bg-emerald-500';

                    return (
                      <div
                        key={stat.staff.id}
                        onClick={() => {
                          if (active2Weeks[0]) {
                            handleOpenAllocationModal(stat.staff.id, active2Weeks[0].id);
                          }
                        }}
                        className="flex items-center gap-3 cursor-pointer group hover:bg-slate-50 p-1.5 rounded-lg transition-colors"
                        title={hasChanged ? `Changed: ${memberChangedItems.join(', ')}` : "Click to view & edit workload allocations"}
                      >
                        <div className="w-20 text-[11px] font-bold text-slate-600 uppercase truncate group-hover:text-blue-600 transition-colors flex items-center gap-1">
                          <span className="truncate">{stat.staff.name}</span>
                          {hasChanged && (
                            <Zap className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" title={`Changed: ${memberChangedItems.join(', ')}`} />
                          )}
                        </div>
                        <div className="flex-1 h-3 flex rounded-full overflow-hidden bg-slate-100">
                          <div
                            className={`h-full ${barColor} transition-all duration-300 rounded-full`}
                            style={{ width: `${Math.min(avg, 100)}%` }}
                          ></div>
                        </div>
                        <div className={`w-10 text-right text-[11px] font-bold ${isOver ? 'text-rose-600' : 'text-slate-700'}`}>
                          {avg}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Tab 2: Chart.js Bar Comparison */
                <div className="h-56 w-full relative pt-2">
                  <canvas ref={chartCanvasRef} id="capacityChart"></canvas>
                </div>
              )}
            </div>

            {/* Forecast Callout Card */}
            <div className="mt-6 p-4 bg-slate-50 border border-slate-100 rounded-xl">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Forecast</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${kpis.overCapacitySlots === 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'}`}>
                  {kpis.overCapacitySlots === 0 ? 'STABLE' : 'ACTION REQUIRED'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {kpis.overCapacitySlots === 0
                  ? 'Current resource levels are at peak efficiency. No immediate burnout risks detected for the active cycle.'
                  : `Detected ${kpis.overCapacitySlots} over-capacity allocations (>100%). Consider reassigning project milestones.`}
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* Editable Workload Information Modal - Pixel-matched to screenshot */}
      {allocationModalOpen && currentModalStaff && currentModalWeek && (
        <div 
          id="allocationModal" 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseAllocationModal();
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div id="modalStaffBadge" className="w-11 h-11 rounded-xl bg-blue-600 font-bold flex items-center justify-center text-white text-lg shadow-xs">
                  {currentModalStaff.name.substring(0, 1).toUpperCase()}
                </div>
                <div>
                  <h3 id="modalTitle" className="text-base font-bold text-white leading-tight">
                    Workload for {currentModalStaff.name.toUpperCase()}
                  </h3>
                  <p id="modalSubtitle" className="text-xs text-slate-300 font-normal mt-0.5">
                    {currentModalWeek.label}
                  </p>
                </div>
              </div>
              <button
                id="closeAllocationModalBtn"
                type="button"
                onClick={handleCloseAllocationModal}
                className="text-slate-400 hover:text-white cursor-pointer p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Copy Helper Bar */}
            <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold text-slate-500">Copy helper:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="copyPrevWeekBtn"
                  onClick={handleCopyFromPrevWeek}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors shadow-2xs"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5 text-blue-600" />
                  <span>Copy From Prev Week</span>
                </button>
                <button
                  type="button"
                  id="duplicateNextWeekBtn"
                  onClick={handleDuplicateToNextWeek}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors shadow-2xs"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                  <span>Duplicate To Next Week</span>
                </button>
              </div>
            </div>

            {/* Table Column Headers */}
            <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 mx-5 mt-3 mb-1 bg-slate-100 border border-slate-200 rounded-xl text-xs font-black text-slate-800 tracking-wider uppercase items-center shadow-2xs">
              <span className="col-span-4 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                PROJECT / TASK CODE
              </span>
              <span className="col-span-4 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                PROJECT END DATE
              </span>
              <span className="col-span-4 text-right pr-4 flex items-center justify-end gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                ALLOCATION % & STATUS
              </span>
            </div>

            {/* Scrollable Editable Project Rows */}
            <div className="px-5 space-y-3 max-h-[50vh] overflow-y-auto custom-scrollbar pb-2 pt-2 sm:pt-0">
              {modalRows.some(r => r.changed) && (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl font-semibold mb-1">
                  <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-500 shrink-0" />
                  <span>{modalRows.filter(r => r.changed).length} project(s) have modified percentage allocations</span>
                </div>
              )}

              <div id="projectRowsContainer" className="space-y-2.5">
                {modalRows.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">No project allocations configured yet.</p>
                ) : (
                  modalRows.map((row, idx) => (
                    <div 
                      key={idx} 
                      className={`grid grid-cols-12 gap-3 items-center p-2.5 rounded-xl transition-all ${
                        row.changed ? 'bg-amber-50/50 border border-amber-200' : 'bg-slate-50/50 border border-slate-200/70 hover:border-slate-300'
                      }`}
                    >
                      {/* Project / Task Code Input */}
                      <div className="col-span-12 sm:col-span-4 relative flex flex-col justify-center">
                        <span className="sm:hidden text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-1">
                          Project / Task Code
                        </span>
                        <input
                          type="text"
                          value={row.project}
                          onChange={e => handleRowChange(idx, 'project', e.target.value)}
                          placeholder="Project name (e.g. LMS Migration)"
                          className={`w-full px-3 py-2 text-sm font-semibold text-slate-800 bg-white border ${
                            row.changed 
                              ? 'border-amber-300 focus:border-amber-500 focus:ring-amber-100' 
                              : 'border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-blue-100'
                          } rounded-xl outline-none focus:ring-2 transition-all shadow-2xs`}
                        />
                      </div>

                      {/* Project End Date Selector (Option 1: Date Selection, Option 2: Ongoing, Option 3: Secondary Tasks) */}
                      <div className="col-span-12 sm:col-span-4 flex flex-col sm:flex-row items-start sm:items-center gap-1.5 flex-wrap sm:flex-nowrap">
                        <span className="sm:hidden text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-1">
                          Project End Date
                        </span>
                        <div className="flex items-center gap-1.5 w-full min-w-0">
                          <select
                            value={row.endDateType || 'date'}
                            onChange={e => handleRowChange(idx, 'endDateType', e.target.value)}
                            className="px-2.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 shadow-2xs shrink-0 cursor-pointer"
                            title="Project End Date selection"
                          >
                            <option value="date">Select Date</option>
                            <option value="ongoing">Ongoing</option>
                            <option value="secondary_tasks">Secondary Tasks</option>
                          </select>

                          {(!row.endDateType || row.endDateType === 'date') && (
                            <input
                              type="date"
                              value={row.endDate || ''}
                              onChange={e => handleRowChange(idx, 'endDate', e.target.value)}
                              className="w-full min-w-0 px-2 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 shadow-2xs cursor-pointer"
                              title="Pick Project End Date"
                            />
                          )}

                          {row.endDateType === 'ongoing' && (
                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
                              Ongoing
                            </span>
                          )}

                          {row.endDateType === 'secondary_tasks' && (
                            <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
                              Secondary Tasks
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Allocation %, Changed tag & Delete */}
                      <div className="col-span-12 sm:col-span-4 flex items-center justify-between sm:justify-end gap-2 pt-1 sm:pt-0">
                        <span className="sm:hidden text-[10px] font-extrabold text-slate-700 uppercase tracking-wider">
                          Allocation % & Status
                        </span>
                        <div className="flex items-center justify-end gap-2 shrink-0">
                          {/* Changed Icon & Tag */}
                          {row.changed ? (
                            <button
                              type="button"
                              onClick={() => handleToggleRowChanged(idx)}
                              className="px-2 py-1 bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs transition-colors whitespace-nowrap"
                              title="Percentage changed for this project (click to toggle)"
                            >
                              <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500 shrink-0" />
                              <span>Changed</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleRowChanged(idx)}
                              className="px-1.5 py-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 border border-transparent hover:border-amber-200 rounded-lg text-[11px] font-semibold shrink-0 cursor-pointer opacity-70 hover:opacity-100 transition-all flex items-center gap-1"
                              title="Mark project as changed"
                            >
                              <Zap className="w-3.5 h-3.5" />
                              <span className="hidden lg:inline text-[10px] text-slate-500">Mark</span>
                            </button>
                          )}

                          {/* Allocation % Input */}
                          <div className="relative w-20 flex items-center shrink-0">
                            <input
                              type="number"
                              min="0"
                              max="200"
                              value={row.percent === 0 && row.project === '' ? '' : row.percent}
                              onChange={e => handleRowChange(idx, 'percent', e.target.value)}
                              className={`w-full pl-2 pr-6 py-2 text-sm font-bold bg-white border ${
                                row.changed 
                                  ? 'border-amber-300 text-amber-900 focus:border-amber-500 focus:ring-amber-100' 
                                  : 'border-slate-200 text-slate-800 hover:border-slate-300 focus:border-blue-500 focus:ring-blue-100'
                              } rounded-xl outline-none focus:ring-2 text-right transition-all shadow-2xs`}
                            />
                            <span className="absolute right-2 text-xs font-bold text-slate-400 pointer-events-none">%</span>
                          </div>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => handleRemoveProjectRow(idx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors shrink-0"
                            title="Remove task"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add Project Allocation Button */}
              <button
                id="addProjectRowBtn"
                type="button"
                onClick={handleAddProjectRow}
                className="w-full py-3 border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/20 text-slate-600 hover:text-blue-600 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer mt-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Project Allocation</span>
              </button>

              {/* Total Calculated Allocation Box */}
              <div className="p-4 bg-slate-50/90 rounded-xl border border-slate-200/80 flex items-center justify-between mt-3">
                <span className="text-sm font-bold text-slate-700">Total Calculated Allocation:</span>
                <span
                  id="modalTotalLoad"
                  className={`text-base font-extrabold ${
                    modalCalculatedTotal > 100
                      ? 'text-rose-600'
                      : modalCalculatedTotal === 100
                      ? 'text-emerald-600'
                      : 'text-blue-600'
                  }`}
                >
                  {modalCalculatedTotal}%
                </span>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3">
              <button
                id="cancelAllocationModalBtn"
                type="button"
                onClick={handleCloseAllocationModal}
                className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                id="saveAllocationsBtn"
                type="button"
                onClick={handleSaveAllocations}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
              >
                Save Allocations
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Week Modal */}
      {addWeekModalOpen && (
        <div 
          id="addWeekModal" 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAddWeekModalOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <CalendarPlus className="w-4 h-4 text-blue-400" />
                <span>Add Planning Horizon Week</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setAddWeekModalOpen(false)} 
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddWeek} className="p-5 space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Week Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. August 31 - September 04"
                  value={newWeekLabel}
                  onChange={e => setNewWeekLabel(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-blue-500 font-medium shadow-2xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newWeekStart}
                    onChange={e => setNewWeekStart(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">End Date</label>
                  <input
                    type="date"
                    value={newWeekEnd}
                    onChange={e => setNewWeekEnd(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-blue-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 -mx-5 -mb-5 mt-4">
                <button
                  type="button"
                  onClick={() => setAddWeekModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs cursor-pointer"
                >
                  Create Week
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Team Modal */}
      {manageTeamModalOpen && (
        <div 
          id="manageTeamModal" 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setManageTeamModalOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                <span>Manage Team Roster</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setManageTeamModalOpen(false)} 
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto max-h-[65vh]">
              {/* Add New Member Form */}
              <form onSubmit={handleAddStaffMember} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter staff member name..."
                  value={newMemberName}
                  onChange={e => setNewMemberName(e.target.value)}
                  className="flex-1 px-3.5 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-blue-500 font-medium shadow-2xs"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </form>

              {/* Members List */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Current Team Members ({appData.staff.length})
                </h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                  {appData.staff.map(s => {
                    const isLead = s.id === appData.teamLeadId;
                    const isEditingThisMember = editingStaffId === s.id;

                    return (
                      <div key={s.id} className="p-3 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
                          <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 font-bold text-xs flex items-center justify-center border border-blue-200 shrink-0">
                            {s.name.substring(0, 2).toUpperCase()}
                          </span>
                          
                          {isEditingThisMember ? (
                            <form 
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleUpdateStaffMember(s.id, editingStaffName);
                              }}
                              className="flex items-center gap-1.5 flex-1"
                            >
                              <input
                                type="text"
                                value={editingStaffName}
                                onChange={(e) => setEditingStaffName(e.target.value)}
                                className="px-2 py-1 text-xs font-semibold text-slate-900 border border-blue-500 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 bg-white w-full max-w-[170px]"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    setEditingStaffId(null);
                                    setEditingStaffName('');
                                  }
                                }}
                              />
                              <button
                                type="submit"
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingStaffId(null);
                                  setEditingStaffName('');
                                }}
                                className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-semibold rounded-lg cursor-pointer"
                              >
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs font-semibold text-slate-900 truncate">{s.name}</span>
                              {isLead && (
                                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-bold shrink-0">
                                  (TL)
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingStaffId(s.id);
                                  setEditingStaffName(s.name);
                                }}
                                className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
                                title={`Edit ${s.name}'s name`}
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        {!isEditingThisMember && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {!isLead && (
                              <button
                                type="button"
                                onClick={() => handleSetTeamLead(s.id)}
                                className="px-2.5 py-1 text-[10px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer transition-colors"
                              >
                                Make (TL)
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveStaffMember(s.id, s.name)}
                              disabled={appData.staff.length <= 1}
                              className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                              title="Remove Member"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Reset this team and allocations to default template?`)) {
                    setAppData(syncRollingWeeksAndAllocations(getDefaultTeamData(currentTeamId)));
                    showToast('Reset to default team members');
                  }
                }}
                className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
              >
                Reset to Default Team
              </button>
              <button
                type="button"
                onClick={() => setManageTeamModalOpen(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
