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
import { formatDateIso } from './dateUtils';
import { isCorruptedFactoryData } from './helpers';

export const SNAPSHOTS_COLLECTION = 'capacity_snapshots';

// In-memory cache to avoid redundant Firestore getDoc calls on every real-time emission within the same day
const verifiedDailySnapshotsCache = new Set<string>();

export async function createTeamSnapshot(
  teamId: string,
  teamTitle: string,
  data: AppData,
  name?: string,
  description?: string,
  isAuto: boolean = false,
  customId?: string
): Promise<DataSnapshot> {
  const now = new Date();
  const dateIso = formatDateIso(now);
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  
  const id = customId || (isAuto 
    ? `auto_${teamId}_${dateIso}`
    : `snap_${teamId}_${Date.now()}`);

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
  // Never poison daily backups with obsolete generic factory data
  if (isCorruptedFactoryData(data, teamId)) return;
  
  try {
    const now = new Date();
    const todayIso = formatDateIso(now);
    const utcIso = now.toISOString().split('T')[0];
    const cacheKey = `${teamId}_${todayIso}_${utcIso}`;

    if (verifiedDailySnapshotsCache.has(cacheKey)) {
      return;
    }

    const autoDocId = `auto_${teamId}_${todayIso}`;
    const snapRef = doc(db, SNAPSHOTS_COLLECTION, autoDocId);
    const existing = await getDoc(snapRef);
    
    // If today's auto-snapshot doesn't exist, or was poisoned by factory data, create/heal it!
    if (!existing.exists() || isCorruptedFactoryData((existing.data() as DataSnapshot)?.data, teamId)) {
      await createTeamSnapshot(teamId, teamTitle, data, undefined, undefined, true, autoDocId);
    }

    // Also check if a UTC-dated snapshot for today/tomorrow was poisoned by factory data and heal it
    if (utcIso !== todayIso) {
      const utcDocId = `auto_${teamId}_${utcIso}`;
      const utcSnapRef = doc(db, SNAPSHOTS_COLLECTION, utcDocId);
      const utcExisting = await getDoc(utcSnapRef);
      if (utcExisting.exists() && isCorruptedFactoryData((utcExisting.data() as DataSnapshot)?.data, teamId)) {
        const existingSnap = utcExisting.data() as DataSnapshot;
        await createTeamSnapshot(
          teamId,
          teamTitle,
          data,
          existingSnap.name,
          existingSnap.description,
          true,
          utcDocId
        );
      }
    }

    verifiedDailySnapshotsCache.add(cacheKey);
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
        // Exclude any corrupted factory snapshots from the restore list
        if (isCorruptedFactoryData(item.data, teamId)) {
          return;
        }
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
