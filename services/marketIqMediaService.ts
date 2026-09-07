import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { MarketIQMediaCategory, MarketIQMediaItem } from './marketIqEvaluationService';

const cleanPlate = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const id = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const loadImage = (file: File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Formato de imagem não suportado. Tente JPG ou PNG.')); };
  image.src = url;
});

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não consegui compactar esta foto.')), 'image/jpeg', quality);
});

const fileToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Não consegui preparar o arquivo.'));
  reader.readAsDataURL(blob);
});

const renderImage = async (image: HTMLImageElement, maxDimension: number, quality: number) => {
  const sourceW = image.naturalWidth || image.width;
  const sourceH = image.naturalHeight || image.height;
  const scale = Math.min(1, maxDimension / Math.max(sourceW, sourceH));
  const width = Math.max(1, Math.round(sourceW * scale));
  const height = Math.max(1, Math.round(sourceH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não consegui preparar esta foto.');
  ctx.drawImage(image, 0, 0, width, height);
  return canvasToBlob(canvas, quality);
};

const compressToTarget = async (image: HTMLImageElement, startDimension: number, targetBytes: number) => {
  let dimension = startDimension;
  let quality = 0.78;
  let blob = await renderImage(image, dimension, quality);
  for (let i = 0; blob.size > targetBytes && i < 8; i += 1) {
    if (quality > 0.56) quality -= 0.08;
    else dimension = Math.max(520, Math.round(dimension * 0.82));
    blob = await renderImage(image, dimension, quality);
  }
  if (blob.size > targetBytes * 1.2) throw new Error('Não consegui reduzir esta foto o suficiente. Tente outra imagem.');
  return blob;
};

const readableFirestoreError = (error: any) => {
  const code = String(error?.code || '');
  if (code.includes('permission-denied')) return 'O Motyq não recebeu permissão para salvar esta foto. Entre novamente e tente de novo.';
  if (code.includes('unauthenticated')) return 'Sua sessão expirou. Entre novamente no Motyq.';
  if (code.includes('resource-exhausted')) return 'A foto ficou grande demais para o registro. Tente outra imagem.';
  return String(error?.message || 'Não foi possível salvar a foto.');
};

export const marketIqMediaService = {
  upload: async (args: { companyId: string; storeId: string; plate: string; category: MarketIQMediaCategory; file: File }): Promise<MarketIQMediaItem> => {
    const { companyId, storeId, category, file } = args;
    const plate = cleanPlate(args.plate);
    if (!auth.currentUser) throw new Error('Sua sessão expirou. Entre novamente no Motyq e tente enviar a foto.');
    if (!companyId || !storeId || !plate) throw new Error('Escopo ou placa inválidos.');
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') throw new Error('Use imagem JPG/PNG ou PDF.');

    const mediaId = `marketiq_media_${companyId}_${storeId}_${plate}_${id()}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 190);
    const createdAt = new Date().toISOString();

    try {
      let fullDataUrl = '';
      let previewUrl = '';
      let contentType = file.type;
      let name = file.name || 'arquivo';

      if (file.type.startsWith('image/')) {
        if (file.size > 25 * 1024 * 1024) throw new Error('Foto acima de 25 MB.');
        const image = await loadImage(file);
        const fullBlob = await compressToTarget(image, 1280, 360 * 1024);
        const previewBlob = await compressToTarget(image, 420, 48 * 1024);
        fullDataUrl = await fileToDataUrl(fullBlob);
        previewUrl = await fileToDataUrl(previewBlob);
        contentType = 'image/jpeg';
        name = `${(file.name || 'foto').replace(/\.[^.]+$/, '')}.jpg`;
      } else {
        if (file.size > 320 * 1024) throw new Error('Para documentos, use PDF de até 320 KB.');
        fullDataUrl = await fileToDataUrl(file);
        previewUrl = fullDataUrl;
      }

      await setDoc(doc(db, 'operational_meta', mediaId), {
        id: mediaId,
        kind: 'marketiq_media',
        companyId,
        storeId,
        plate,
        category,
        name,
        contentType,
        dataUrl: fullDataUrl,
        createdByUid: auth.currentUser.uid,
        createdByEmail: auth.currentUser.email || '',
        createdAt: serverTimestamp(),
      });

      return {
        id: mediaId,
        category,
        url: previewUrl,
        path: `firestore:${mediaId}`,
        name,
        contentType,
        createdAt,
      };
    } catch (error: any) {
      throw new Error(readableFirestoreError(error));
    }
  },

  remove: async (item: MarketIQMediaItem): Promise<void> => {
    if (!item?.path?.startsWith('firestore:')) return;
    const mediaId = item.path.slice('firestore:'.length);
    if (!mediaId) return;
    await deleteDoc(doc(db, 'operational_meta', mediaId));
  },
};
