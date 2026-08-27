import { GoogleGenAI } from '@google/genai';

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

const inlinePart = async (label: string, file: File) => ({
  textPart: { text: `ARQUIVO: ${label} | nome: ${file.name}` },
  filePart: { inlineData: { mimeType: file.type || 'application/octet-stream', data: await fileToBase64(file) } }
});

const cleanJson = (raw: string) => {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  return start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
};

export const extractTradeCheckDocuments = async (files: TradeCheckFiles): Promise<TradeCheckExtractedData> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('A leitura automática não está configurada no Motyq.');

  const ai = new GoogleGenAI({ apiKey });
  const [cnh, crlv, cadastro] = await Promise.all([
    inlinePart('CNH DO PROPRIETÁRIO', files.cnh),
    inlinePart('CRLV-E DO VEÍCULO', files.crlv),
    inlinePart('PRINT DO CADASTRO DO CLIENTE', files.cadastro),
  ]);

  const prompt = `Você está lendo documentos fornecidos pelo próprio usuário para montar um dossiê de troca de veículo.
Extraia somente informações claramente visíveis nos três arquivos. Não invente, não complete por contexto e não faça inferências.
Prioridade de fonte: dados pessoais podem vir da CNH e do cadastro; dados do veículo devem vir do CRLV-e; telefone e endereço podem vir do cadastro.
Retorne APENAS um objeto JSON válido com exatamente estas chaves, todas como string:
ownerName, cpf, rg, birthDate, address, cep, city, phone, brand, model, yearFab, yearModel, color, plate, chassis, renavam.
Se um valor não estiver legível ou não existir, use string vazia. Preserve CPF/RG/CEP/telefone de forma legível. Placa e chassi em maiúsculas. birthDate preferencialmente DD/MM/AAAA.`;

  const parts: any[] = [
    { text: prompt },
    cnh.textPart, cnh.filePart,
    crlv.textPart, crlv.filePart,
    cadastro.textPart, cadastro.filePart,
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts }] as any,
  });

  const parsed = JSON.parse(cleanJson(String(response.text || '{}'))) as Partial<TradeCheckExtractedData>;
  const result = {} as TradeCheckExtractedData;
  keys.forEach(key => { result[key] = String(parsed[key] || '').trim(); });
  result.plate = result.plate.toUpperCase();
  result.chassis = result.chassis.toUpperCase();
  return result;
};
