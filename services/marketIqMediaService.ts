import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase';
import { MarketIQMediaCategory, MarketIQMediaItem } from './marketIqEvaluationService';

const clean = (value: string) => String(value || '').trim().replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
const cleanPlate = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const id = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export const marketIqMediaService = {
  upload: async (args: { companyId: string; storeId: string; plate: string; category: MarketIQMediaCategory; file: File }): Promise<MarketIQMediaItem> => {
    const { companyId, storeId, category, file } = args;
    const plate = cleanPlate(args.plate);
    if (!companyId || !storeId || !plate) throw new Error('Escopo ou placa inválidos.');
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') throw new Error('Use imagem ou PDF.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Arquivo acima de 8 MB.');
    const mediaId = id();
    const path = `marketiq/${clean(companyId)}/${clean(storeId)}/${plate}/${mediaId}-${clean(file.name || 'arquivo')}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, { contentType: file.type || undefined });
    const url = await getDownloadURL(storageRef);
    return { id: mediaId, category, url, path, name: file.name || 'arquivo', contentType: file.type, createdAt: new Date().toISOString() };
  },

  remove: async (item: MarketIQMediaItem): Promise<void> => {
    if (!item?.path) return;
    await deleteObject(ref(storage, item.path));
  },
};
