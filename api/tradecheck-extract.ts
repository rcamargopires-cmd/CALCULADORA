import { GoogleGenAI } from '@google/genai';

const FIREBASE_API_KEY = 'AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q';

type IncomingFile = {
  name: string;
  mimeType: string;
  data: string;
};

type Payload = {
  files?: {
    cnh?: IncomingFile;
    crlv?: IncomingFile;
    cadastro?: IncomingFile;
  };
};

const requiredKeys = [
  'ownerName','cpf','rg','birthDate','address','cep','city','phone',
  'brand','model','yearFab','yearModel','color','plate','chassis','renavam'
];

const cleanJson = (raw: string) => {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  return start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
};

const verifyFirebaseToken = async (idToken: string) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return null;
  const data = await response.json() as any;
  return data?.users?.[0] || null;
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const authHeader = String(req.headers?.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sessão do Motyq não encontrada.' });

    const firebaseUser = await verifyFirebaseToken(token);
    if (!firebaseUser?.email) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'A leitura automática ainda não está configurada no servidor do Motyq.' });

    const body = (req.body || {}) as Payload;
    const cnh = body.files?.cnh;
    const crlv = body.files?.crlv;
    const cadastro = body.files?.cadastro;
    if (!cnh?.data || !crlv?.data || !cadastro?.data) {
      return res.status(400).json({ error: 'Envie CNH, CRLV-e e print do cadastro.' });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Você está lendo documentos fornecidos por um usuário autenticado do Motyq para montar um dossiê de troca de veículo.\nExtraia somente informações claramente visíveis nos três arquivos. Não invente, não complete por contexto e não faça inferências.\nPrioridade de fonte: dados pessoais podem vir da CNH e do cadastro; dados do veículo devem vir do CRLV-e; telefone e endereço podem vir do cadastro.\nRetorne APENAS um objeto JSON válido com exatamente estas chaves, todas como string:\nownerName, cpf, rg, birthDate, address, cep, city, phone, brand, model, yearFab, yearModel, color, plate, chassis, renavam.\nSe um valor não estiver legível ou não existir, use string vazia. Preserve CPF/RG/CEP/telefone de forma legível. Placa e chassi em maiúsculas. birthDate preferencialmente DD/MM/AAAA.`;

    const parts: any[] = [
      { text: prompt },
      { text: `ARQUIVO: CNH DO PROPRIETÁRIO | nome: ${cnh.name}` },
      { inlineData: { mimeType: cnh.mimeType || 'application/octet-stream', data: cnh.data } },
      { text: `ARQUIVO: CRLV-E DO VEÍCULO | nome: ${crlv.name}` },
      { inlineData: { mimeType: crlv.mimeType || 'application/octet-stream', data: crlv.data } },
      { text: `ARQUIVO: PRINT DO CADASTRO DO CLIENTE | nome: ${cadastro.name}` },
      { inlineData: { mimeType: cadastro.mimeType || 'application/octet-stream', data: cadastro.data } },
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts }] as any,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(cleanJson(String(response.text || '{}'))) as Record<string, unknown>;
    const result: Record<string, string> = {};
    requiredKeys.forEach(key => { result[key] = String(parsed[key] || '').trim(); });
    result.plate = result.plate.toUpperCase();
    result.chassis = result.chassis.toUpperCase();

    return res.status(200).json({ data: result });
  } catch (error: any) {
    console.error('TradeCheck extraction error:', error?.message || error);
    return res.status(500).json({ error: 'Não foi possível ler os documentos agora. Tente novamente.' });
  }
}
