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
  Clock,
  Plus,
  Trash2,
  Shield,
  Layers,
} from 'lucide-react';
import { AppData, DataSnapshot } from '../types';
import { parseDateIso, formatWeekLabel, getMondayOfWeek } from '../utils/dateUtils';
import {
  fetchTeamSnapshots,
  createTeamSnapshot,
  deleteTeamSnapshot,
} from '../utils/snapshotUtils';

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
  // Tab: 'snapshots' vs 'calendar'
  const [activeTab, setActiveTab] = useState<'snapshots' | 'calendar'>('snapshots');

  // Compute today's date dynamically
  const getTodayIso = () => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  };

  const todayIso = getTodayIso();

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
  const [isCreatingSnap, setIsCreatingSnap] = useState(false);
  const [deletingSnapId, setDeletingSnapId] = useState<string | null>(null);
  const [newSnapName, setNewSnapName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<DataSnapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);

  // Load snapshots from Firestore
  const loadSnapshots = async () => {
    setIsLoadingSnapshots(true);
    try {
      const list = await fetchTeamSnapshots(currentTeamId);
      setSnapshots(list);
    } catch (err) {
      console.error('Failed to load snapshots:', err);
    } finally {
      setIsLoadingSnapshots(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSuccessMessage(null);
      setErrorMessage(null);
      setShowCreateForm(false);
      setNewSnapName('');
      setSelectedCustomDate(getDefaultRevertDate());
      loadSnapshots();
    }
  }, [isOpen, currentTeamId]);

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

  // Restore directly from a selected snapshot
  const handleRestoreSnapshot = async (snap: DataSnapshot) => {
    if (!snap.data) return;
    setIsReverting(true);
    setErrorMessage(null);
    try {
      const targetDate = snap.data.weeks?.[0]?.startDate || snap.createdAt.split('T')[0];
      await onRevertToDate(targetDate, snap.data);
      setSuccessMessage(`Successfully restored "${snap.name}"!`);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(`Failed to restore snapshot: ${err.message}`);
    } finally {
      setIsReverting(false);
    }
  };

  // Create manual snapshot
  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingSnap(true);
    setErrorMessage(null);
    try {
      const snap = await createTeamSnapshot(
        currentTeamId,
        currentTeamTitle,
        appData,
        newSnapName.trim() || undefined,
        undefined,
        false
      );
      setSuccessMessage(`Created snapshot: "${snap.name}"`);
      setNewSnapName('');
      setShowCreateForm(false);
      await loadSnapshots();
    } catch (err: any) {
      setErrorMessage(`Failed to create snapshot: ${err.message}`);
    } finally {
      setIsCreatingSnap(false);
    }
  };

  // Delete snapshot
  const handleDeleteSnapshot = async (snapId: string, snapName: string) => {
    if (!window.confirm(`Delete snapshot "${snapName}"? This cannot be undone.`)) return;
    setDeletingSnapId(snapId);
    try {
      await deleteTeamSnapshot(snapId);
      setSnapshots((prev) => prev.filter((s) => s.id !== snapId));
      setSuccessMessage(`Deleted snapshot "${snapName}"`);
    } catch (err: any) {
      setErrorMessage(`Failed to delete snapshot: ${err.message}`);
    } finally {
      setDeletingSnapId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center shadow-2xs shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Firestore Snapshots &amp; History</h2>
              </div>
              <p className="text-xs text-slate-500">
                Automatic insurance backups &amp; schedule horizon reversion for <strong className="text-slate-800">{currentTeamTitle}</strong>
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

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 border-b border-slate-200 bg-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('snapshots')}
              className={`px-3 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'snapshots'
                  ? 'border-amber-600 text-amber-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Saved Snapshots ({snapshots.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('calendar')}
              className={`px-3 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'calendar'
                  ? 'border-amber-600 text-amber-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Calendar Horizon Shift</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateForm((prev) => !prev)}
            className="px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer mb-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Take Snapshot Now</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Active Team Lead Indicator */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Active Team: <strong className="text-slate-800">{currentTeamTitle}</strong></span>
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-200">
              <Crown className="w-3 h-3 text-amber-600" />
              <span>TL: {teamLeadName}</span>
            </span>
          </div>

          {/* Quick Create Snapshot Drawer Form */}
          {showCreateForm && (
            <form onSubmit={handleCreateSnapshot} className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2.5">
              <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-amber-600" />
                <span>Save a Custom Restore Point to Firestore</span>
              </div>
              <p className="text-[11px] text-amber-800">
                Captures a permanent, un-resettable snapshot of current staff, rolling weeks, and allocations.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Snapshot name (e.g., Before sprint realignment)"
                  value={newSnapName}
                  onChange={(e) => setNewSnapName(e.target.value)}
                  className="flex-1 text-xs px-3 py-2 bg-white border border-amber-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  type="submit"
                  disabled={isCreatingSnap}
                  className="px-3 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isCreatingSnap ? 'Saving...' : 'Save Backup'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Status Messages */}
          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2 shadow-2xs">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* TAB 1: Saved Snapshots */}
          {activeTab === 'snapshots' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Stored Firestore snapshots available for restore:</span>
                <span className="font-semibold text-slate-700">{snapshots.length} available</span>
              </div>

              {isLoadingSnapshots ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading snapshots...</div>
              ) : snapshots.length === 0 ? (
                <div className="p-6 border-2 border-dashed border-slate-200 rounded-xl text-center space-y-2">
                  <Database className="w-6 h-6 text-slate-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">No snapshots recorded yet</p>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    The system automatically takes daily insurance snapshots, or you can click "Take Snapshot Now" above to create one immediately.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {snapshots.map((snap) => {
                    const isAuto = snap.id.startsWith('auto_');
                    const snapDate = new Date(snap.createdAt);
                    const formattedDate = isNaN(snapDate.getTime())
                      ? snap.createdAt
                      : snapDate.toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        });

                    const staffCount = snap.data?.staff?.length || 0;
                    const weekLabels = snap.data?.weeks?.map((w) => w.label).join(' & ') || 'Standard horizon';

                    return (
                      <div
                        key={snap.id}
                        className="p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl transition-all flex items-start justify-between gap-3 group"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{snap.name}</span>
                            {isAuto ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                                Daily Auto
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                                Manual
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>{formattedDate}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Layers className="w-3 h-3 text-slate-400" />
                              <span>{staffCount} staff members</span>
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-600 font-medium">
                            Weeks: <span className="text-slate-900 font-semibold">{weekLabels}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 pt-1">
                          <button
                            type="button"
                            disabled={isReverting}
                            onClick={() => handleRestoreSnapshot(snap)}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
                          </button>

                          {!isAuto && (
                            <button
                              type="button"
                              disabled={deletingSnapId === snap.id}
                              onClick={() => handleDeleteSnapshot(snap.id, snap.name)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete snapshot"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Calendar Horizon Shift */}
          {activeTab === 'calendar' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="revertDateInput" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Choose Any Specific Date</span>
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  Select a past date to shift the 2-week rolling schedule horizon. If a saved snapshot matches the date, its exact values will be loaded.
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
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={isReverting || !selectedCustomDate}
                  onClick={handleRevertToSpecificDate}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isReverting ? 'animate-spin' : ''}`} />
                  <span>{isReverting ? 'Shifting...' : `Shift Schedule to ${selectedCustomDate}`}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Automatic daily backups protect your entries</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isReverting}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
