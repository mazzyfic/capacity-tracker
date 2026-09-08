import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  Calendar,
  Check,
  AlertTriangle,
  X,
  Crown,
  ShieldCheck,
  CalendarDays,
  Database,
} from 'lucide-react';
import { AppData, DataSnapshot } from '../types';
import { db } from '../firebase';
import {
  collection,
  getDocs,
} from 'firebase/firestore';
import { parseDateIso, formatWeekLabel, getMondayOfWeek } from '../utils/dateUtils';

interface RevertDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTeamId: string;
  currentTeamTitle: string;
  appData: AppData;
  onRevertToDate: (targetDate: string, customData?: AppData) => Promise<void>;
  teamLeadName?: string;
}

export const RevertDateModal: React.FC<RevertDateModalProps> = ({
  isOpen,
  onClose,
  currentTeamId,
  currentTeamTitle,
  appData,
  onRevertToDate,
  teamLeadName = 'Mazzy',
}) => {
  // Compute today's date dynamically
  const getTodayIso = () => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  };

  const todayIso = getTodayIso();

  // Default to the previous week's Monday (e.g. 2026-08-31) or yesterday
  const getDefaultRevertDate = () => {
    try {
      const today = new Date();
      const currentMon = getMondayOfWeek(today);
      const prevMon = new Date(currentMon.getFullYear(), currentMon.getMonth(), currentMon.getDate() - 7);
      return prevMon.toISOString().split('T')[0];
    } catch (e) {
      return '2026-08-31';
    }
  };

  const [selectedCustomDate, setSelectedCustomDate] = useState<string>(getDefaultRevertDate);
  const [isReverting, setIsReverting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<DataSnapshot[]>([]);

  // Load snapshots from Firestore in case a snapshot matches the chosen date
  const loadSnapshots = async () => {
    try {
      const snapCollection = collection(db, 'capacity_snapshots');
      const querySnap = await getDocs(snapCollection);
      const list: DataSnapshot[] = [];
      querySnap.forEach((docSnap) => {
        const item = docSnap.data() as DataSnapshot;
        if (item.teamId === currentTeamId || (!item.teamId && currentTeamId === 'team_mazzy')) {
          list.push({
            ...item,
            id: docSnap.id,
          });
        }
      });
      setSnapshots(list);
    } catch (err) {
      console.error('Failed to load snapshots:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSuccessMessage(null);
      setErrorMessage(null);
      setSelectedCustomDate(getDefaultRevertDate());
      loadSnapshots();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Calculate work week preview for chosen custom date
  const getRollingWeekPreview = (dateIso: string) => {
    try {
      const d = parseDateIso(dateIso);
      const mon1 = getMondayOfWeek(d);
      const fri1 = new Date(mon1.getFullYear(), mon1.getMonth(), mon1.getDate() + 4);
      const mon2 = new Date(mon1.getFullYear(), mon1.getMonth(), mon1.getDate() + 7);
      const fri2 = new Date(mon2.getFullYear(), mon2.getMonth(), mon2.getDate() + 4);

      const mon1Iso = mon1.toISOString().split('T')[0];
      const mon2Iso = mon2.toISOString().split('T')[0];

      return {
        w1Label: formatWeekLabel(mon1, fri1),
        w1Id: `w_${mon1Iso}`,
        w2Label: formatWeekLabel(mon2, fri2),
        w2Id: `w_${mon2Iso}`,
      };
    } catch (e) {
      return {
        w1Label: 'Selected Week',
        w1Id: '',
        w2Label: 'Following Week',
        w2Id: '',
      };
    }
  };

  const preview = getRollingWeekPreview(selectedCustomDate);

  // Check how many staff members have saved database records for this horizon
  const staffCountWithRecords = (appData.staff || []).filter((s) => {
    const key1 = `${s.id}_${preview.w1Id}`;
    const key2 = `${s.id}_${preview.w2Id}`;
    return (
      (appData.allocations?.[key1] && appData.allocations[key1].length > 0) ||
      (appData.allocations?.[key2] && appData.allocations[key2].length > 0)
    );
  }).length;

  // Revert to chosen specific date
  const handleRevertToSpecificDate = async () => {
    if (!selectedCustomDate) return;
    setIsReverting(true);
    setErrorMessage(null);
    try {
      // Look for a snapshot that matches this date exactly
      const matchingSnap = snapshots.find(
        (s) => s.createdAt?.startsWith(selectedCustomDate) || s.id?.includes(selectedCustomDate)
      );

      const customData: AppData | undefined = matchingSnap?.data;

      await onRevertToDate(selectedCustomDate, customData);
      setSuccessMessage(`Successfully shifted schedule horizon to ${selectedCustomDate}!`);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(`Failed to revert to ${selectedCustomDate}: ${err.message}`);
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center shadow-2xs">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Revert Schedule to an Earlier Date</h2>
              </div>
              <p className="text-xs text-slate-500">
                Shift horizon and view saved capacity allocations for <strong className="text-slate-800">{currentTeamTitle}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Team Lead Indicator */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
              <span>Active Team: <strong className="text-slate-800">{currentTeamTitle}</strong></span>
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-200">
              <Crown className="w-3 h-3 text-amber-600" />
              <span>TL: {teamLeadName}</span>
            </span>
          </div>

          {/* Status Messages */}
          {successMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2 shadow-2xs">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Choose Specific Date Section */}
          <div className="space-y-4">
            <div>
              <label htmlFor="revertDateInput" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Choose Any Specific Date</span>
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Select a past date to shift the 2-week rolling schedule horizon and restore what was entered in the database for that period.
              </p>
              <div className="relative">
                <input
                  id="revertDateInput"
                  type="date"
                  max={todayIso}
                  value={selectedCustomDate}
                  onChange={(e) => setSelectedCustomDate(e.target.value)}
                  className="w-full text-sm font-semibold px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200/50 shadow-2xs transition-all cursor-pointer"
                />
              </div>
            </div>

            {/* Live 2-Week Rolling Horizon Preview */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-bold flex items-center gap-1.5 text-slate-800">
                  <CalendarDays className="w-3.5 h-3.5 text-indigo-600" />
                  <span>2-Week Rolling Schedule Horizon</span>
                </span>
                <span className="text-[11px] font-medium text-slate-500">
                  Starts Monday
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                  <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Horizon 1 (Current)</div>
                  <div className="font-bold text-slate-900 mt-0.5">{preview.w1Label}</div>
                </div>
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Horizon 2 (Next)</div>
                  <div className="font-bold text-slate-900 mt-0.5">{preview.w2Label}</div>
                </div>
              </div>

              {/* Database status */}
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600 pt-1">
                <Database className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  {staffCountWithRecords > 0 ? (
                    <span>Found saved database allocations for <strong>{staffCountWithRecords}</strong> of <strong>{appData.staff?.length || 0}</strong> team members.</span>
                  ) : (
                    <span>Will establish baseline horizon allocations from saved team history.</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isReverting}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isReverting || !selectedCustomDate}
            onClick={handleRevertToSpecificDate}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isReverting ? 'animate-spin' : ''}`} />
            <span>{isReverting ? 'Reverting...' : `Revert Schedule to ${selectedCustomDate}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
