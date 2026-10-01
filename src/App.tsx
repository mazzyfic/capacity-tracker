import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import { 
  Users, 
  FileSpreadsheet, 
  Edit2, 
  X, 
  Plus, 
  Trash2, 
  ArrowDownToLine, 
  ExternalLink, 
  Zap, 
  CheckCircle2, 
  UserPlus, 
  CloudCheck, 
  CloudOff, 
  RefreshCw, 
  MessageSquare, 
  GripVertical, 
  RotateCcw, 
  AlertTriangle,
  ArrowLeftRight,
} from 'lucide-react';
import { 
  StaffMember, 
  WeekHorizon, 
  AllocationItem, 
  AppData, 
  TeamSummary, 
  ProjectEndDateType,
  ModalAllocationRow
} from './types';
import { 
  syncRollingWeeksAndAllocations, 
  filterActiveAllocations,
  isAllocationExpired,
  parseDateIso,
  formatDateIso,
  formatWeekLabel,
  getMondayOfWeek
} from './utils/dateUtils';
import { DEFAULT_TEAMS_LIST, getDefaultTeamData } from './data/defaultTeams';
import { TeamSwitcher } from './components/TeamSwitcher';
import { RevertDateModal } from './components/RevertDateModal';
import { checkAndCreateDailyAutoSnapshot, fetchTeamSnapshots } from './utils/snapshotUtils';
import { normalizeTeamData, formatAllocationDetail, isCorruptedFactoryData } from './utils/helpers';
import { doc, onSnapshot, setDoc, getDoc, getDocFromServer } from 'firebase/firestore';
import { db } from './firebase';

Chart.register(...registerables);

const FIRESTORE_COLLECTION = 'capacity_tracker';

/**
 * Optimized memoized component for member notes that prevents re-rendering
 * the main table grid on every keystroke and syncs on blur/Enter.
 */
interface StaffNoteInputProps {
  staffId: string;
  initialNote: string;
  onSaveNote: (staffId: string, note: string) => void;
}

