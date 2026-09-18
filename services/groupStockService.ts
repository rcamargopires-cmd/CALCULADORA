import { collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { actionTaskService } from './actionTaskService';
import { matchGroupStock } from './crmStockMatchService';

export interface GroupStockItem {
  plate: string;
  model: string;
  stockOwner: string;
  location: string;
  days: number;
  cost: number;
  suggestedPrice: number;
  km: number;
  year: string;
  color: string;
  fuel: string;
  transmission: string;
  brand: string;
  status: string;
  transit: string;
  notices: string[];
  purchaseCompany?: string;
}

export interface GroupStockSnapshot {
  companyId: string;
  items: GroupStockItem[];
  sourceFile: string;
  sourceUpdatedAt?: string;
  importedAt: string;
  importedBy: string;
}

const safeId = (value: string) => String(value || 'empresa').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 120);
const documentId = (companyId: string) => `group_stock_${safeId(companyId)}`;
const refFor = (companyId: string) => doc(db, 'config', documentId(companyId));
const cleanPlate = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const createCrmMatchAlerts = async (companyId: string, added: GroupStockItem[], importedBy: string) => {
  if (!added.length) return 0;
  const snap = await getDocs(query(collection(db, 'showroom_passages'), where('companyId', '==', companyId)));
  const leads = snap.docs
    .map(item => ({ id: item.id, ...item.data() } as any))
    .filter(item => !['sale', 'no_deal'].includes(String(item.status || '')))
    .filter(item => String(item.desiredVehicle || item.interestModel || '').trim())
    .filter(item => String(item.assignedSellerEmail || '').trim());

  let created = 0;
  for (const lead of leads) {
    const matches = matchGroupStock(added, String(lead.desiredVehicle || lead.interestModel || ''), 2)
      .filter(match => match.kind === 'exact');
    for (const match of matches) {
      const vehicle = match.item;
      const location = vehicle.location || vehicle.stockOwner || 'local não informado';
      const price = vehicle.suggestedPrice
        ? Number(vehicle.suggestedPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : 'preço não informado';
      await actionTaskService.create({
        companyId,
        storeId: String(lead.storeId || ''),
        storeName: String(lead.storeName || lead.storeId || 'Unidade'),
        sourceActionId: `crm_stock_match_${lead.id}_${vehicle.plate}`,
        sourceDate: localDate(),
        scope: 'CRM · Estoque',
        tone: 'info',
        title: `Entrou ${vehicle.model} para ${lead.customerName || 'seu cliente'}`,
        evidence: `${vehicle.model} · ${vehicle.year || 'ano n/i'} · ${vehicle.km ? Number(vehicle.km).toLocaleString('pt-BR') + ' km · ' : ''}${vehicle.plate} · ${location} · ${price}`,
        recommendedAction: `O cliente procura "${lead.desiredVehicle || lead.interestModel}". Confira o veículo que acabou de entrar no estoque compartilhado e faça contato com o cliente.`,
        metric: vehicle.plate,
        assignedToEmail: String(lead.assignedSellerEmail || '').trim().toLowerCase(),
        assignedToName: String(lead.assignedSellerName || lead.assignedSellerEmail || ''),
        dueDate: localDate(),
        createdByEmail: importedBy || 'motyq@system',
        createdByName: 'MOTYQ · Alerta de estoque',
      });
      created += 1;
    }
  }
  return created;
};

const normalizeItems = (items: GroupStockItem[]) => Array.from(new Map(
  items
    .map(item => ({
      ...item,
      plate: cleanPlate(item.plate),
      model: String(item.model || '').trim(),
      stockOwner: String(item.stockOwner || '').trim(),
      location: String(item.location || '').trim(),
      days: Number(item.days) || 0,
      cost: Number(item.cost) || 0,
      suggestedPrice: Number(item.suggestedPrice) || 0,
      km: Number(item.km) || 0,
      year: String(item.year || '').trim(),
      color: String(item.color || '').trim(),
      fuel: String(item.fuel || '').trim(),
      transmission: String(item.transmission || '').trim(),
      brand: String(item.brand || '').trim(),
      status: String(item.status || '').trim(),
      transit: String(item.transit || '').trim(),
      notices: (Array.isArray(item.notices) ? item.notices : []).map(value => String(value || '').trim()).filter(Boolean).slice(0, 3),
      ...(item.purchaseCompany ? { purchaseCompany: String(item.purchaseCompany).trim() } : {}),
    }))
    .filter(item => /^[A-Z0-9]{7}$/.test(item.plate))
    .map(item => [item.plate, item]),
).values());

export const groupStockService = {
  save: async (snapshot: GroupStockSnapshot) => {
    const items = normalizeItems(snapshot.items);
    if (!items.length) throw new Error('Nenhum veículo válido foi reconhecido no estoque compartilhado.');

    const current = await getDoc(refFor(snapshot.companyId));
    const previous = current.exists()
      ? normalizeItems(Array.isArray(current.data().items) ? current.data().items as GroupStockItem[] : [])
      : [];
    const previousPlates = new Set(previous.map(item => item.plate));
    const added = items.filter(item => !previousPlates.has(item.plate));

    await setDoc(refFor(snapshot.companyId), {
      companyId: snapshot.companyId,
      items,
      sourceFile: snapshot.sourceFile,
      sourceUpdatedAt: snapshot.sourceUpdatedAt || '',
      importedAt: snapshot.importedAt,
      importedBy: snapshot.importedBy,
      rows: items.length,
      addedRows: added.length,
      updatedAt: serverTimestamp(),
    }, { merge: false });

    const crmAlerts = await createCrmMatchAlerts(snapshot.companyId, added, snapshot.importedBy).catch(error => {
      console.warn('MOTYQ: não foi possível criar alertas de estoque para o CRM.', error);
      return 0;
    });

    window.dispatchEvent(new CustomEvent('motyq:group-stock-updated', {
      detail: { companyId: snapshot.companyId, added: added.length, crmAlerts },
    }));

    return items.length;
  },

  subscribe: (companyId: string, onData: (snapshot: GroupStockSnapshot | null) => void, onError?: (error: unknown) => void) =>
    onSnapshot(refFor(companyId), snap => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data();
      onData({
        companyId: String(data.companyId || companyId),
        items: normalizeItems(Array.isArray(data.items) ? data.items as GroupStockItem[] : []),
        sourceFile: String(data.sourceFile || ''),
        sourceUpdatedAt: String(data.sourceUpdatedAt || ''),
        importedAt: String(data.importedAt || ''),
        importedBy: String(data.importedBy || ''),
      });
    }, onError),
};
