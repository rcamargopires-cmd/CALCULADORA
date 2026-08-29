import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';

export type ActionTaskStatus = 'open' | 'in_progress' | 'done';

export type ActionTask = {
  id: string;
  kind: 'action_task';
  companyId: string;
  storeId: string;
  storeName: string;
  sourceActionId: string;
  sourceDate: string;
  scope: string;
  tone: 'critical' | 'warning' | 'info';
  title: string;
  evidence: string;
  recommendedAction: string;
  metric?: string;
  metricKey?: 'projection' | 'capture' | 'margin' | 'criticalStock' | 'agedStock' | 'sellerFocus';
  baselineValue?: number;
  targetValue?: number;
  assignedToEmail: string;
  assignedToName: string;
  dueDate: string;
  status: ActionTaskStatus;
  result: string;
  createdByEmail: string;
  createdByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  completedAt?: unknown;
};

export type NewActionTask = Omit<ActionTask, 'id' | 'kind' | 'status' | 'result' | 'createdAt' | 'updatedAt' | 'completedAt'>;

const safeId = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]/g, '-')
  .replace(/-+/g, '-')
  .slice(0, 150);

const taskId = (task: NewActionTask) => safeId(`action_task_${task.companyId}_${task.storeId}_${task.sourceDate}_${task.sourceActionId}_${Date.now()}`);

export const actionTaskService = {
  list: async (companyId: string, storeId: string): Promise<ActionTask[]> => {
    const snap = await getDocs(query(
      collection(db, 'operational_meta'),
      where('companyId', '==', companyId),
      where('storeId', '==', storeId),
    ));
    return snap.docs
      .map(item => ({ id: item.id, ...item.data() } as ActionTask))
      .filter(item => item.kind === 'action_task')
      .sort((a, b) => String(b.sourceDate || '').localeCompare(String(a.sourceDate || '')));
  },

  listAssigned: async (email: string, companyId?: string, storeId?: string): Promise<ActionTask[]> => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedCompany = String(companyId || '').trim();
    const normalizedStore = String(storeId || '').trim();
    if (!normalizedEmail || !normalizedCompany || !normalizedStore) return [];

    const snap = await getDocs(query(
      collection(db, 'operational_meta'),
      where('kind', '==', 'action_task'),
      where('assignedToEmail', '==', normalizedEmail),
      where('companyId', '==', normalizedCompany),
      where('storeId', '==', normalizedStore),
    ));

    return snap.docs
      .map(item => ({ id: item.id, ...item.data() } as ActionTask))
      .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
  },

  create: async (task: NewActionTask): Promise<string> => {
    const id = taskId(task);
    await setDoc(doc(db, 'operational_meta', id), {
      ...task,
      assignedToEmail: String(task.assignedToEmail || '').trim().toLowerCase(),
      id,
      kind: 'action_task',
      status: 'open',
      result: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    window.dispatchEvent(new CustomEvent('motyq:action-task-updated'));
    return id;
  },

  update: async (id: string, patch: Partial<ActionTask>): Promise<void> => {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    await updateDoc(doc(db, 'operational_meta', id), {
      ...clean,
      updatedAt: serverTimestamp(),
      ...(patch.status === 'done' ? { completedAt: serverTimestamp() } : {}),
    });
    window.dispatchEvent(new CustomEvent('motyq:action-task-updated'));
  },

  remove: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, 'operational_meta', id));
    window.dispatchEvent(new CustomEvent('motyq:action-task-updated'));
  },
};
