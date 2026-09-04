import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  Key,
  Upload,
  Download,
  RotateCcw,
  FileText,
  Check,
  AlertTriangle,
  X,
  Clock,
  Save,
  Copy,
  LogOut,
  LogIn,
  History,
  RefreshCw,
  FileCode,
} from 'lucide-react';
import { AppData, DataSnapshot } from '../types';
import { db } from '../firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';

interface AdminPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTeamId: string;
  currentTeamTitle: string;
  appData: AppData;
  onRevertTeamData: (teamId: string, newData: AppData) => Promise<void>;
  onRevertAllTeams?: (teamsData: Record<string, AppData>) => Promise<void>;
  adminUser: { email: string; name: string } | null;
  onAdminLogin: (email: string) => void;
  onAdminLogout: () => void;
}

export const AdminPortalModal: React.FC<AdminPortalModalProps> = ({
  isOpen,
  onClose,
  currentTeamId,
  currentTeamTitle,
  appData,
  onRevertTeamData,
  onRevertAllTeams,
  adminUser,
  onAdminLogin,
  onAdminLogout,
}) => {
  // Login form state
  const [loginEmail, setLoginEmail] = useState('mazlan.hasan@emeritus.org');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  // Active Admin Tab
  const [activeTab, setActiveTab] = useState<'upload' | 'snapshots' | 'raw_editor' | 'export'>('upload');

  // Upload/Paste state
  const [pastedJson, setPastedJson] = useState('');
  const [jsonParseError, setJsonParseError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<{
    type: 'single_team' | 'multi_team';
    teamCount?: number;
    teamNames?: string[];
    staffCount?: number;
    staffNames?: string[];
    weeksCount?: number;
    allocationsCount?: number;
    data: any;
  } | null>(null);
  const [targetTeamOption, setTargetTeamOption] = useState<string>(currentTeamId);
  const [isApplyingRevert, setIsApplyingRevert] = useState(false);
  const [revertSuccessMsg, setRevertSuccessMsg] = useState<string | null>(null);

  // Snapshots state
  const [snapshots, setSnapshots] = useState<DataSnapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotDesc, setSnapshotDesc] = useState('');
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);

  // Live Raw Editor state
  const [rawEditorJson, setRawEditorJson] = useState('');
  const [rawEditorError, setRawEditorError] = useState<string | null>(null);
  const [isSavingRaw, setIsSavingRaw] = useState(false);
  const [rawCopied, setRawCopied] = useState(false);

  // Populate raw editor whenever appData changes or modal opens
  useEffect(() => {
    if (isOpen && appData) {
      setRawEditorJson(JSON.stringify(appData, null, 2));
      setRawEditorError(null);
    }
  }, [isOpen, appData]);

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
      // Sort newest first
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setSnapshots(list);
    } catch (err) {
      console.error('Failed to load snapshots:', err);
    } finally {
      setIsLoadingSnapshots(false);
    }
  };

  useEffect(() => {
    if (isOpen && adminUser) {
      loadSnapshots();
    }
  }, [isOpen, adminUser]);

  if (!isOpen) return null;

  // Handle Login
  const handlePerformLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);

    const emailTrim = loginEmail.trim().toLowerCase();
    if (!emailTrim) {
      setLoginError('Please enter an admin email address.');
      return;
    }

    // Accept default admin emeritus user or password "emeritus2026" / "admin"
    if (
      emailTrim === 'mazlan.hasan@emeritus.org' ||
      loginPassword === 'emeritus2026' ||
      loginPassword === 'admin' ||
      loginPassword === ''
    ) {
      onAdminLogin(emailTrim);
      setLoginPassword('');
    } else {
      setLoginError('Invalid credentials. You can use the quick login button for Super Admin.');
    }
  };

  // Quick 1-Click login as Super Admin
  const handleQuickSuperAdmin = () => {
    setLoginEmail('mazlan.hasan@emeritus.org');
    onAdminLogin('mazlan.hasan@emeritus.org');
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setPastedJson(content);
        validateAndPreviewJson(content);
      }
    };
    reader.readAsText(file);
  };

  // Validate and preview input JSON
  const validateAndPreviewJson = (text: string) => {
    setJsonParseError(null);
    setParsedPreview(null);
    setRevertSuccessMsg(null);

    if (!text.trim()) return;

    try {
      const parsed = JSON.parse(text);

      // Check if multi-team format
      const hasTeamKeys = Object.keys(parsed).some(
        (k) =>
          k.startsWith('team_') ||
          k === 'theglobal5_state' ||
          k === 'teams_registry' ||
          k === 'theglobal5'
      );

      if (hasTeamKeys) {
        // Multi-team snapshot
        const teamKeys = Object.keys(parsed).filter((k) => k !== 'teams_registry');
        setParsedPreview({
          type: 'multi_team',
          teamCount: teamKeys.length,
          teamNames: teamKeys,
          data: parsed,
        });
      } else if (Array.isArray(parsed.staff) || parsed.allocations) {
        // Single team snapshot
        const staffList = Array.isArray(parsed.staff) ? parsed.staff : [];
        const weeksList = Array.isArray(parsed.weeks) ? parsed.weeks : [];
        const allocKeys = parsed.allocations ? Object.keys(parsed.allocations) : [];

        setParsedPreview({
          type: 'single_team',
          staffCount: staffList.length,
          staffNames: staffList.map((s: any) => s.name || s.id),
          weeksCount: weeksList.length,
          allocationsCount: allocKeys.length,
          data: parsed,
        });
      } else {
        setJsonParseError(
          'JSON is valid but does not match expected Capacity Tracker schema (missing "staff" or "allocations" fields).'
        );
      }
    } catch (err: any) {
      setJsonParseError(`Invalid JSON syntax: ${err.message}`);
    }
  };

  // Execute Revert to uploaded/pasted JSON
  const handleExecuteRevert = async () => {
    if (!parsedPreview) return;

    const confirmMsg =
      parsedPreview.type === 'multi_team'
        ? `Are you sure you want to revert all teams in the database to this older data? This will overwrite the current team state.`
        : `Are you sure you want to revert ${currentTeamTitle} to this older data? This will overwrite current allocations and staff members.`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    setIsApplyingRevert(true);
    setRevertSuccessMsg(null);

    try {
      if (parsedPreview.type === 'multi_team') {
        if (onRevertAllTeams) {
          await onRevertAllTeams(parsedPreview.data);
        } else {
          // Fallback: extract active team from multi-team data
          const teamData =
            parsedPreview.data[currentTeamId] ||
            parsedPreview.data['theglobal5_state'] ||
            parsedPreview.data['team_mazzy'];
          if (teamData) {
            await onRevertTeamData(currentTeamId, teamData);
          }
        }
        setRevertSuccessMsg('Successfully reverted all team databases to the uploaded data!');
      } else {
        // Single team revert
        const normalizedData: AppData = {
          teamTitle: parsedPreview.data.teamTitle || currentTeamTitle,
          teamLeadId: parsedPreview.data.teamLeadId || parsedPreview.data.staff?.[0]?.id || 'staff_1',
          staff: parsedPreview.data.staff || [],
          weeks: parsedPreview.data.weeks || [],
          allocations: parsedPreview.data.allocations || {},
          notes: parsedPreview.data.notes || {},
        };
        await onRevertTeamData(targetTeamOption, normalizedData);
        setRevertSuccessMsg(
          `Successfully reverted data for ${currentTeamTitle}! Cloud database has been updated.`
        );
      }
    } catch (err: any) {
      alert(`Failed to revert data: ${err.message}`);
    } finally {
      setIsApplyingRevert(false);
    }
  };

  // Create Snapshot
  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapshotName.trim()) return;

    setIsCreatingSnapshot(true);
    try {
      const snapId = `snap_${Date.now()}_${currentTeamId}`;
      const newSnapshot: DataSnapshot = {
        id: snapId,
        name: snapshotName.trim(),
        createdAt: new Date().toISOString(),
        createdBy: adminUser?.email || 'admin',
        description: snapshotDesc.trim() || `Manual snapshot for ${currentTeamTitle}`,
        teamId: currentTeamId,
        teamTitle: currentTeamTitle,
        data: appData,
      };

      await setDoc(doc(db, 'capacity_snapshots', snapId), newSnapshot);
      setSnapshotName('');
      setSnapshotDesc('');
      await loadSnapshots();
    } catch (err: any) {
      alert(`Error creating snapshot: ${err.message}`);
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  // Restore a snapshot
  const handleRestoreSnapshot = async (snap: DataSnapshot) => {
    const confirmMsg = `Revert database for "${snap.teamTitle}" to snapshot "${snap.name}" (created on ${new Date(
      snap.createdAt
    ).toLocaleString()})?`;

    if (!window.confirm(confirmMsg)) return;

    setIsApplyingRevert(true);
    try {
      await onRevertTeamData(snap.teamId || currentTeamId, snap.data);
      alert(`Successfully reverted to snapshot: ${snap.name}!`);
      onClose();
    } catch (err: any) {
      alert(`Failed to restore snapshot: ${err.message}`);
    } finally {
      setIsApplyingRevert(false);
    }
  };

  // Delete a snapshot
  const handleDeleteSnapshot = async (snapId: string) => {
    if (!window.confirm('Delete this historical snapshot?')) return;
    try {
      await deleteDoc(doc(db, 'capacity_snapshots', snapId));
      await loadSnapshots();
    } catch (err: any) {
      alert(`Failed to delete snapshot: ${err.message}`);
    }
  };

  // Save Raw Editor JSON directly to Firestore
  const handleSaveRawJson = async () => {
    setRawEditorError(null);
    try {
      const parsed = JSON.parse(rawEditorJson);
      if (!Array.isArray(parsed.staff) || !parsed.allocations) {
        setRawEditorError('JSON must include "staff" (array) and "allocations" (object) fields.');
        return;
      }

      if (
        !window.confirm(
          `Save raw JSON directly into ${currentTeamTitle}'s database document? This will overwrite existing live data.`
        )
      ) {
        return;
      }

      setIsSavingRaw(true);
      await onRevertTeamData(currentTeamId, parsed as AppData);
      alert('Successfully saved raw data to Firestore!');
      onClose();
    } catch (err: any) {
      setRawEditorError(`Invalid JSON: ${err.message}`);
    } finally {
      setIsSavingRaw(false);
    }
  };

  // Download export JSON
  const handleDownloadActiveTeam = () => {
    const jsonStr = JSON.stringify(appData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentTeamId}_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 shadow-2xs">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Admin Control Portal</h2>
                {adminUser && (
                  <span className="inline-flex items-center gap-1 bg-emerald-100 border border-emerald-300 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    Super Admin
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Manage data backups, restore older states, and revert default allocations
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

        {/* Not Signed In: Admin Login Screen */}
        {!adminUser ? (
          <div className="p-8 max-w-md mx-auto w-full my-auto space-y-6">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-indigo-50 border border-indigo-200 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
                <Key className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Admin Authentication</h3>
              <p className="text-xs text-slate-600">
                To revert team allocations to older backups or upload historical data, sign in with your Super Admin account.
              </p>
            </div>

            {loginError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            {/* Quick 1-Click Super Admin Login Button */}
            <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-4 text-center space-y-2">
              <p className="text-xs text-indigo-950 font-semibold">Authorized Administrator</p>
              <button
                type="button"
                onClick={handleQuickSuperAdmin}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-indigo-200" />
                <span>Sign in as mazlan.hasan@emeritus.org</span>
              </button>
              <p className="text-[11px] text-indigo-600/80">Instant 1-click Super Admin access</p>
            </div>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-200 w-full"></div>
              <span className="bg-white px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                or sign in manually
              </span>
            </div>

            <form onSubmit={handlePerformLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Admin Email
                </label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 shadow-2xs"
                  placeholder="admin@emeritus.org"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Passkey / PIN <span className="text-slate-400 font-normal lowercase">(optional for authorized email)</span>
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 shadow-2xs"
                  placeholder="Enter admin password or press login"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Authenticate Admin</span>
              </button>
            </form>
          </div>
        ) : (
          /* Signed In Admin Interface */
          <div className="flex-1 flex flex-col min-h-0">
            {/* Admin Bar */}
            <div className="px-6 py-2.5 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Active Admin:</span>
                <span className="font-bold text-slate-900">{adminUser.email}</span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-600">
                  Target Team: <strong className="text-indigo-700 font-bold">{currentTeamTitle}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={onAdminLogout}
                className="text-slate-500 hover:text-red-600 flex items-center gap-1 font-semibold transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="px-6 border-b border-slate-200 bg-white flex items-center gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'upload'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <RotateCcw className="w-4 h-4" />
                <span>Revert via JSON Upload / Paste</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('snapshots')}
                className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'snapshots'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <History className="w-4 h-4" />
                <span>Snapshots & History</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('raw_editor')}
                className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'raw_editor'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileCode className="w-4 h-4" />
                <span>Live Raw JSON Editor</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('export')}
                className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'export'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Download className="w-4 h-4" />
                <span>Export & Backups</span>
              </button>
            </div>

            {/* Tab Body */}
            <div className="p-6 flex-1 overflow-y-auto space-y-5">
              {/* TAB 1: REVERT VIA UPLOAD / PASTE */}
              {activeTab === 'upload' && (
                <div className="space-y-5">
                  <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-1">
                    <p className="font-bold flex items-center gap-1.5 text-amber-950">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>Revert Default Data to Older Backups</span>
                    </p>
                    <p className="text-amber-800">
                      If the current database is displaying default or template allocations, upload your older backup file or paste your historical JSON payload below. Applying will immediately overwrite the active Firestore database and refresh the live schedule.
                    </p>
                  </div>

                  {revertSuccessMsg && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{revertSuccessMsg}</span>
                    </div>
                  )}

                  {/* Upload box */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-slate-50 hover:bg-indigo-50/30">
                      <Upload className="w-8 h-8 text-slate-400 mb-2" />
                      <span className="text-xs font-bold text-slate-700">Choose JSON Backup File</span>
                      <span className="text-[11px] text-slate-500 mt-1">Select .json from your computer</span>
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-700 block mb-1">Target Workspace</span>
                        <select
                          value={targetTeamOption}
                          onChange={(e) => setTargetTeamOption(e.target.value)}
                          className="w-full text-xs font-semibold px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                        >
                          <option value="team_mazzy">Team Mazzy (team_mazzy)</option>
                          <option value="team_kimyatta">Team Kimyatta (team_kimyatta)</option>
                          <option value="team_lindsay">Team Lindsay (team_lindsay)</option>
                        </select>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-2">
                        You can revert the currently active team or select another workspace.
                      </p>
                    </div>
                  </div>

                  {/* Paste JSON Area */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Or Paste Historical JSON Payload
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setPastedJson('');
                          setParsedPreview(null);
                          setJsonParseError(null);
                        }}
                        className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                    <textarea
                      value={pastedJson}
                      onChange={(e) => {
                        setPastedJson(e.target.value);
                        validateAndPreviewJson(e.target.value);
                      }}
                      placeholder={`{\n  "staff": [\n    { "id": "staff_1", "name": "Amy" }, ...\n  ],\n  "allocations": { ... }\n}`}
                      rows={8}
                      className="w-full font-mono text-xs p-3 bg-slate-900 text-slate-100 rounded-xl border border-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>

                  {/* Error display */}
                  {jsonParseError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      <span>{jsonParseError}</span>
                    </div>
                  )}

                  {/* Validated preview card */}
                  {parsedPreview && (
                    <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs font-bold text-indigo-950">Valid Older Data Detected</span>
                        </div>
                        <span className="text-[11px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-md">
                          {parsedPreview.type === 'multi_team' ? 'Multi-Team Backup' : 'Single Team State'}
                        </span>
                      </div>

                      {parsedPreview.type === 'single_team' ? (
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="bg-white p-2.5 rounded-lg border border-indigo-100">
                            <span className="text-slate-400 block text-[10px] font-bold uppercase">Staff</span>
                            <span className="font-bold text-slate-800 text-sm">{parsedPreview.staffCount} FFIDs</span>
                            <span className="block text-[11px] text-slate-500 truncate mt-0.5">
                              {parsedPreview.staffNames?.slice(0, 3).join(', ')}
                              {(parsedPreview.staffNames?.length || 0) > 3 ? '...' : ''}
                            </span>
                          </div>

                          <div className="bg-white p-2.5 rounded-lg border border-indigo-100">
                            <span className="text-slate-400 block text-[10px] font-bold uppercase">Weeks</span>
                            <span className="font-bold text-slate-800 text-sm">{parsedPreview.weeksCount} Horizons</span>
                          </div>

                          <div className="bg-white p-2.5 rounded-lg border border-indigo-100">
                            <span className="text-slate-400 block text-[10px] font-bold uppercase">Allocations</span>
                            <span className="font-bold text-slate-800 text-sm">{parsedPreview.allocationsCount} Records</span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-white p-3 rounded-lg border border-indigo-100 text-xs">
                          <span className="font-bold text-slate-800">
                            Detected {parsedPreview.teamCount} Teams: {parsedPreview.teamNames?.join(', ')}
                          </span>
                        </div>
                      )}

                      <div className="pt-2 flex items-center justify-end gap-3">
                        <button
                          type="button"
                          disabled={isApplyingRevert}
                          onClick={handleExecuteRevert}
                          className="px-5 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>
                            {isApplyingRevert
                              ? 'Applying Revert to Database...'
                              : 'Revert & Overwrite Live Database Now'}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: HISTORICAL SNAPSHOTS */}
              {activeTab === 'snapshots' && (
                <div className="space-y-5">
                  {/* Create snapshot form */}
                  <form
                    onSubmit={handleCreateSnapshot}
                    className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3"
                  >
                    <span className="text-xs font-bold text-slate-800 block">Create New Snapshot of Current State</span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Snapshot Name (e.g. Sep 3 End of Day)"
                        value={snapshotName}
                        onChange={(e) => setSnapshotName(e.target.value)}
                        className="text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                        required
                      />
                      <input
                        type="text"
                        placeholder="Description / Notes (optional)"
                        value={snapshotDesc}
                        onChange={(e) => setSnapshotDesc(e.target.value)}
                        className="text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isCreatingSnapshot || !snapshotName.trim()}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{isCreatingSnapshot ? 'Saving Snapshot...' : 'Save Current Snapshot'}</span>
                      </button>
                    </div>
                  </form>

                  {/* List of snapshots */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Available Version Snapshots
                      </h4>
                      <button
                        type="button"
                        onClick={loadSnapshots}
                        className="text-[11px] text-slate-500 hover:text-indigo-600 flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Refresh List</span>
                      </button>
                    </div>

                    {isLoadingSnapshots ? (
                      <div className="p-8 text-center text-xs text-slate-400">Loading snapshots...</div>
                    ) : snapshots.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                        <p className="font-semibold text-slate-700">No custom snapshots saved yet.</p>
                        <p className="text-slate-400">
                          Create a snapshot above to establish restore points before making major modifications.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {snapshots.map((snap) => (
                          <div
                            key={snap.id}
                            className="bg-white border border-slate-200 hover:border-indigo-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs transition-all"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-900">{snap.name}</span>
                                <span className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded">
                                  {snap.teamTitle || snap.teamId}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500">
                                {snap.description || 'Snapshot'} • Created {new Date(snap.createdAt).toLocaleString()} by{' '}
                                {snap.createdBy}
                              </p>
                              <p className="text-[11px] text-slate-400">
                                Staff: {snap.data?.staff?.length || 0} members • Allocations:{' '}
                                {Object.keys(snap.data?.allocations || {}).length} entries
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleRestoreSnapshot(snap)}
                                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Revert to This</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteSnapshot(snap.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                                title="Delete Snapshot"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: LIVE RAW JSON EDITOR */}
              {activeTab === 'raw_editor' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">
                        Direct Database Document: {currentTeamTitle} ({currentTeamId})
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Edit raw JSON values directly. Changes will be saved into Firestore immediately.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(rawEditorJson);
                          setRawCopied(true);
                          setTimeout(() => setRawCopied(false), 2000);
                        }}
                        className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{rawCopied ? 'Copied!' : 'Copy'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          try {
                            const obj = JSON.parse(rawEditorJson);
                            setRawEditorJson(JSON.stringify(obj, null, 2));
                            setRawEditorError(null);
                          } catch (e: any) {
                            setRawEditorError(e.message);
                          }
                        }}
                        className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
                      >
                        <span>Format JSON</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={rawEditorJson}
                    onChange={(e) => {
                      setRawEditorJson(e.target.value);
                      setRawEditorError(null);
                    }}
                    rows={14}
                    className="w-full font-mono text-xs p-3 bg-slate-900 text-slate-100 rounded-xl border border-slate-700 outline-none focus:ring-2 focus:ring-indigo-400 leading-relaxed"
                  />

                  {rawEditorError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      <span>{rawEditorError}</span>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={isSavingRaw}
                      onClick={handleSaveRawJson}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSavingRaw ? 'Saving to Database...' : 'Save & Overwrite Firestore'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 4: EXPORT & BACKUPS */}
              {activeTab === 'export' && (
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
                    <h4 className="text-xs font-bold text-slate-800">Download Data Backups</h4>
                    <p className="text-xs text-slate-600">
                      Save offline copies of your team allocations to guard against future unwanted changes.
                    </p>

                    <div className="pt-2 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleDownloadActiveTeam}
                        className="px-4 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download {currentTeamTitle} Backup (.json)</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
