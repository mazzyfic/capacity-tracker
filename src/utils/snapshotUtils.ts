import { db } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';
import { AppData, DataSnapshot } from '../types';

export const SNAPSHOTS_COLLECTION = 'capacity_snapshots';

export async function createTeamSnapshot(
  teamId: string,
  teamTitle: string,
  data: AppData,
  name?: string,
  description?: string,
  isAuto: boolean = false
): Promise<DataSnapshot> {
  const now = new Date();
  const dateIso = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  
  const id = isAuto 
    ? `auto_${teamId}_${dateIso}`
    : `snap_${teamId}_${Date.now()}`;

  const snapshotName = name || (isAuto 
    ? `Daily Snapshot: ${dateStr}`
    : `Manual Snapshot: ${dateStr} (${timeStr})`);

  const snapshotDesc = description || (isAuto
    ? `Automated daily insurance snapshot of ${teamTitle} (${data.staff?.length || 0} staff members).`
    : `User-created restore point for ${teamTitle}.`);

  const snapshot: DataSnapshot = {
    id,
    name: snapshotName,
    createdAt: now.toISOString(),
    createdBy: isAuto ? 'Automatic Daily Backup' : (data.teamLeadId ? 'Team Lead' : 'User'),
    description: snapshotDesc,
    teamId,
    teamTitle,
    data: JSON.parse(JSON.stringify(data)),
  };

  await setDoc(doc(db, SNAPSHOTS_COLLECTION, id), snapshot);
  return snapshot;
}

export async function checkAndCreateDailyAutoSnapshot(
  teamId: string,
  teamTitle: string,
  data: AppData
): Promise<void> {
  if (!data || !data.staff || data.staff.length === 0) return;
  
  try {
    const todayIso = new Date().toISOString().split('T')[0];
    const autoDocId = `auto_${teamId}_${todayIso}`;
    const snapRef = doc(db, SNAPSHOTS_COLLECTION, autoDocId);
    const existing = await getDoc(snapRef);
    
    // If today's auto-snapshot doesn't exist, create it as the baseline!
    if (!existing.exists()) {
      await createTeamSnapshot(teamId, teamTitle, data, undefined, undefined, true);
    }
  } catch (err) {
    console.warn('Failed to perform daily auto-snapshot check:', err);
  }
}

export async function fetchTeamSnapshots(teamId: string): Promise<DataSnapshot[]> {
  try {
    const snapCollection = collection(db, SNAPSHOTS_COLLECTION);
    const querySnap = await getDocs(snapCollection);
    const list: DataSnapshot[] = [];
    
    querySnap.forEach((docSnap) => {
      const item = docSnap.data() as DataSnapshot;
      // Match current team or legacy default team
      if (item.teamId === teamId || (!item.teamId && teamId === 'team_mazzy')) {
        list.push({
          ...item,
          id: docSnap.id,
        });
      }
    });

    // Sort newest first
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch (err) {
    console.error('Failed to fetch team snapshots:', err);
    return [];
  }
}

export async function deleteTeamSnapshot(snapshotId: string): Promise<void> {
  await deleteDoc(doc(db, SNAPSHOTS_COLLECTION, snapshotId));
}
