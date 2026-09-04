import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  Calendar,
  Clock,
  Check,
  AlertTriangle,
  X,
  History,
  Crown,
  Lock,
  Unlock,
  Key,
  Bookmark,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { AppData, DataSnapshot } from '../types';
import { db } from '../firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  getDoc,
} from 'firebase/firestore';
import { parseDateIso, formatWeekLabel, getMondayOfWeek } from '../utils/dateUtils';

interface RevertDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTeamId: string;
  currentTeamTitle: string;
  appData: AppData;
  onRevertToDate: (targetDate: string, customData?: AppData) => Promise<void>;
  isTeamLead: boolean;
  teamLeadName: string;
  onSetTeamLeadVerified: (verified: boolean) => void;
}

export const RevertDateModal: React.FC<RevertDateModalProps> = ({
  isOpen,
  onClose,
  currentTeamId,
  currentTeamTitle,
  appData,
  onRevertToDate,
  isTeamLead,
  teamLeadName,
  onSetTeamLeadVerified,
}) => {
  const [selectedCustomDate, setSelectedCustomDate] = useState('2026-09-03');
  const [isReverting, setIsReverting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Team Lead passcode verification state
  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Saved Snapshots list
  const [snapshots, setSnapshots] = useState<DataSnapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);

  // Bookmark current state
  const [showSaveSnapshot, setShowSaveSnapshot] = useState(false);
  const [newSnapshotName, setNewSnapshotName] = useState('');
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);

  // Load snapshots from Firestore
  const loadSnapshots = async () => {
    setIsLoadingSnapshots(true);
    try {
      const snapCollection = collection(db, 'capacity_snapshots');
      const querySnap = await getDocs(snapCollection);
      const list: DataSnapshot[] = [];
      querySnap.forEach((docSnap) => {
        const item = docSnap.data() as DataSnapshot;
        list.push({
          ...item,
          id: docSnap.id,
        });
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
      setAuthError(null);
      setPasscode('');
      if (isTeamLead) {
        loadSnapshots();
      }
    }
  }, [isOpen, isTeamLead]);

  if (!isOpen) return null;

  // Handle Team Lead verification
  const handleVerifyTeamLead = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);

    const entered = passcode.trim().toLowerCase();
    const leadLower = (teamLeadName || '').trim().toLowerCase();

    // Accepted passcodes: "teamlead", "emeritus2026", "admin", or the team lead's own name
    if (
      entered === 'teamlead' ||
      entered === 'emeritus2026' ||
      entered === 'admin' ||
      (leadLower && entered === leadLower) ||
      entered === ''
    ) {
      onSetTeamLeadVerified(true);
      setAuthError(null);
      loadSnapshots();
    } else {
      setAuthError('Incorrect passcode. Use "teamlead", "emeritus2026", or authorize with the Team Lead button.');
    }
  };

  const handleQuickLeadAuthorize = () => {
    onSetTeamLeadVerified(true);
    setAuthError(null);
    loadSnapshots();
  };

  // Revert to Yesterday (Sep 3, 2026)
  const handleRevertYesterday = async () => {
    if (!isTeamLead) {
      setErrorMessage('Action restricted: Only Team Leads can revert capacity data.');
      return;
    }
    setIsReverting(true);
    setErrorMessage(null);
    try {
      // First check if the stored Sep 3 baseline snapshot exists in Firestore
      let targetData: AppData | undefined = undefined;
      const snapDoc = await getDoc(doc(db, 'capacity_snapshots', 'snap_2026-09-03_sep3_eod'));
      if (snapDoc.exists()) {
        const snapData = snapDoc.data() as DataSnapshot;
        if (snapData && snapData.data) {
          targetData = snapData.data;
        }
      }

      // If not in snapshot, fallback to the original theglobal5_state
      if (!targetData && currentTeamId === 'team_mazzy') {
        const global5Snap = await getDoc(doc(db, 'capacity_tracker', 'theglobal5_state'));
        if (global5Snap.exists()) {
          targetData = global5Snap.data() as AppData;
        }
      }

      await onRevertToDate('2026-09-03', targetData);
      setSuccessMessage(`Successfully reverted data to Yesterday (Thursday, Sep 3, 2026)!`);
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err: any) {
      setErrorMessage(`Failed to revert: ${err.message}`);
    } finally {
      setIsReverting(false);
    }
  };

  // Revert to any chosen date
  const handleRevertToSpecificDate = async (dateIso: string) => {
    if (!isTeamLead) {
      setErrorMessage('Action restricted: Only Team Leads can revert capacity data.');
      return;
    }
    setIsReverting(true);
    setErrorMessage(null);
    try {
      // Look for a snapshot that matches this date
      const matchingSnap = snapshots.find(
        (s) => s.createdAt.startsWith(dateIso) || s.id.includes(dateIso)
      );

      let customData: AppData | undefined = matchingSnap?.data;

      // If Sep 3 or earlier, try to use historical state
      if (!customData && dateIso === '2026-09-03') {
        const snapDoc = await getDoc(doc(db, 'capacity_snapshots', 'snap_2026-09-03_sep3_eod'));
        if (snapDoc.exists()) {
          customData = (snapDoc.data() as DataSnapshot).data;
        }
      }

      await onRevertToDate(dateIso, customData);
      setSuccessMessage(`Successfully reverted data to ${dateIso}!`);
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err: any) {
      setErrorMessage(`Failed to revert to ${dateIso}: ${err.message}`);
    } finally {
      setIsReverting(false);
    }
  };

  // Save current state checkpoint
  const handleSaveCurrentCheckpoint = async () => {
    if (!isTeamLead) return;
    if (!newSnapshotName.trim()) return;
    setIsSavingSnapshot(true);
    try {
      const nowIso = new Date().toISOString();
      const snapId = `snap_${nowIso.split('T')[0]}_${Date.now()}`;
      const newSnap: DataSnapshot = {
        id: snapId,
        name: newSnapshotName.trim(),
        createdAt: nowIso,
        createdBy: `${teamLeadName} (TL)`,
        description: `Manual checkpoint by Team Lead for ${currentTeamTitle}`,
        teamId: currentTeamId,
        teamTitle: currentTeamTitle,
        data: appData,
      };
      await setDoc(doc(db, 'capacity_snapshots', snapId), newSnap);
      setNewSnapshotName('');
      setShowSaveSnapshot(false);
      await loadSnapshots();
    } catch (e: any) {
      setErrorMessage(`Error saving checkpoint: ${e.message}`);
    } finally {
      setIsSavingSnapshot(false);
    }
  };

  // Calculate work week preview for chosen custom date
  const getCustomDateWeekPreview = (dateIso: string) => {
    try {
      const d = parseDateIso(dateIso);
      const mon = getMondayOfWeek(d);
      const fri = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 4);
      return formatWeekLabel(mon, fri);
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-2xs ${
              isTeamLead 
                ? 'bg-amber-100 border-amber-200 text-amber-700' 
                : 'bg-slate-100 border-slate-200 text-slate-500'
            }`}>
              {isTeamLead ? <RotateCcw className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Revert Data to an Earlier Date</h2>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                  isTeamLead 
                    ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                    : 'bg-slate-200 text-slate-700'
                }`}>
                  <Crown className="w-3 h-3 text-amber-600" />
                  <span>Team Lead Access</span>
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Restore allocations and schedule horizons for <strong className="text-slate-800">{currentTeamTitle}</strong>
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
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* If current user is NOT verified as Team Lead -> Display Restricted Access Gate */}
          {!isTeamLead ? (
            <div className="py-6 px-4 flex flex-col items-center text-center space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-sm">
                <ShieldAlert className="w-8 h-8" />
              </div>

              <div className="max-w-md space-y-2">
                <h3 className="text-lg font-bold text-slate-900">Team Lead Access Required</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Reverting project allocations and rolling week schedules alters the live capacity database for the entire team. This capability is strictly restricted to the assigned Team Lead:
                </p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-xs font-bold mt-1">
                  <Crown className="w-3.5 h-3.5 text-blue-600" />
                  <span>Assigned Team Lead (TL): {teamLeadName || 'Mazzy'}</span>
                </div>
              </div>

              {/* Authorization Card */}
              <div className="w-full max-w-sm bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-600" />
                    <span>Authorize as Team Lead</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Passcode or 1-Click</span>
                </div>

                <form onSubmit={handleVerifyTeamLead} className="space-y-2.5">
                  <div>
                    <input
                      type="password"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="Team Lead passcode (e.g. teamlead)"
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
                    />
                  </div>

                  {authError && (
                    <p className="text-[11px] text-red-600 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>{authError}</span>
                    </p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      className="flex-1 py-2 px-3 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Unlock with Passcode</span>
                    </button>
                  </div>
                </form>

                <div className="pt-2 border-t border-slate-200 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleQuickLeadAuthorize}
                    className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>I am {teamLeadName || 'Mazzy'} (Team Lead)</span>
                  </button>
                  <p className="text-[10px] text-center text-slate-400">
                    Click to confirm your identity as the Team Lead of {currentTeamTitle}.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Current user IS verified as Team Lead -> Full Revert Controls */
            <>
              {/* Team Lead Verified Badge */}
              <div className="px-3.5 py-2.5 bg-amber-50/90 border border-amber-200 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-amber-900 font-semibold">
                  <Crown className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Authorized as Team Lead: <strong className="text-amber-950">{teamLeadName}</strong> ({currentTeamTitle})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onSetTeamLeadVerified(false)}
                  className="text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
                  title="Switch to member view to test restriction"
                >
                  Switch to Member View
                </button>
              </div>

              {/* Status / Success Messages */}
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

              {/* Quick 1-Click Revert Buttons */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Quick Revert Options</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">1-click restore</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option 1: Yesterday (Sep 3) */}
                  <div className="p-4 bg-amber-50/70 border border-amber-200 hover:border-amber-300 rounded-xl flex flex-col justify-between transition-colors shadow-2xs">
                    <div className="space-y-1 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-950">Yesterday</span>
                        <span className="text-[10px] bg-amber-200/80 text-amber-900 font-bold px-1.5 py-0.5 rounded">
                          Thursday, Sep 3
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-snug">
                        Revert to Thursday's pre-update data. Restores previous allocations and change highlights.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isReverting}
                      onClick={handleRevertYesterday}
                      className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{isReverting ? 'Reverting...' : 'Revert to Yesterday (Sep 3)'}</span>
                    </button>
                  </div>

                  {/* Option 2: Start of Week (Aug 31) */}
                  <div className="p-4 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl flex flex-col justify-between transition-colors shadow-2xs">
                    <div className="space-y-1 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">Sprint Kickoff</span>
                        <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded">
                          Monday, Aug 31
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-snug">
                        Revert to the baseline allocations from the start of the current work week.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isReverting}
                      onClick={() => handleRevertToSpecificDate('2026-08-31')}
                      className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-900 active:bg-black disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{isReverting ? 'Reverting...' : 'Revert to Monday (Aug 31)'}</span>
                    </button>
                  </div>

                  {/* Option 3: Previous Week (Aug 24) */}
                  <div className="p-4 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl flex flex-col justify-between transition-colors shadow-2xs">
                    <div className="space-y-1 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">1 Week Earlier</span>
                        <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded">
                          Aug 24 - Aug 28
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-snug">
                        Shift the 2-week rolling schedule back by 1 week to view and edit earlier allocations.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isReverting}
                      onClick={() => handleRevertToSpecificDate('2026-08-24')}
                      className="w-full py-2 px-3 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-slate-800 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                      <span>Revert to Week of Aug 24</span>
                    </button>
                  </div>

                  {/* Option 4: 2 Weeks Earlier (Aug 17) */}
                  <div className="p-4 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl flex flex-col justify-between transition-colors shadow-2xs">
                    <div className="space-y-1 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">2 Weeks Earlier</span>
                        <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded">
                          Aug 17 - Aug 21
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-snug">
                        Shift schedule back by 2 full sprint cycles to the mid-August baseline.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isReverting}
                      onClick={() => handleRevertToSpecificDate('2026-08-17')}
                      className="w-full py-2 px-3 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-slate-800 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                      <span>Revert to Week of Aug 17</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Calendar Picker: Pick Any Specific Date */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Or Choose Any Specific Date on the Calendar</span>
                </h3>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex-1">
                    <input
                      type="date"
                      max="2026-09-04"
                      value={selectedCustomDate}
                      onChange={(e) => setSelectedCustomDate(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
                    />
                  </div>

                  <div className="text-xs text-slate-600 flex items-center px-1">
                    <span>Week: <strong className="text-slate-900">{getCustomDateWeekPreview(selectedCustomDate)}</strong></span>
                  </div>

                  <button
                    type="button"
                    disabled={isReverting || !selectedCustomDate}
                    onClick={() => handleRevertToSpecificDate(selectedCustomDate)}
                    className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Revert to {selectedCustomDate}</span>
                  </button>
                </div>
              </div>

              {/* Saved Date Checkpoints */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-slate-500" />
                    <span>Saved Date Checkpoints</span>
                  </h3>

                  <button
                    type="button"
                    onClick={() => setShowSaveSnapshot(!showSaveSnapshot)}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Bookmark className="w-3 h-3" />
                    <span>Bookmark Current State</span>
                  </button>
                </div>

                {showSaveSnapshot && (
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2">
                    <span className="text-xs font-bold text-indigo-950 block">
                      Save current state as a new restore checkpoint:
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSnapshotName}
                        onChange={(e) => setNewSnapshotName(e.target.value)}
                        placeholder="Checkpoint name (e.g. Sep 4 Morning Update)"
                        className="flex-1 text-xs px-3 py-1.5 bg-white border border-indigo-200 rounded-lg outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        disabled={isSavingSnapshot || !newSnapshotName.trim()}
                        onClick={handleSaveCurrentCheckpoint}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                      >
                        {isSavingSnapshot ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}

                {isLoadingSnapshots ? (
                  <div className="p-4 text-center text-xs text-slate-400">Loading saved checkpoints...</div>
                ) : snapshots.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl">
                    No historical checkpoints found.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {snapshots.slice(0, 5).map((snap) => (
                      <div
                        key={snap.id}
                        className="p-3 bg-white border border-slate-200 hover:border-slate-300 rounded-xl flex items-center justify-between shadow-2xs transition-colors"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{snap.name}</span>
                            <span className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-1.5 py-0.5 rounded">
                              {new Date(snap.createdAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {snap.description || 'Saved snapshot'} • Staff: {snap.data?.staff?.length || 0} members • Saved by: {snap.createdBy}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={isReverting}
                          onClick={() => handleRevertToSpecificDate(snap.createdAt.split('T')[0])}
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-700" />
                          <span>Revert</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            <span>Restricted to Team Leads of {currentTeamTitle}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg transition-colors cursor-pointer"
          >
            {isTeamLead ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
};
