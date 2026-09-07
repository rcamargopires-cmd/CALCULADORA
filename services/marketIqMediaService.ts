import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '../firebase';
import { MarketIQMediaCategory, MarketIQMediaItem } from './marketIqEvaluationService';

const clean = (value: string) => String(value || '').trim().replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
const cleanPlate = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const id = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const withTimeout = async <T,>(promise: Promise<T>, ms = 25000): Promise<T> => {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('O envio demorou demais. Tente novamente com uma foto menor ou verifique sua conexão.')), ms);
      }),
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
};

const readableStorageError = (error: any) => {
  const code = String(error?.code || '');
  if (code.includes('unauthorized')) return 'O Firebase bloqueou o envio desta foto. A permissão do Storage precisa ser liberada para usuários autenticados.';
  if (code.includes('unauthenticated')) return 'Sua sessão expirou. Entre novamente no Motyq e tente enviar a foto.';
  if (code.includes('quota-exceeded')) return 'O limite de armazenamento foi atingido.';
  if (code.includes('retry-limit-exceeded')) return 'O envio não concluiu. Tente novamente em uma conexão mais estável.';
  if (code.includes('invalid-url') || code.includes('invalid-argument')) return 'A configuração do armazenamento estava inválida. Atualize a página e tente novamente.';
  return String(error?.message || 'Não foi possível enviar o arquivo.');
};

export const marketIqMediaService = {
  upload: async (args: { companyId: string; storeId: string; plate: string; category: MarketIQMediaCategory; file: File }): Promise<MarketIQMediaItem> => {
    const { companyId, storeId, category, file } = args;
    const plate = cleanPlate(args.plate);
    if (!auth.currentUser) throw new Error('Sua sessão expirou. Entre novamente no Motyq e tente enviar a foto.');
    if (!companyId || !storeId || !plate) throw new Error('Escopo ou placa inválidos.');
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') throw new Error('Use imagem ou PDF.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Arquivo acima de 8 MB.');

    const mediaId = id();
    const path = `marketiq/${clean(companyId)}/${clean(storeId)}/${plate}/${mediaId}-${clean(file.name || 'arquivo')}`;
    const storageRef = ref(storage, path);

    try {
      await withTimeout(uploadBytes(storageRef, file, { contentType: file.type || undefined }));
      const url = await withTimeout(getDownloadURL(storageRef), 10000);
      return {
        id: mediaId,
        category,
        url,
        path,
        name: file.name || 'arquivo',
        contentType: file.type,
        createdAt: new Date().toISOString(),
      };
    } catch (error: any) {
      throw new Error(readableStorageError(error));
    }
  },

  remove: async (item: MarketIQMediaItem): Promise<void> => {
    if (!item?.path) return;
    await deleteObject(ref(storage, item.path));
  },
};