const StaffNoteInput: React.FC<StaffNoteInputProps> = React.memo(({ staffId, initialNote, onSaveNote }) => {
  const [localNote, setLocalNote] = useState(initialNote);

  useEffect(() => {
    setLocalNote(initialNote);
  }, [initialNote]);

  const handleBlur = () => {
    if (localNote !== initialNote) {
      onSaveNote(staffId, localNote);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <div className="relative group/note flex items-center">
      <input
        type="text"
        value={localNote}
        onChange={(e) => setLocalNote(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Add note (e.g. PTO, on-call)..."
        className="w-full text-xs text-slate-800 placeholder-slate-400 bg-slate-50/60 hover:bg-slate-100/80 focus:bg-white border border-slate-200/60 hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg px-3 py-1.5 transition-all outline-none"
        title="Add notes for this team member"
      />
    </div>
  );
});
StaffNoteInput.displayName = 'StaffNoteInput';

export default function App() {
  const [cloudStatus, setCloudStatus] = useState<'syncing' | 'connected' | 'error'>('syncing');
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Teams List & Active Team ID
  const [teamsList, setTeamsList] = useState<TeamSummary[]>(() => {
    try {
      const stored = localStorage.getItem('tracker_teams_list');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Failed to parse cached teams list', e);
    }
    return DEFAULT_TEAMS_LIST;
  });

  const getInitialTeamId = () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const teamParam = urlParams.get('team')?.toLowerCase();
      if (teamParam === 'kimyatta' || teamParam === 'team_kimyatta') return 'team_kimyatta';
      if (teamParam === 'lindsay' || teamParam === 'team_lindsay') return 'team_lindsay';
      if (teamParam === 'mazzy' || teamParam === 'team_mazzy') return 'team_mazzy';
    } catch (e) {}
    const stored = localStorage.getItem('tracker_active_team_id');
    if (stored === 'team_kimyatta' || stored === 'team_lindsay' || stored === 'team_mazzy') {
      return stored;
    }
    return 'team_mazzy';
  };

  const [currentTeamId, setCurrentTeamId] = useState<string>(getInitialTeamId);

  // App Data for the active team
  const [appData, setAppData] = useState<AppData>(() => {
    const activeId = getInitialTeamId();
    try {
      const raw = localStorage.getItem(`tracker_team_${activeId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          Array.isArray(parsed.staff) &&
          parsed.staff.length > 0 &&
          !isCorruptedFactoryData(parsed, activeId)
        ) {
          return syncRollingWeeksAndAllocations(parsed);
        } else if (isCorruptedFactoryData(parsed, activeId)) {
          localStorage.removeItem(`tracker_team_${activeId}`);
        }
      }
    } catch (e) {
      console.error('Failed to parse local storage team data', e);
    }
    return syncRollingWeeksAndAllocations(getDefaultTeamData(activeId));
  });

  const lastSavedJsonRef = useRef<string>('');
  const isRemoteLoadedRef = useRef<boolean>(false);
  const isCustomHorizonRef = useRef<boolean>(false);
  const [isCustomHorizon, setIsCustomHorizon] = useState<boolean>(false);
  const [confirmCopyAll, setConfirmCopyAll] = useState<boolean>(false);

  const getTeamDocId = (teamId: string): string => {
    if (teamId === 'team_kimyatta' || teamId === 'team_lindsay' || teamId === 'team_mazzy') {
      return teamId;
    }
    return 'team_mazzy';
  };

  const persistAppData = useCallback((nextData: AppData) => {
    if (isCorruptedFactoryData(nextData, currentTeamId)) {
      console.warn('Blocked attempt to persist corrupted factory data for', currentTeamId);
      return;
    }

    const jsonStr = JSON.stringify(nextData);
    lastSavedJsonRef.current = jsonStr;
    setAppData(nextData);
    try {
      localStorage.setItem(`tracker_team_${currentTeamId}`, jsonStr);
      localStorage.setItem('tracker_active_team_id', currentTeamId);
    } catch (e) {
      console.error('Failed to persist to localStorage', e);
    }

    const docId = getTeamDocId(currentTeamId);
    const docRef = doc(db, FIRESTORE_COLLECTION, docId);

    // If initial Firestore snapshot hasn't loaded yet, merge carefully on top of remote doc
    if (!isRemoteLoadedRef.current) {
      getDoc(docRef)
        .then(remoteSnap => {
          if (remoteSnap.exists()) {
            const remoteData = remoteSnap.data() as AppData;
            if (!isCorruptedFactoryData(remoteData, currentTeamId)) {
              const safeMerged: AppData = {
                ...remoteData,
                ...nextData,
                allocations: {
                  ...(remoteData.allocations || {}),
                  ...(nextData.allocations || {}),
                },
                notes: {
                  ...(remoteData.notes || {}),
                  ...(nextData.notes || {}),
                },
              };
              isRemoteLoadedRef.current = true;
              return setDoc(docRef, safeMerged, { merge: true });
            }
          }
          return setDoc(docRef, nextData, { merge: true });
        })
        .then(() => setCloudStatus('connected'))
        .catch(err => {
          console.error('Error saving data to Firestore:', err);
          setCloudStatus('error');
        });
      return;
    }

    setDoc(docRef, nextData, { merge: true })
      .then(() => setCloudStatus('connected'))
      .catch(err => {
        console.error('Error saving data to Firestore:', err);
        setCloudStatus('error');
      });
  }, [currentTeamId]);



  const [revertDateModalOpen, setRevertDateModalOpen] = useState(false);

  const handleRevertToDate = async (targetDateIso: string, customData?: AppData) => {
    const docId = getTeamDocId(currentTeamId);
    let targetBaseDate: Date;
    try {
      targetBaseDate = parseDateIso(targetDateIso);
    } catch (e) {
      targetBaseDate = new Date();
    }

    const currentMondayIso = formatDateIso(getMondayOfWeek(new Date()));
    const targetMondayIso = formatDateIso(getMondayOfWeek(targetBaseDate));
    const isCustom = targetMondayIso !== currentMondayIso;
    isCustomHorizonRef.current = isCustom;
    setIsCustomHorizon(isCustom);

    let sourceData = customData;
    if (!sourceData) {
      // Always get the latest data for THIS specific team from Firestore first
      try {
        const teamDocSnap = await getDoc(doc(db, FIRESTORE_COLLECTION, docId));
        if (teamDocSnap.exists()) {
          sourceData = teamDocSnap.data() as AppData;
        }
      } catch (e) {
        console.error('Failed to get team doc from Firestore', e);
      }
      if (!sourceData) {
        sourceData = { ...appData };
      }
    }

    // Clean and normalize team info while restoring exact allocations if snapshot provided
    // and preserving historical week keys from existing appData
    const merged: AppData = {
      ...sourceData,
      allocations: customData
        ? {
            ...(appData.allocations || {}),
            ...(customData.allocations || {}),
          }
        : {
            ...(appData.allocations || {}),
            ...(sourceData.allocations || {}),
          },
    };

    const cleaned = normalizeTeamData(merged, currentTeamId);
    const synchronized = syncRollingWeeksAndAllocations(cleaned, targetBaseDate);
    const jsonStr = JSON.stringify(synchronized);

    // Save the newly reverted horizon to Firestore and local storage
    await setDoc(doc(db, FIRESTORE_COLLECTION, docId), synchronized, { merge: true });
    localStorage.setItem(`tracker_team_${currentTeamId}`, jsonStr);

    lastSavedJsonRef.current = jsonStr;
    setAppData(synchronized);
    setCloudStatus('connected');
  };

  // Keep browser tab title strictly as FFID Capacity Tracker & validate Firestore connection on boot
  useEffect(() => {
    document.title = 'FFID Capacity Tracker';
    getDocFromServer(doc(db, FIRESTORE_COLLECTION, 'teams_registry')).catch((error) => {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error('Please check your Firebase configuration.');
      }
    });
  }, []);

  // 1. Sync Teams Registry with Firestore & auto-repair names
  useEffect(() => {
    const regRef = doc(db, FIRESTORE_COLLECTION, 'teams_registry');
    const unsubscribe = onSnapshot(
      regRef,
      (snapshot) => {
        const isFromCache = snapshot.metadata.fromCache;
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (Array.isArray(data?.teams) && data.teams.length > 0) {
            let hasChanged = false;
            const validIds = new Set(['team_mazzy', 'team_kimyatta', 'team_lindsay']);
            const cleanTeams: TeamSummary[] = DEFAULT_TEAMS_LIST.map(def => {
              const matched = (data.teams as TeamSummary[]).find((t: TeamSummary) => t.id === def.id);
              if (matched) {
                if (!matched.name || !matched.leadName) {
                  hasChanged = true;
                }
                return {
                  id: def.id,
                  name: matched.name || def.name,
                  leadName: matched.leadName || def.leadName,
                };
              }
              hasChanged = true;
              return def;
            });

            if (data.teams.length !== 3 || (data.teams as TeamSummary[]).some((t: TeamSummary) => !validIds.has(t.id))) {
              hasChanged = true;
            }

            setTeamsList(cleanTeams);
            try {
              localStorage.setItem('tracker_teams_list', JSON.stringify(cleanTeams));
            } catch (e) {}

            // Persist repaired registry back to Firestore if legacy existed
            if (hasChanged) {
              setDoc(regRef, { teams: cleanTeams }, { merge: true }).catch(console.error);
            }
          }
        } else if (!isFromCache) {
          // Initialize teams registry document
          setDoc(regRef, { teams: DEFAULT_TEAMS_LIST }, { merge: true }).catch(err => {
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
    let isCancelled = false;
    setIsInitialLoad(true);
    isRemoteLoadedRef.current = false;
    setCloudStatus('syncing');

    const docId = getTeamDocId(currentTeamId);
    const docRef = doc(db, FIRESTORE_COLLECTION, docId);
    
    const unsubscribe = onSnapshot(
      docRef,
      async (snapshot) => {
        if (isCancelled) return;
        const isFromCache = snapshot.metadata.fromCache;
        if (snapshot.metadata.hasPendingWrites && isRemoteLoadedRef.current) {
          // Local pending writes after initial load: state in memory is already up to date
          setCloudStatus('connected');
          setIsInitialLoad(false);
          return;
        }

        if (snapshot.exists()) {
          const remoteData = snapshot.data() as AppData;
          if (remoteData && Array.isArray(remoteData.staff) && remoteData.staff.length > 0) {
            // Self-heal if remote document was ever overwritten by generic factory data
            if (isCorruptedFactoryData(remoteData, currentTeamId)) {
              console.warn('Detected corrupted factory data in Firestore for', currentTeamId, '- recovering from snapshots');
              const snaps = await fetchTeamSnapshots(currentTeamId);
              if (isCancelled) return;
              const validSnap = snaps.find(s => s.data && !isCorruptedFactoryData(s.data, currentTeamId));
              const recoveryBase = validSnap?.data || getDefaultTeamData(currentTeamId);
              const cleanedRecovery = normalizeTeamData(recoveryBase, currentTeamId);
              const syncedRecovery = syncRollingWeeksAndAllocations(cleanedRecovery);
              const recoveryJson = JSON.stringify(syncedRecovery);
              lastSavedJsonRef.current = recoveryJson;
              setAppData(syncedRecovery);
              isRemoteLoadedRef.current = true;
              try {
                localStorage.setItem(`tracker_team_${currentTeamId}`, recoveryJson);
              } catch {}
              await setDoc(docRef, syncedRecovery, { merge: true }).catch(console.error);
              if (isCancelled) return;
              checkAndCreateDailyAutoSnapshot(currentTeamId, syncedRecovery.teamTitle, syncedRecovery);
              setCloudStatus('connected');
              setIsInitialLoad(false);
              return;
            }

            const rawJson = JSON.stringify(remoteData);
            // Skip re-setting state if this snapshot reflects our own saved data
            if (rawJson === lastSavedJsonRef.current) {
              setCloudStatus('connected');
              setIsInitialLoad(false);
              isRemoteLoadedRef.current = true;
              return;
            }

            const cleanedData = normalizeTeamData(remoteData, currentTeamId);
            const customBaseDate = isCustomHorizonRef.current && cleanedData.weeks?.[0]?.startDate
              ? parseDateIso(cleanedData.weeks[0].startDate)
              : undefined;

            const synchronized = syncRollingWeeksAndAllocations(cleanedData, customBaseDate);
            const syncJson = JSON.stringify(synchronized);
            lastSavedJsonRef.current = syncJson;
            setAppData(synchronized);
            isRemoteLoadedRef.current = true;
            try {
              localStorage.setItem(`tracker_team_${currentTeamId}`, syncJson);
            } catch {}
            // Insurance: check and ensure a daily auto-snapshot exists in Firestore
            checkAndCreateDailyAutoSnapshot(currentTeamId, synchronized.teamTitle, synchronized);

            // If the schedule rolled forward from stale weeks, persist the newly rolled weeks to Firestore
            if (cleanedData.weeks?.[0]?.startDate !== synchronized.weeks?.[0]?.startDate && !isCustomHorizonRef.current) {
              setDoc(docRef, synchronized, { merge: true }).catch(err => {
                console.error('Failed to sync rolled weeks to Firestore:', err);
              });
            }
          }
        } else {
          // Never overwrite Firestore when a local cache miss occurs before server response
          if (isFromCache) {
            return;
          }
          // Document does not exist on server; check snapshots first before falling back to default data
          const snaps = await fetchTeamSnapshots(currentTeamId);
          if (isCancelled) return;
          const validSnap = snaps.find(s => s.data && !isCorruptedFactoryData(s.data, currentTeamId));
          const baseData = validSnap?.data || getDefaultTeamData(currentTeamId);
          const initialData = syncRollingWeeksAndAllocations(normalizeTeamData(baseData, currentTeamId));
          lastSavedJsonRef.current = JSON.stringify(initialData);
          setDoc(docRef, initialData, { merge: true }).catch(err => {
            console.error('Error seeding initial team Firestore doc:', err);
          });
          setAppData(initialData);
          isRemoteLoadedRef.current = true;
          checkAndCreateDailyAutoSnapshot(currentTeamId, initialData.teamTitle, initialData);
        }
        setCloudStatus('connected');
        setIsInitialLoad(false);
      },
      (error) => {
        if (isCancelled) return;
        console.error('Firestore snapshot listener error for team:', error);
        setCloudStatus('error');
        setIsInitialLoad(false);
      }
    );

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, [currentTeamId]);

  // 3. Save active team changes to Firestore and localStorage
  useEffect(() => {
    if (!isRemoteLoadedRef.current || isInitialLoad) {
      return;
    }
    if (isCorruptedFactoryData(appData, currentTeamId)) {
      return;
    }

    const currentJson = JSON.stringify(appData);
    if (currentJson === lastSavedJsonRef.current) {
      return;
    }

    // Sync to team-specific localStorage
    try {
      localStorage.setItem(`tracker_team_${currentTeamId}`, currentJson);
      localStorage.setItem('tracker_active_team_id', currentTeamId);
    } catch (e) {
      console.error('Failed to persist team to localStorage', e);
    }

    setCloudStatus('syncing');
    const docId = getTeamDocId(currentTeamId);
    const docRef = doc(db, FIRESTORE_COLLECTION, docId);
    lastSavedJsonRef.current = currentJson;
    
    setDoc(docRef, appData, { merge: true })
      .then(() => {
        setCloudStatus('connected');
      })
      .catch((err) => {
        console.error('Failed to update Firestore team document:', err);
        setCloudStatus('error');
      });
  }, [appData, currentTeamId, isInitialLoad]);

  // Automatically roll forward when a new week arrives or tab is focused
  useEffect(() => {
    const handleCheckWeek = () => {
      if (!isRemoteLoadedRef.current || isCustomHorizonRef.current) {
        return;
      }
      setAppData(prev => {
        const next = syncRollingWeeksAndAllocations(prev);
        if (next.weeks?.[0]?.startDate !== prev.weeks?.[0]?.startDate) {
          return next;
        }
        return prev;
      });
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
  const [modalRows, setModalRows] = useState<ModalAllocationRow[]>([]);
  const [draggedRowIndex, setDraggedRowIndex] = useState<number | null>(null);
  const [dragOverRowIndex, setDragOverRowIndex] = useState<number | null>(null);

  // Manage Team Modal State
  const [manageTeamModalOpen, setManageTeamModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editingStaffName, setEditingStaffName] = useState('');

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: unknown) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    const text = typeof msg === 'string' ? msg : 'Allocations saved successfully';
    setToastMessage(text);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Active 2 weeks horizon
  const active2Weeks = useMemo(() => {
    const list = appData.weeks.filter(w => !w.archived);
    return list.length > 0 ? list.slice(0, 2) : appData.weeks.slice(0, 2);
  }, [appData.weeks]);

  // Lead member
  const leadMember = useMemo(() => {
    return appData.staff.find(s => s.id === appData.teamLeadId) || appData.staff[0];
  }, [appData.staff, appData.teamLeadId]);

  // Guaranteed alphabetically sorted staff array for consistent presentation
  const sortedStaff = useMemo(() => {
    return [...appData.staff].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [appData.staff]);

  // Staff calculations (always in alphabetical order)
  const staffLoadStats = useMemo(() => {
    return sortedStaff.map(staff => {
      let sumTotal = 0;
      const weekLoads: Record<string, { total: number; hasChanged: boolean; hasExpired: boolean; items: AllocationItem[] }> = {};

      active2Weeks.forEach(w => {
        const key = `${staff.id}_${w.id}`;
        const list = appData.allocations[key] || [];
        const sum = list.reduce((acc, p) => acc + (Number(p.percent) || 0), 0);
        const hasChanged = list.some(p => p.changed);
        const hasExpired = list.some(p => isAllocationExpired(p, w.startDate));
        sumTotal += sum;
        weekLoads[w.id] = { total: sum, hasChanged, hasExpired, items: list };
      });

      const avg = active2Weeks.length > 0 ? Math.round(sumTotal / active2Weeks.length) : 0;
      return {
        staff,
        weekLoads,
        avg,
      };
    });
  }, [sortedStaff, appData.allocations, active2Weeks]);

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

    const datasets = sortedStaff.map((s, idx) => {
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
      isNew: false,
      initialPercent: item.percent,
      initialEndDateType: item.endDateType || 'date',
      initialEndDate: item.endDate || '',
      initialChanged: item.changed || false,
      userToggledChanged: false,
      endDateType: item.endDateType || 'date',
      endDate: item.endDate || '',
      changed: item.changed || false,
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
      { 
        project: '', 
        percent: 0, 
        isNew: true,
        initialPercent: undefined,
        initialEndDateType: 'date',
        initialEndDate: '',
        initialChanged: false,
        userToggledChanged: false,
        changed: false, 
        endDateType: 'date', 
        endDate: '' 
      }
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
      const row = next[index];
      if (!row) return prev;

      const nextProject = field === 'project' ? String(value) : row.project;
      const nextType = field === 'endDateType' ? (value as ProjectEndDateType) : (row.endDateType || 'date');
      const nextDate = field === 'endDate' ? String(value) : (row.endDate || '');
      const nextPct = field === 'percent' ? Math.max(0, Number(value) || 0) : row.percent;

      let changed = row.changed;
      // Only auto-flag changed if the user hasn't explicitly toggled this row's button
      if (!row.userToggledChanged) {
        if (!row.isNew) {
          const pctChanged = row.initialPercent !== undefined && nextPct !== row.initialPercent;
          const initialType = row.initialEndDateType || 'date';
          const typeChanged = initialType !== nextType;
          const dateValChanged = (nextType === 'date' || initialType === 'date') && (row.initialEndDate || '') !== nextDate;
          const isModified = pctChanged || typeChanged || dateValChanged;

          // If modified, light up lightning icon; if returned to original values, preserve original status
          changed = isModified || (!!row.initialChanged && !isModified);
        } else {
          // New project row on initial entry: choosing 'ongoing', 'Secondary', or entering percent/date
          // must not activate the changed icon. Only saved data date or percentage changed after initial entry activates it.
          changed = false;
        }
      }

      next[index] = { 
        ...row, 
        project: nextProject,
        percent: nextPct, 
        endDateType: nextType,
        endDate: nextDate,
        changed 
      };
      return next;
    });
  };

  const handleToggleRowChanged = (index: number) => {
    setModalRows(prev => {
      const next = [...prev];
      const nextChanged = !next[index].changed;
      next[index] = { 
        ...next[index], 
        changed: nextChanged,
        userToggledChanged: true
      };
      return next;
    });
  };

  const handleClearAllModalChanged = () => {
    setModalRows(prev => prev.map(r => ({
      ...r,
      changed: false,
      userToggledChanged: true
    })));
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedRowIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverRowIndex !== index) {
      setDragOverRowIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedRowIndex(null);
    setDragOverRowIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedRowIndex === null || draggedRowIndex === targetIndex) {
      setDraggedRowIndex(null);
      setDragOverRowIndex(null);
      return;
    }

    setModalRows(prev => {
      const next = [...prev];
      const [movedItem] = next.splice(draggedRowIndex, 1);
      next.splice(targetIndex, 0, movedItem);
      return next;
    });

    setDraggedRowIndex(null);
    setDragOverRowIndex(null);
  };

  // Copy helper 1: Copy From Prev Week
  const handleCopyFromPrevWeek = () => {
    if (!modalStaffId || !modalWeekId) return;
    const currentWeekIndex = appData.weeks.findIndex(w => w.id === modalWeekId);
    if (currentWeekIndex < 0) return;

    let prevWeekId: string;
    let prevWeekLabel: string;

    if (currentWeekIndex > 0) {
      const prevWeek = appData.weeks[currentWeekIndex - 1];
      prevWeekId = prevWeek.id;
      prevWeekLabel = prevWeek.label;
    } else {
      const currWeek = appData.weeks[0];
      const currStart = parseDateIso(currWeek.startDate);
      const prevStart = new Date(currStart.getFullYear(), currStart.getMonth(), currStart.getDate() - 7);
      const prevEnd = new Date(prevStart.getFullYear(), prevStart.getMonth(), prevStart.getDate() + 4, 23, 59, 59);
      prevWeekId = `w_${formatDateIso(prevStart)}`;
      prevWeekLabel = formatWeekLabel(prevStart, prevEnd);
    }

    const prevKey = `${modalStaffId}_${prevWeekId}`;
    const prevAllocations = appData.allocations[prevKey];

    if (!prevAllocations || prevAllocations.length === 0) {
      showToast(`No allocations recorded in previous week (${prevWeekLabel})`);
      return;
    }

    setModalRows(prevAllocations.map(item => ({ 
      ...item, 
      changed: false,
      isNew: false,
      initialPercent: item.percent,
      initialEndDateType: item.endDateType || 'date',
      initialEndDate: item.endDate || '',
      initialChanged: false,
      userToggledChanged: false,
      endDateType: item.endDateType || 'date',
      endDate: item.endDate || ''
    })));
    showToast(`Copied allocations from ${prevWeekLabel}`);
  };

  // Copy helper 2: Duplicate To Next Week
  const handleDuplicateToNextWeek = () => {
    if (!modalStaffId || !modalWeekId) return;
    const currentWeekIndex = appData.weeks.findIndex(w => w.id === modalWeekId);
    if (currentWeekIndex < 0) return;
    
    let targetWeekId: string;
    let targetWeekLabel: string;

    if (currentWeekIndex >= appData.weeks.length - 1) {
      const lastWeek = appData.weeks[currentWeekIndex];
      const prevStart = parseDateIso(lastWeek.startDate);
      const nextStart = new Date(prevStart.getFullYear(), prevStart.getMonth(), prevStart.getDate() + 7);
      const nextEnd = new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate() + 4, 23, 59, 59);
      const nextIsoStart = formatDateIso(nextStart);
      targetWeekId = `w_${nextIsoStart}`;
      targetWeekLabel = formatWeekLabel(nextStart, nextEnd);
    } else {
      const targetWeek = appData.weeks[currentWeekIndex + 1];
      targetWeekId = targetWeek.id;
      targetWeekLabel = targetWeek.label;
    }

    const nextKey = `${modalStaffId}_${targetWeekId}`;
    const currentValidRows = modalRows.filter(r => r.project.trim() !== '');
    const currentSaved = buildSavedListForCurrentModal();

    const nextAppData: AppData = {
      ...appData,
      allocations: {
        ...appData.allocations,
        ...(currentSaved ? { [currentSaved.key]: currentSaved.updatedList } : {}),
        [nextKey]: currentValidRows.map(r => ({ 
          project: r.project.trim(), 
          percent: Number(r.percent) || 0, 
          changed: false,
          endDateType: r.endDateType || 'date',
          endDate: r.endDate || ''
        })),
      },
    };

    persistAppData(nextAppData);
    showToast(`Duplicated allocations to next week (${targetWeekLabel})`);
  };

  // Copy all current week allocations to next week for all staff members
  const handleCopyAllToNextWeek = () => {
    if (active2Weeks.length < 2) return;
    const [currentW, nextW] = active2Weeks;
    setConfirmCopyAll(false);

    const updatedAllocations: Record<string, AllocationItem[]> = { ...appData.allocations };
    appData.staff.forEach(staff => {
      const currentKey = `${staff.id}_${currentW.id}`;
      const nextKey = `${staff.id}_${nextW.id}`;
      const currentList = appData.allocations[currentKey] || [];
      const activeItems = filterActiveAllocations(currentList, nextW.startDate);
      updatedAllocations[nextKey] = activeItems.map(item => ({
        ...item,
        changed: false,
      }));
    });

    const nextAppData: AppData = {
      ...appData,
      allocations: updatedAllocations,
    };

    persistAppData(nextAppData);
    showToast(`Copied all team allocations from Current Week to Next Week (${nextW.label})`);
  };

  const modalCalculatedTotal = useMemo(() => {
    return modalRows.reduce((acc, row) => acc + (Number(row.percent) || 0), 0);
  }, [modalRows]);

  const buildSavedListForCurrentModal = (): { key: string; updatedList: AllocationItem[]; hasDiff: boolean } | null => {
    if (!modalStaffId || !modalWeekId) return null;
    const key = `${modalStaffId}_${modalWeekId}`;
    const oldList = appData.allocations[key] || [];

    const updatedList: AllocationItem[] = modalRows
      .filter(r => r.project.trim() !== '')
      .map(r => {
        const projName = r.project.trim();
        const newPct = Number(r.percent) || 0;
        const newEndDateType: ProjectEndDateType = r.endDateType || 'date';
        const newEndDate = r.endDate || '';
        const existing = oldList.find(p => p.project.toLowerCase() === projName.toLowerCase());

        let isChanged = false;
        if (r.userToggledChanged) {
          // Explicit user toggle (ON or OFF) strictly overrides everything
          isChanged = !!r.changed;
        } else if (r.isNew) {
          // Newly added project row on initial entry: NOT changed
          isChanged = false;
        } else if (r.initialPercent !== undefined || r.initialEndDate !== undefined || r.initialEndDateType !== undefined) {
          // Auto-mark changed if percentage, date, or date type changed from initial loaded value
          const pctChanged = r.initialPercent !== undefined && newPct !== r.initialPercent;
          const initialType = r.initialEndDateType || 'date';
          const typeChanged = initialType !== newEndDateType;
          const dateValChanged = (newEndDateType === 'date' || initialType === 'date') && (r.initialEndDate || '') !== newEndDate;
          const isModified = pctChanged || typeChanged || dateValChanged;

          isChanged = isModified || (!!r.initialChanged && !isModified);
        } else if (existing) {
          // Fallback to existing project comparison if initial values missing
          const pctChanged = existing.percent !== newPct;
          const initialType = existing.endDateType || 'date';
          const typeChanged = initialType !== newEndDateType;
          const dateValChanged = (newEndDateType === 'date' || initialType === 'date') && (existing.endDate || '') !== newEndDate;
          isChanged = pctChanged || typeChanged || dateValChanged || !!existing.changed;
        } else {
          isChanged = false;
        }

        return { 
          project: projName, 
          percent: newPct, 
          changed: isChanged,
          endDateType: newEndDateType,
          endDate: newEndDate
        };
      });

    const hasDiff = JSON.stringify(updatedList) !== JSON.stringify(oldList);
    return { key, updatedList, hasDiff };
  };

  const handleSwitchModalWeek = (targetWeekId: string) => {
    if (!modalStaffId || !targetWeekId || targetWeekId === modalWeekId) return;

    let latestAllocations = appData.allocations;
    const saved = buildSavedListForCurrentModal();
    if (saved && saved.hasDiff) {
      latestAllocations = {
        ...appData.allocations,
        [saved.key]: saved.updatedList,
      };
      persistAppData({
        ...appData,
        allocations: latestAllocations,
      });
    }

    const targetKey = `${modalStaffId}_${targetWeekId}`;
    const list = latestAllocations[targetKey] || [
      { project: 'Course Maintenance', percent: 15, changed: false, endDateType: 'ongoing' },
    ];
    setModalWeekId(targetWeekId);
    setDraggedRowIndex(null);
    setDragOverRowIndex(null);
    setModalRows(
      list.map(item => ({
        ...item,
        isNew: false,
        initialPercent: item.percent,
        initialEndDateType: item.endDateType || 'date',
        initialEndDate: item.endDate || '',
        initialChanged: item.changed || false,
        userToggledChanged: false,
        endDateType: item.endDateType || 'date',
        endDate: item.endDate || '',
        changed: item.changed || false,
      }))
    );
  };

  const handleSaveAllocations = (customToastMsg?: string | React.MouseEvent | React.SyntheticEvent) => {
    const saved = buildSavedListForCurrentModal();
    if (!saved) return;

    const nextAppData: AppData = {
      ...appData,
      allocations: {
        ...appData.allocations,
        [saved.key]: saved.updatedList,
      },
    };

    persistAppData(nextAppData);

    const message = typeof customToastMsg === 'string' ? customToastMsg : 'Allocations saved successfully';
    showToast(message);
    handleCloseAllocationModal();
  };

  // Quick 1-click action to clear "Changed" status for a member and week directly from dashboard
  const handleClearChangedForMemberWeek = (staffId: string, weekId: string) => {
    const key = `${staffId}_${weekId}`;
    const list = appData.allocations[key] || [];
    const updatedList = list.map(item => ({ ...item, changed: false }));
    const nextAppData: AppData = {
      ...appData,
      allocations: {
        ...appData.allocations,
        [key]: updatedList,
      },
    };
    persistAppData(nextAppData);
    showToast('Cleared "Changed" status');
  };

  // Registry sync helper for team lead updates
  const syncTeamLeadToRegistry = useCallback((teamId: string, leadName: string) => {
    setTeamsList(prev => {
      const updatedTeams = prev.map(t => 
        t.id === teamId ? { ...t, leadName } : t
      );
      try {
        localStorage.setItem('tracker_teams_list', JSON.stringify(updatedTeams));
      } catch (e) {
        console.error('Failed to cache teams list', e);
      }
      const regRef = doc(db, FIRESTORE_COLLECTION, 'teams_registry');
      setDoc(regRef, { teams: updatedTeams }, { merge: true }).catch(console.error);
      return updatedTeams;
    });
  }, []);

  // Staff Notes Update Handler
  const handleUpdateStaffNotes = (staffId: string, noteText: string) => {
    const updatedNotes = { ...(appData.notes || {}), [staffId]: noteText };
    const updatedStaff = appData.staff.map(s => s.id === staffId ? { ...s, notes: noteText } : s);
    const nextAppData: AppData = {
      ...appData,
      notes: updatedNotes,
      staff: updatedStaff,
    };
    persistAppData(nextAppData);
  };

  // CSV Export
  const exportToCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    
    // Header
    const weekHeaders = active2Weeks.map(w => `"${w.label} Total %"`).join(',');
    csvContent += `"FFIDs","Role",${weekHeaders},"2-Week Avg %","Notes","Detailed Allocations"\n`;

    // Rows
    staffLoadStats.forEach(stat => {
      const weekTotals = active2Weeks.map(w => stat.weekLoads[w.id]?.total || 0).join(',');
      const memberNote = (appData.notes?.[stat.staff.id] || stat.staff.notes || '').replace(/"/g, '""');
      const breakdown = active2Weeks.map(w => {
        const items = stat.weekLoads[w.id]?.items || [];
        const details = items.map(i => formatAllocationDetail(i)).join('; ');
        return `[${w.label}: ${details || 'None'}]`;
      }).join(' | ');

      csvContent += `"${stat.staff.name}","${stat.staff.id === appData.teamLeadId ? '(TL)' : 'Member'}",${weekTotals},"${stat.avg}%","${memberNote}","${breakdown.replace(/"/g, '""')}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `capacity_tracker_${formatDateIso(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV report exported successfully');
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
      staff: [...prev.staff, newStaff].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
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
      const updatedStaff = prev.staff
        .map(s => s.id === id ? { ...s, name: trimmedName } : s)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      
      // If this member is the team lead, also update the teams_registry leadName
      if (prev.teamLeadId === id) {
        syncTeamLeadToRegistry(currentTeamId, trimmedName);
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
      showToast('You must have at least one team member');
      return;
    }
    setAppData(prev => {
      const nextStaff = prev.staff
        .filter(s => s.id !== id)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      const nextLead = prev.teamLeadId === id ? (nextStaff[0]?.id || '') : prev.teamLeadId;
      const nextLeadMember = nextStaff.find(s => s.id === nextLead);
      if (nextLeadMember) {
        syncTeamLeadToRegistry(currentTeamId, nextLeadMember.name);
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
        syncTeamLeadToRegistry(currentTeamId, nextLeadMember.name);
      }
      return { ...prev, teamLeadId: id };
    });
    showToast('(TL) updated');
  };

  // Team Switcher Actions
  const handleSelectTeam = (teamId: string) => {
    if (teamId === currentTeamId) return;
    isRemoteLoadedRef.current = false;
    isCustomHorizonRef.current = false;
    setIsCustomHorizon(false);
    setConfirmCopyAll(false);
    setIsInitialLoad(true);
    setCurrentTeamId(teamId);
    try {
      localStorage.setItem('tracker_active_team_id', teamId);
      const url = new URL(window.location.href);
      url.searchParams.set('team', teamId);
      window.history.replaceState({}, '', url.toString());

      const cached = localStorage.getItem(`tracker_team_${teamId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (
          parsed &&
          Array.isArray(parsed.staff) &&
          parsed.staff.length > 0 &&
          !isCorruptedFactoryData(parsed, teamId)
        ) {
          const synchronized = syncRollingWeeksAndAllocations(parsed);
          lastSavedJsonRef.current = JSON.stringify(synchronized);
          setAppData(synchronized);
        } else if (isCorruptedFactoryData(parsed, teamId)) {
          localStorage.removeItem(`tracker_team_${teamId}`);
          setAppData(syncRollingWeeksAndAllocations(getDefaultTeamData(teamId)));
        }
      } else {
        setAppData(syncRollingWeeksAndAllocations(getDefaultTeamData(teamId)));
      }
    } catch (e) {}
    const target = teamsList.find(t => t.id === teamId);
    showToast(`Switched to ${target?.name || 'Team'}`);
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
      localStorage.setItem('tracker_teams_list', JSON.stringify(updatedTeams));
    } catch (e) {}

    showToast(`Updated ${cleanName}`);
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
                onUpdateTeam={handleUpdateTeam}
                activeTeamTitle={appData.teamTitle}
                activeLeadName={leadMember?.name || 'Mazzy'}
              />
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-medium">
              <span>(TL): <span id="leadNameDisplay" className="text-blue-600 font-semibold">{leadMember?.name || 'Mazzy'}</span></span>
              <span>•</span>
              <span className="text-slate-400">{appData.staff.length} FFIDs</span>
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
            id="manageTeamBtn"
            type="button"
            onClick={() => setManageTeamModalOpen(true)}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Manage Team</span>
          </button>

          <button
            id="revertToEarlierDateBtn"
            type="button"
            onClick={() => setRevertDateModalOpen(true)}
            className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
            title="Insurance snapshots and calendar horizon reversion"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
            <span>Snapshots &amp; Revert</span>
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
        {isCustomHorizon && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-amber-900 shadow-2xs">
            <div className="flex items-center gap-2 font-medium">
              <RotateCcw className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>
                Viewing custom schedule horizon (<strong>{active2Weeks.map(w => w.label).join(' & ')}</strong>). Automatic week-rolling is paused while viewing this date range.
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleRevertToDate(formatDateIso(new Date()))}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors cursor-pointer shrink-0"
            >
              Return to Current Week
            </button>
          </div>
        )}

        {/* Top 4 KPI Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Active Team */}
          <div id="cardActiveTeam" className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between shadow-xs hover:shadow-sm transition-shadow">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Active Team</p>
              <p id="kpiTeamCount" className="text-3xl font-bold text-slate-900">{kpis.totalStaff} FFIDs</p>
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
                {confirmCopyAll ? (
                  <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md text-[11px]">
                    <span className="text-blue-900 font-semibold">Copy current week to next week for all?</span>
                    <button
                      type="button"
                      onClick={handleCopyAllToNextWeek}
                      className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded cursor-pointer transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmCopyAll(false)}
                      className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold rounded cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmCopyAll(true)}
                    className="text-[11px] bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 px-2.5 py-1 rounded-md text-slate-700 font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                    title="Copy all current week active allocations to next week for the whole team"
                  >
                    <ExternalLink className="w-3 h-3 text-blue-600" />
                    <span>Copy All to Next Week</span>
                  </button>
                )}
                <span className="text-[10px] bg-amber-50 border border-amber-200 px-2 py-1 rounded-md text-amber-700 font-bold flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-500 fill-amber-500" /> Changed
                </span>
                <span
                  className="text-[10px] bg-rose-50 border border-rose-200 px-2 py-1 rounded-md text-rose-700 font-bold flex items-center gap-1"
                  title="Projects with expired end dates are preserved and highlighted so you can extend the date or delete them"
                >
                  <AlertTriangle className="w-3 h-3 text-rose-600" /> Expired Date
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
                    <th className="py-3 px-6 text-left border-b border-slate-200">FFIDs</th>
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
                    <th className="py-3 px-6 text-left border-b border-slate-200 min-w-[240px]">
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                        <span>Notes</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody id="gridTbody" className="divide-y divide-slate-100">
                  {filteredStaffStats.length === 0 ? (
                    <tr>
                      <td colSpan={3 + active2Weeks.length} className="py-8 text-center text-slate-400 font-medium text-xs">
                        No team members match this capacity filter.
                      </td>
                    </tr>
                  ) : (
                    filteredStaffStats.map(({ staff, weekLoads, avg }) => {
                      const currentNote = appData.notes?.[staff.id] ?? staff.notes ?? '';

                      return (
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
                            const weekData = weekLoads[w.id] || { total: 0, hasChanged: false, hasExpired: false, items: [] };
                            const sum = weekData.total;
                            const isOver = sum > 100;
                            const isTarget = sum >= 80 && sum <= 100;
                            const changedItems = (weekData.items || []).filter(p => p.changed);
                            const expiredItems = (weekData.items || []).filter(p => isAllocationExpired(p, w.startDate));
                            const changedTooltip = changedItems.length > 0
                              ? `Changed projects:\n${changedItems.map(p => {
                                  let endInfo = '';
                                  if (p.endDateType === 'ongoing') endInfo = ' (Ongoing)';
                                  else if (p.endDateType === 'secondary_tasks') endInfo = ' (Secondary Tasks)';
                                  else if (p.endDate) endInfo = ` (End: ${p.endDate})`;
                                  return `• ${p.project}: ${p.percent}%${endInfo}`;
                                }).join('\n')}`
                              : 'Recently changed';
                            const expiredTooltip = expiredItems.length > 0
                              ? `Expired project end date(s) — click to extend or delete:\n${expiredItems.map(p => `• ${p.project}: ${p.percent}% (Expired: ${p.endDate})`).join('\n')}`
                              : 'Project end date expired';

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
                                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/zap:flex flex-col z-50 bg-slate-900 text-white text-[11px] py-2.5 px-3.5 rounded-xl shadow-xl border border-slate-700 min-w-[250px] max-w-xs text-left">
                                        <div className="flex items-center justify-between gap-2 border-b border-slate-700 pb-1.5 mb-1.5">
                                          <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                                            <Zap className="w-3.5 h-3.5 fill-amber-400 shrink-0" />
                                            <span>Changed Projects</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleClearChangedForMemberWeek(staff.id, w.id);
                                            }}
                                            className="text-[10px] text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2 py-0.5 rounded cursor-pointer transition-colors font-medium"
                                            title="Clear 'Changed' tag for all projects in this week"
                                          >
                                            Turn Off
                                          </button>
                                        </div>
                                        <div className="space-y-2 max-h-48 overflow-y-auto">
                                          {changedItems.map((cp, idx) => {
                                            let endBadge = '';
                                            if (cp.endDateType === 'ongoing') endBadge = 'Ongoing';
                                            else if (cp.endDateType === 'secondary_tasks') endBadge = 'Secondary Tasks';
                                            else if (cp.endDate) endBadge = cp.endDate;

                                            return (
                                              <div key={idx} className="flex items-start justify-between gap-3 text-slate-200">
                                                <div className="flex flex-col min-w-0 flex-1">
                                                  <span className="font-semibold text-white leading-tight break-words">{cp.project}</span>
                                                  {endBadge && (
                                                    <span className="text-[10px] text-amber-300 font-normal mt-0.5 whitespace-nowrap">
                                                      {cp.endDateType === 'date' || !cp.endDateType ? `End: ${endBadge}` : endBadge}
                                                    </span>
                                                  )}
                                                </div>
                                                <span className="font-bold text-amber-300 shrink-0 text-xs">{cp.percent}%</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  {weekData.hasExpired && (
                                    <div className="relative group/expired inline-flex items-center">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenAllocationModal(staff.id, w.id);
                                        }}
                                        className="px-1.5 py-0.5 rounded-md bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 transition-colors cursor-pointer flex items-center gap-1"
                                        title={expiredTooltip}
                                      >
                                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                        <span className="text-[10px] font-bold">{expiredItems.length}</span>
                                      </button>
                                      {/* Expired Projects Popover */}
                                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/expired:flex flex-col z-50 bg-slate-900 text-white text-[11px] py-2.5 px-3.5 rounded-xl shadow-xl border border-rose-500/50 min-w-[260px] max-w-xs text-left">
                                        <div className="flex items-center justify-between gap-2 border-b border-slate-700 pb-1.5 mb-1.5">
                                          <div className="flex items-center gap-1.5 text-rose-400 font-bold">
                                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                            <span>Expired Project Date(s)</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenAllocationModal(staff.id, w.id);
                                            }}
                                            className="text-[10px] text-white bg-rose-600 hover:bg-rose-500 px-2 py-0.5 rounded cursor-pointer transition-colors font-semibold"
                                          >
                                            Extend / Edit
                                          </button>
                                        </div>
                                        <div className="space-y-2 max-h-48 overflow-y-auto">
                                          {expiredItems.map((ep, idx) => (
                                            <div key={idx} className="flex items-start justify-between gap-3 text-slate-200">
                                              <div className="flex flex-col min-w-0 flex-1">
                                                <span className="font-semibold text-white leading-tight break-words">{ep.project}</span>
                                                <span className="text-[10px] text-rose-300 font-medium mt-0.5 whitespace-nowrap">
                                                  Expired: {ep.endDate}
                                                </span>
                                              </div>
                                              <span className="font-bold text-rose-300 shrink-0 text-xs">{ep.percent}%</span>
                                            </div>
                                          ))}
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-2 pt-1.5 border-t border-slate-800">
                                          Click to extend the project end date or delete the row.
                                        </p>
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

                          {/* Notes Column */}
                          <td className="py-3 px-6 text-left">
                            <StaffNoteInput
                              staffId={staff.id}
                              initialNote={currentNote}
                              onSaveNote={handleUpdateStaffNotes}
                            />
                          </td>
                        </tr>
                      );
                    })
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
                        .map(p => {
                          let endInfo = '';
                          if (p.endDateType === 'ongoing') endInfo = ' (Ongoing)';
                          else if (p.endDateType === 'secondary_tasks') endInfo = ' (Secondary Tasks)';
                          else if (p.endDate) endInfo = ` (End: ${p.endDate})`;
                          return `${p.project} (${p.percent}%)${endInfo}`;
                        })
                    );
                    const hasChanged = memberChangedItems.length > 0;
                    const memberExpiredItems = active2Weeks.flatMap(w =>
                      (stat.weekLoads[w.id]?.items || [])
                        .filter(p => isAllocationExpired(p, w.startDate))
                        .map(p => `${p.project} (Expired: ${p.endDate})`)
                    );
                    const hasExpired = memberExpiredItems.length > 0;
                    
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
                        title={
                          hasExpired
                            ? `Expired project date(s): ${memberExpiredItems.join(', ')}`
                            : hasChanged
                            ? `Changed: ${memberChangedItems.join(', ')}`
                            : 'Click to view & edit workload allocations'
                        }
                      >
                        <div className="w-24 text-[11px] font-bold text-slate-600 uppercase truncate group-hover:text-blue-600 transition-colors flex items-center gap-1">
                          <span className="truncate">{stat.staff.name}</span>
                          {hasChanged && (
                            <Zap className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" title={`Changed: ${memberChangedItems.join(', ')}`} />
                          )}
                          {hasExpired && (
                            <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" title={`Expired date: ${memberExpiredItems.join(', ')}`} />
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
            if (e.target === e.currentTarget) handleSaveAllocations('Allocations auto-saved');
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div id="modalStaffBadge" className="w-11 h-11 rounded-xl bg-blue-600 font-bold flex items-center justify-center text-white text-lg shadow-xs shrink-0">
                  {currentModalStaff.name.substring(0, 1).toUpperCase()}
                </div>
                <div>
                  <h3 id="modalTitle" className="text-base font-bold text-white leading-tight">
                    Workload for {currentModalStaff.name.toUpperCase()}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p id="modalSubtitle" className="text-xs text-slate-300 font-normal">
                      {currentModalWeek.label}
                    </p>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      active2Weeks[0]?.id === currentModalWeek.id
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                        : 'bg-slate-700 text-slate-200 border border-slate-600'
                    }`}>
                      {active2Weeks[0]?.id === currentModalWeek.id ? 'Current Week' : 'Next Week'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {/* Week Horizon Segmented Toggle */}
                {active2Weeks.length >= 2 && (
                  <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
                    {active2Weeks.map((w, idx) => {
                      const isActiveWeek = w.id === currentModalWeek.id;
                      const horizonLabel = idx === 0 ? 'Current Week' : 'Next Week';
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => handleSwitchModalWeek(w.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                            isActiveWeek
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                          }`}
                          title={`Switch to ${horizonLabel} (${w.label})`}
                        >
                          <span>{horizonLabel}</span>
                          <span className={`text-[10px] font-normal ${isActiveWeek ? 'text-blue-100' : 'text-slate-400'}`}>
                            ({w.label})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <button
                  id="closeAllocationModalBtn"
                  type="button"
                  onClick={() => handleSaveAllocations('Allocations auto-saved')}
                  className="text-slate-400 hover:text-white cursor-pointer p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                  title="Save & Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Copy Helper & Week Toggle Bar */}
            <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
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

              {active2Weeks.length >= 2 && (
                <button
                  type="button"
                  id="toggleModalWeekBtn"
                  onClick={() => {
                    const otherWeek = active2Weeks.find(w => w.id !== currentModalWeek.id);
                    if (otherWeek) handleSwitchModalWeek(otherWeek.id);
                  }}
                  className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-2xs whitespace-nowrap"
                  title="Toggle between Current Week and Next Week"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
                  <span>
                    {active2Weeks[0]?.id === currentModalWeek.id
                      ? `Switch to Next Week (${active2Weeks[1]?.label})`
                      : `Switch to Current Week (${active2Weeks[0]?.label})`}
                  </span>
                </button>
              )}
            </div>

            {/* Table Column Headers */}
            <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 mx-5 mt-3 mb-1 bg-slate-100 border border-slate-200 rounded-xl text-xs font-black text-slate-800 tracking-wider uppercase items-center shadow-2xs">
              <span className="col-span-5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                PROJECT / TASK CODE
                <span className="text-[10px] font-normal text-slate-400 normal-case tracking-normal ml-1">
                  (Drag <GripVertical className="w-3 h-3 inline text-slate-400" /> to reorder)
                </span>
              </span>
              <span className="col-span-4 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                PROJECT END DATE
              </span>
              <span className="col-span-3 text-right pr-2 flex items-center justify-end gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                ALLOCATION % & STATUS
              </span>
            </div>

            {/* Scrollable Editable Project Rows */}
            <div className="px-5 space-y-3 max-h-[50vh] overflow-y-auto custom-scrollbar pb-2 pt-2 sm:pt-0">
              {modalRows.some(r => isAllocationExpired(r, currentModalWeek.startDate)) && (
                <div className="flex items-center justify-between gap-2 text-xs text-rose-900 bg-rose-50 border border-rose-300 px-3.5 py-2.5 rounded-xl font-semibold mb-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      {modalRows.filter(r => isAllocationExpired(r, currentModalWeek.startDate)).length} project(s) have an expired end date — extend the date below (or switch to Ongoing), or click the trash icon to delete.
                    </span>
                  </div>
                </div>
              )}

              {modalRows.some(r => r.changed) && (
                <div className="flex items-center justify-between gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3.5 py-2 rounded-xl font-semibold mb-1">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-500 shrink-0" />
                    <span>{modalRows.filter(r => r.changed).length} project(s) marked as changed</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearAllModalChanged}
                    className="text-[11px] font-bold text-amber-900 bg-amber-200/90 hover:bg-amber-300 border border-amber-300 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0 shadow-2xs"
                    title="Turn off 'Changed' status for all projects in this week"
                  >
                    Clear All Changed
                  </button>
                </div>
              )}

              <div id="projectRowsContainer" className="space-y-2.5">
                {modalRows.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">No project allocations configured yet.</p>
                ) : (
                  modalRows.map((row, idx) => {
                    const isDraggingThis = draggedRowIndex === idx;
                    const isDropTarget = dragOverRowIndex === idx && draggedRowIndex !== idx;
                    const isExpiredRow = isAllocationExpired(row, currentModalWeek.startDate);

                    return (
                      <div 
                        key={idx} 
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                        onDrop={(e) => handleDrop(e, idx)}
                        className={`grid grid-cols-12 gap-2 sm:gap-3 items-center p-2.5 rounded-xl transition-all ${
                          isDraggingThis 
                            ? 'opacity-40 border-2 border-dashed border-blue-400 bg-blue-50/40 shadow-inner' 
                            : isDropTarget
                            ? 'border-2 border-blue-500 bg-blue-50/70 ring-2 ring-blue-200 shadow-md translate-y-0.5'
                            : isExpiredRow
                            ? 'bg-rose-50/70 border-2 border-rose-300 hover:border-rose-400 shadow-2xs'
                            : row.changed 
                            ? 'bg-amber-50/50 border border-amber-200 hover:border-amber-300' 
                            : 'bg-slate-50/50 border border-slate-200/70 hover:border-slate-300'
                        }`}
                      >
                        {/* Project / Task Code Input with Drag Handle */}
                        <div className="col-span-12 sm:col-span-5 relative flex flex-col justify-center">
                          <span className="sm:hidden text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                            <span>Project / Task Code</span>
                            <span className="text-[10px] font-normal text-slate-400 normal-case">Drag handle to reorder</span>
                          </span>
                          <div className="flex items-center gap-1.5 w-full">
                            <div 
                              className="cursor-grab active:cursor-grabbing p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-200/80 rounded-lg transition-colors shrink-0 select-none flex items-center justify-center"
                              title="Drag to rearrange project order"
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>
                            <input
                              type="text"
                              value={row.project}
                              onChange={e => handleRowChange(idx, 'project', e.target.value)}
                              placeholder="Project name (e.g. LMS Migration)"
                              className={`w-full px-3 py-2 text-sm font-semibold text-slate-800 bg-white border ${
                                isExpiredRow
                                  ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-100'
                                  : row.changed 
                                  ? 'border-amber-300 focus:border-amber-500 focus:ring-amber-100' 
                                  : 'border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-blue-100'
                              } rounded-xl outline-none focus:ring-2 transition-all shadow-2xs`}
                            />
                          </div>
                        </div>

                        {/* Project End Date Selector (Option 1: Date Selection, Option 2: Ongoing, Option 3: Secondary Tasks) */}
                        <div className="col-span-12 sm:col-span-4 flex flex-col sm:flex-row items-start sm:items-center gap-1.5">
                          <span className="sm:hidden text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-1">
                            Project End Date
                          </span>
                          <div className="flex items-center gap-1.5 w-full min-w-0 flex-wrap sm:flex-nowrap">
                            <select
                              value={row.endDateType || 'date'}
                              onChange={e => handleRowChange(idx, 'endDateType', e.target.value)}
                              className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 shadow-2xs shrink-0 cursor-pointer"
                              title="Project End Date type"
                            >
                              <option value="date">Date</option>
                              <option value="ongoing">Ongoing</option>
                              <option value="secondary_tasks">Secondary</option>
                            </select>

                            {(!row.endDateType || row.endDateType === 'date') && (
                              <div className="relative flex-1 min-w-[145px] flex items-center gap-1.5">
                                <input
                                  type="date"
                                  value={row.endDate || ''}
                                  onChange={e => handleRowChange(idx, 'endDate', e.target.value)}
                                  onClick={(e) => {
                                    try {
                                      (e.currentTarget as any).showPicker?.();
                                    } catch {}
                                  }}
                                  onFocus={(e) => {
                                    try {
                                      (e.currentTarget as any).showPicker?.();
                                    } catch {}
                                  }}
                                  className={`w-full px-2.5 py-1.5 text-xs rounded-xl outline-none focus:ring-2 shadow-2xs cursor-pointer tracking-normal ${
                                    isExpiredRow
                                      ? 'font-bold text-rose-900 bg-rose-50 border-2 border-rose-400 hover:border-rose-500 focus:border-rose-600 focus:ring-rose-100'
                                      : 'font-medium text-slate-800 bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-blue-100'
                                  }`}
                                  title={isExpiredRow ? 'Project end date has expired — click to extend date' : 'Click anywhere to open calendar'}
                                />
                                {isExpiredRow && (
                                  <span
                                    className="px-1.5 py-0.5 bg-rose-600 text-white text-[9px] font-extrabold uppercase tracking-wider rounded-md shrink-0 flex items-center gap-1 shadow-2xs"
                                    title="This project's end date has passed. Extend the date or delete the project."
                                  >
                                    <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                    <span>Expired</span>
                                  </span>
                                )}
                              </div>
                            )}

                            {row.endDateType === 'ongoing' && (
                              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg whitespace-nowrap">
                                Ongoing
                              </span>
                            )}

                            {row.endDateType === 'secondary_tasks' && (
                              <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-lg whitespace-nowrap">
                                Secondary Tasks
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Allocation %, Changed tag & Delete */}
                        <div className="col-span-12 sm:col-span-3 flex items-center justify-between sm:justify-end gap-1.5 pt-1 sm:pt-0">
                          <span className="sm:hidden text-[10px] font-extrabold text-slate-700 uppercase tracking-wider">
                            Allocation % & Status
                          </span>
                          <div className="flex items-center justify-end gap-1.5 shrink-0">
                            {/* Changed Icon & Tag */}
                            {row.changed ? (
                              <button
                                type="button"
                                onClick={() => handleToggleRowChanged(idx)}
                                className="px-2 py-1 bg-amber-100 hover:bg-rose-100 border border-amber-300 hover:border-rose-300 text-amber-900 hover:text-rose-900 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs transition-colors whitespace-nowrap group/cbtn"
                                title="Click to turn OFF 'Changed' status"
                              >
                                <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500 group-hover/cbtn:text-rose-600 group-hover/cbtn:fill-rose-500 shrink-0" />
                                <span className="group-hover/cbtn:hidden">Changed</span>
                                <span className="hidden group-hover/cbtn:inline text-rose-700">Turn Off ✕</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleToggleRowChanged(idx)}
                                className="px-1.5 py-1 text-slate-400 hover:text-amber-700 hover:bg-amber-50 border border-transparent hover:border-amber-200 rounded-lg text-[11px] font-semibold shrink-0 cursor-pointer opacity-70 hover:opacity-100 transition-all flex items-center gap-1"
                                title="Click to turn ON 'Changed' status"
                              >
                                <Zap className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Allocation % Input */}
                            <div className="relative w-18 flex items-center shrink-0">
                              <input
                                type="number"
                                min="0"
                                max="200"
                                value={row.percent === 0 && row.project === '' ? '' : row.percent}
                                onChange={e => handleRowChange(idx, 'percent', e.target.value)}
                                className={`w-full pl-2 pr-5 py-2 text-sm font-bold bg-white border ${
                                  row.changed 
                                    ? 'border-amber-300 text-amber-900 focus:border-amber-500 focus:ring-amber-100' 
                                    : 'border-slate-200 text-slate-800 hover:border-slate-300 focus:border-blue-500 focus:ring-blue-100'
                                } rounded-xl outline-none focus:ring-2 text-right transition-all shadow-2xs`}
                              />
                              <span className="absolute right-1.5 text-xs font-bold text-slate-400 pointer-events-none">%</span>
                            </div>

                            {/* Delete Button */}
                            <button
                              type="button"
                              onClick={() => handleRemoveProjectRow(idx)}
                              className={`p-1.5 rounded-lg cursor-pointer transition-colors shrink-0 ${
                                isExpiredRow
                                  ? 'text-rose-600 bg-rose-100 hover:bg-rose-600 hover:text-white'
                                  : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                              }`}
                              title={isExpiredRow ? 'Delete expired project' : 'Remove task'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
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
                onClick={() => handleSaveAllocations()}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
              >
                Save Allocations
              </button>
            </div>
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
                  Current FFIDs ({appData.staff.length})
                </h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                  {sortedStaff.map(s => {
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

            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setManageTeamModalOpen(false)}
                className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl cursor-pointer transition-colors shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revert Date Modal */}
      <RevertDateModal
        isOpen={revertDateModalOpen}
        onClose={() => setRevertDateModalOpen(false)}
        currentTeamId={currentTeamId}
        currentTeamTitle={appData.teamTitle}
        appData={appData}
        onRevertToDate={handleRevertToDate}
        teamLeadName={leadMember?.name || 'Mazzy'}
      />
    </div>
  );
}
