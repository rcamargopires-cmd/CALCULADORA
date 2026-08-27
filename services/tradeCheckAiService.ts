import { auth } from '../firebase';

export type TradeCheckExtractedData = {
  ownerName: string;
  cpf: string;
  rg: string;
  birthDate: string;
  address: string;
  cep: string;
  city: string;
  phone: string;
  brand: string;
  model: string;
  yearFab: string;
  yearModel: string;
  color: string;
  plate: string;
  chassis: string;
  renavam: string;
};

export type TradeCheckFiles = {
  cnh: File;
  crlv: File;
  cadastro: File;
};

const keys: Array<keyof TradeCheckExtractedData> = [
  'ownerName','cpf','rg','birthDate','address','cep','city','phone','brand','model','yearFab','yearModel','color','plate','chassis','renavam'
];

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`));
  reader.onload = () => {
    const value = String(reader.result || '');
    resolve(value.includes(',') ? value.split(',')[1] : value);
  };
  reader.readAsDataURL(file);
});

const serializeFile = async (file: File) => ({
  name: file.name,
  mimeType: file.type || 'application/octet-stream',
  data: await fileToBase64(file),
});

export const extractTradeCheckDocuments = async (files: TradeCheckFiles): Promise<TradeCheckExtractedData> => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Sua sessão expirou. Entre novamente no Motyq.');

  const totalBytes = files.cnh.size + files.crlv.size + files.cadastro.size;
  if (totalBytes > 3_000_000) {
    throw new Error('Os 3 arquivos juntos estão muito grandes para leitura automática. Use PDFs/imagens menores que totalizem até 3 MB.');
  }

  const [cnh, crlv, cadastro, idToken] = await Promise.all([
    serializeFile(files.cnh),
    serializeFile(files.crlv),
    serializeFile(files.cadastro),
    currentUser.getIdToken(),
  ]);

  const response = await fetch('/api/tradecheck-extract', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ files: { cnh, crlv, cadastro } }),
  });

  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    throw new Error(String(payload?.error || 'Não foi possível ler os documentos automaticamente.'));
  }

  const parsed = (payload?.data || {}) as Partial<TradeCheckExtractedData>;
  const result = {} as TradeCheckExtractedData;
  keys.forEach(key => { result[key] = String(parsed[key] || '').trim(); });
  result.plate = result.plate.toUpperCase();
  result.chassis = result.chassis.toUpperCase();
  return result;
};
