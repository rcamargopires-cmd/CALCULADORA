import { GoogleGenAI } from '@google/genai';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { motyqFirestore } from '../server/motyqFirestore';

const cleanPhone = (value: unknown) => String(value || '').replace(/\D/g, '').slice(0, 15);
const cleanPlate = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
const nowIso = () => new Date().toISOString();
const plusMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 180);

const parseJson = (text: string) => {
  const clean = String(text || '').replace(/\`\`\`json/gi, '').replace(/\`\`\`/g, '').trim();
  try { return JSON.parse(clean); } catch {}
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(clean.slice(start, end + 1)); } catch {}
  }
  return null;
};

const messageText = (message: any) => {
  if (message?.text?.body) return String(message.text.body);
  if (message?.interactive?.button_reply?.title) return String(message.interactive.button_reply.title);
  if (message?.interactive?.list_reply?.title) return String(message.interactive.list_reply.title);
  if (message?.button?.text) return String(message.button.text);
  if (message?.type) return `[${String(message.type)} recebido]`;
  return '';
};

const signatureOk = (rawBody: string, req: any) => {
  const secret = String(process.env.WHATSAPP_APP_SECRET || '').trim();
  if (!secret) return true;
  const supplied = String(req.headers?.['x-hub-signature-256'] || '').trim();
  if (!supplied.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

const metaSendText = async (to: string, text: string, phoneNumberId: string) => {
  const token = String(process.env.WHATSAPP_SYSTEM_USER_TOKEN || '').trim();
  const version = String(process.env.WHATSAPP_GRAPH_VERSION || 'v24.0').trim();
  if (!token || !phoneNumberId) throw new Error('whatsapp_meta_not_configured');

  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text.slice(0, 4000) },
    }),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`whatsapp_send_${response.status}_${data?.error?.message || ''}`);
  }
  return data;
};

const resolveSellerConnection = async (phoneNumberId: string) => {
  if (!phoneNumberId) return null;
  const rows = await motyqFirestore.query('whatsapp_connections', [
    { field: 'phoneNumberId', value: phoneNumberId },
  ], 10).catch(() => []);
  return rows.find((item: any) => item?.active !== false) || null;
};

const stockContext = async (companyId: string, storeId: string) => {
  const rows = await motyqFirestore.query('operational_stock', [
    { field: 'companyId', value: companyId },
    { field: 'storeId', value: storeId },
  ], 60).catch(() => []);
  return rows.map((item: any) => ({
    vehicle: String(item.vehicle || ''),
    plate: String(item.plate || ''),
    askingPrice: Number(item.askingPrice || 0),
    fipe: Number(item.fipe || 0),
    stockDays: Number(item.stockDays || 0),
    location: String(item.location || ''),
    status: String(item.status || ''),
  })).filter((item: any) => item.vehicle);
};

const agentReply = async (input: {
  name: string;
  phone: string;
  text: string;
  existing: any;
  stock: any[];
}) => {
  const fallback = {
    reply: `Olá${input.name ? `, ${input.name.split(' ')[0]}` : ''}! Sou o assistente do MOTYQ. Posso te ajudar a encontrar um seminovo. Qual modelo você procura e qual faixa de valor pretende investir?`,
    interestModel: String(input.existing?.interestModel || ''),
    temperature: 'warm',
    tradeInPlate: String(input.existing?.tradeInPlate || ''),
    desiredEntry: Number(input.existing?.desiredEntry || 0),
    desiredPayment: Number(input.existing?.desiredPayment || 0),
    handoff: false,
    notes: '',
  };

  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return fallback;

  const stockText = input.stock.slice(0, 60).map((item, index) =>
    `${index + 1}. ${item.vehicle} | preço anunciado: ${item.askingPrice || 'não informado'} | FIPE: ${item.fipe || 'não informada'} | dias estoque: ${item.stockDays || 0} | local: ${item.location || 'não informado'}`
  ).join('\n');

  const prompt = `
Você é o agente de pré-atendimento do MOTYQ, um CRM automotivo brasileiro.
Converse em português do Brasil, de forma natural, curta e prestativa.

REGRAS COMERCIAIS
- Seu papel é qualificar o cliente e facilitar a passagem para um vendedor humano.
- Nunca invente estoque, preço, disponibilidade, desconto, aprovação de financiamento ou valor final de avaliação.
- Só cite veículos do ESTOQUE fornecido abaixo.
- Você pode informar preço anunciado quando ele estiver presente no estoque.
- Não prometa desconto e não negocie preço final.
- Quando o cliente pedir negociação, desconto, aprovação de financiamento, avaliação final da troca, visita imediata ou falar com vendedor, marque handoff=true.
- Se o cliente tiver veículo na troca, tente obter placa e KM em mensagens futuras, sem pressionar.
- Faça no máximo uma pergunta principal por resposta.
- Resposta ideal: 1 a 4 frases e no máximo 500 caracteres.
- Se houver até 3 opções claramente compatíveis no estoque, pode mencioná-las.
- Se não houver opção exata, diga isso com transparência e pergunte se aceita semelhantes.
- Não peça CPF, senha, cartão, código de confirmação ou dados bancários.

CLIENTE
Nome: ${input.name || 'não informado'}
Telefone: ${input.phone}
Mensagem atual: ${input.text}
Interesse já registrado: ${String(input.existing?.interestModel || 'não informado')}
Troca já registrada: ${String(input.existing?.tradeInPlate || 'não informada')}
Entrada desejada já registrada: ${Number(input.existing?.desiredEntry || 0) || 'não informada'}
Parcela desejada já registrada: ${Number(input.existing?.desiredPayment || 0) || 'não informada'}

ESTOQUE DA UNIDADE
${stockText || 'Nenhum estoque estruturado disponível nesta execução.'}

Classifique a temperatura:
- hot: quer visitar, proposta, financiamento, avaliação da troca ou demonstra intenção de compra imediata.
- warm: informou modelo, orçamento, troca ou está comparando opções.
- cold: contato muito genérico, sem intenção definida.

Extraia a placa de troca somente se houver uma placa brasileira de 7 caracteres claramente informada.

RETORNE SOMENTE JSON VÁLIDO:
{
  "reply": "texto para enviar ao cliente",
  "interestModel": "interesse consolidado do cliente",
  "temperature": "hot|warm|cold",
  "tradeInPlate": "",
  "desiredEntry": 0,
  "desiredPayment": 0,
  "handoff": false,
  "notes": "resumo factual novo para o vendedor, sem inventar"
}
`;

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  const parsed = parseJson(response.text || '');
  if (!parsed?.reply) return fallback;

  return {
    reply: String(parsed.reply).slice(0, 1000),
    interestModel: String(parsed.interestModel || input.existing?.interestModel || '').slice(0, 300),
    temperature: ['hot', 'warm', 'cold'].includes(String(parsed.temperature)) ? String(parsed.temperature) : 'warm',
    tradeInPlate: cleanPlate(parsed.tradeInPlate || input.existing?.tradeInPlate || ''),
    desiredEntry: Math.max(0, Number(parsed.desiredEntry || input.existing?.desiredEntry || 0) || 0),
    desiredPayment: Math.max(0, Number(parsed.desiredPayment || input.existing?.desiredPayment || 0) || 0),
    handoff: Boolean(parsed.handoff),
    notes: String(parsed.notes || '').slice(0, 700),
  };
};

const logMessage = async (input: {
  id: string;
  companyId: string;
  storeId: string;
  phone: string;
  leadId: string;
  direction: 'inbound' | 'outbound';
  type: string;
  text: string;
  timestamp: string;
}) => motyqFirestore.patch('whatsapp_messages', safeId(input.id), input);

const processIncoming = async (message: any, value: any) => {
  const phoneNumberId = String(value?.metadata?.phone_number_id || '').trim();
  const connection: any = await resolveSellerConnection(phoneNumberId);
  if (!connection) {
    console.warn('MOTYQ WhatsApp message ignored: seller connection not found', { phoneNumberId });
    return;
  }

  const companyId = String(connection.companyId || '').trim();
  const storeId = String(connection.storeId || '').trim();
  const seller = {
    id: String(connection.sellerId || connection.sellerEmail || ''),
    email: String(connection.sellerEmail || '').trim().toLowerCase(),
    name: String(connection.sellerName || connection.sellerEmail || 'Vendedor'),
  };
  if (!companyId || !storeId || !seller.email) {
    console.warn('MOTYQ WhatsApp message ignored: incomplete seller connection', { phoneNumberId });
    return;
  }

  const from = cleanPhone(message?.from);
  if (!from) return;

  const messageId = String(message?.id || `incoming_${Date.now()}_${from}`);
  const duplicate = await motyqFirestore.get('whatsapp_messages', safeId(messageId)).catch(() => null);
  if (duplicate) return;

  const profileName = String(value?.contacts?.find((item: any) => cleanPhone(item?.wa_id) === from)?.profile?.name || '').trim();
  const text = messageText(message);
  const leadId = safeId(`wa_${connection.id || phoneNumberId}_${from}`);
  const existing: any = await motyqFirestore.get('showroom_passages', leadId).catch(() => null);

  await logMessage({
    id: messageId,
    companyId,
    storeId,
    phone: from,
    leadId,
    direction: 'inbound',
    type: String(message?.type || 'text'),
    text,
    timestamp: nowIso(),
  });

  const stock = await stockContext(companyId, storeId);
  const agent = await agentReply({ name: profileName, phone: from, text, existing: existing || {}, stock });
  const previousNotes = String(existing?.notes || '').trim();
  const noteParts = [previousNotes, agent.notes ? `WhatsApp: ${agent.notes}` : ''].filter(Boolean);
  const notes = noteParts.join('\n').slice(-1800);
  const timestamp = nowIso();
  const status = existing?.status && ['sale', 'no_deal'].includes(String(existing.status))
    ? existing.status
    : agent.handoff ? 'in_service' : String(existing?.status || 'waiting');

  const leadPayload: Record<string, any> = {
    id: leadId,
    customerName: profileName || String(existing?.customerName || 'Cliente WhatsApp'),
    phone: from,
    interestModel: agent.interestModel || String(existing?.interestModel || ''),
    origin: 'walk_in',
    assignedSellerId: seller.id,
    assignedSellerEmail: seller.email,
    assignedSellerName: seller.name,
    status,
    createdAt: String(existing?.createdAt || timestamp),
    updatedAt: timestamp,
    lastContactAt: timestamp,
    notes,
    leadSource: 'whatsapp',
    sourceLabel: 'WhatsApp de ' + seller.name,
    leadTemperature: agent.temperature,
    whatsappThreadId: from,
    tradeInPlate: agent.tradeInPlate,
    desiredEntry: agent.desiredEntry,
    desiredPayment: agent.desiredPayment,
    nextFollowUpAt: agent.handoff ? plusMinutes(30) : String(existing?.nextFollowUpAt || ''),
    createdBy: String(existing?.createdBy || 'motyq-whatsapp-agent'),
    createdByName: String(existing?.createdByName || 'MOTYQ WhatsApp'),
    companyId,
    storeId,
    whatsappPhoneNumberId: phoneNumberId,
    whatsappConnectionId: String(connection.id || ''),
    lastInboundText: text.slice(0, 1200),
    lastAgentReply: agent.reply.slice(0, 1200),
    agentHandoff: agent.handoff,
  };

  await motyqFirestore.patch('showroom_passages', leadId, leadPayload);

  const sent = await metaSendText(from, agent.reply, phoneNumberId);
  const outboundId = String(sent?.messages?.[0]?.id || `outgoing_${Date.now()}_${from}`);
  await logMessage({
    id: outboundId,
    companyId,
    storeId,
    phone: from,
    leadId,
    direction: 'outbound',
    type: 'text',
    text: agent.reply,
    timestamp: nowIso(),
  }).catch(() => undefined);
};

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    const mode = String(req.query?.['hub.mode'] || '');
    const token = String(req.query?.['hub.verify_token'] || '');
    const challenge = String(req.query?.['hub.challenge'] || '');
    const expected = String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
    if (mode === 'subscribe' && expected && token === expected) {
      res.setHeader('content-type', 'text/plain');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'webhook_verification_failed' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    if (!motyqFirestore.configured()) {
      return res.status(503).json({ error: 'firebase_service_account_not_configured' });
    }

    const rawBody = typeof req.body === 'string'
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : JSON.stringify(req.body || {});

    if (!signatureOk(rawBody, req)) {
      return res.status(401).json({ error: 'invalid_webhook_signature' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (body?.object !== 'whatsapp_business_account') {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const jobs: Promise<void>[] = [];
    for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        const value = change?.value || {};
        for (const message of Array.isArray(value?.messages) ? value.messages : []) {
          jobs.push(processIncoming(message, value));
        }
      }
    }

    await Promise.allSettled(jobs);
    return res.status(200).json({ ok: true, processed: jobs.length });
  } catch (error: any) {
    console.error('MOTYQ WhatsApp webhook error', error?.message || error);
    return res.status(500).json({ error: 'webhook_processing_failed' });
  }
}
