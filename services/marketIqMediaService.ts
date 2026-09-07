import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '../firebase';
import { MarketIQMediaCategory, MarketIQMediaItem } from './marketIqEvaluationService';

const clean = (value: string) => String(value || '').trim().replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
const cleanPlate = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const id = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const withTimeout = async <T,>(promise: Promise<T>, ms = 60000): Promise<T> => {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('O envio demorou demais. Tente novamente ou verifique sua conexão.')), ms);
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

const loadImage = (file: File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Não consegui preparar esta imagem para envio.'));
  };
  image.src = url;
});

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não consegui compactar esta imagem.')), type, quality);
});

const compressImage = async (file: File): Promise<File> => {
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;

  try {
    const image = await loadImage(file);
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(image, 0, 0, width, height);

    let blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
    if (blob.size > 1.5 * 1024 * 1024) blob = await canvasToBlob(canvas, 'image/jpeg', 0.7);
    if (blob.size >= file.size && file.size <= 2 * 1024 * 1024) return file;

    const baseName = (file.name || 'foto').replace(/\.[^.]+$/, '') || 'foto';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
};

export const marketIqMediaService = {
  upload: async (args: { companyId: string; storeId: string; plate: string; category: MarketIQMediaCategory; file: File }): Promise<MarketIQMediaItem> => {
    const { companyId, storeId, category, file } = args;
    const plate = cleanPlate(args.plate);
    if (!auth.currentUser) throw new Error('Sua sessão expirou. Entre novamente no Motyq e tente enviar a foto.');
    if (!companyId || !storeId || !plate) throw new Error('Escopo ou placa inválidos.');
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') throw new Error('Use imagem ou PDF.');
    if (file.type === 'application/pdf' && file.size > 8 * 1024 * 1024) throw new Error('PDF acima de 8 MB.');
    if (file.type.startsWith('image/') && file.size > 20 * 1024 * 1024) throw new Error('Foto acima de 20 MB.');

    const preparedFile = await compressImage(file);
    if (preparedFile.size > 8 * 1024 * 1024) throw new Error('A foto ainda ficou acima de 8 MB após a otimização. Tente outra imagem.');

    const mediaId = id();
    const path = `marketiq/${clean(companyId)}/${clean(storeId)}/${plate}/${mediaId}-${clean(preparedFile.name || 'arquivo')}`;
    const storageRef = ref(storage, path);

    try {
      await withTimeout(uploadBytes(storageRef, preparedFile, { contentType: preparedFile.type || undefined }));
      const url = await withTimeout(getDownloadURL(storageRef), 15000);
      return {
        id: mediaId,
        category,
        url,
        path,
        name: preparedFile.name || file.name || 'arquivo',
        contentType: preparedFile.type || file.type,
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
