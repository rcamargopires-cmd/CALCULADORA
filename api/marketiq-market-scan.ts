import { GoogleGenAI } from '@google/genai';

const FIREBASE_API_KEY = 'AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q';

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

type Comparable = {
  source?: string;
  title?: string;
  price?: number | string;
  year?: number | string;
  km?: number | string | null;
  location?: string;
  url?: string | null;
};

const toNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const normalized = raw
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  return Number(normalized) || 0;
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const round100 = (value: number) => Math.round(value / 100) * 100;

const parseJson = (text: string) => {
  const clean = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(clean); } catch {}
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(clean.slice(start, end + 1)); } catch {}
  }
  return null;
};

const domainOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
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
    if (!apiKey) return res.status(503).json({ error: 'MarketScan ainda não está configurado no servidor.' });

    const model = String(req.body?.model || '').trim();
    const year = Math.round(toNumber(req.body?.year));
    const km = Math.round(toNumber(req.body?.km));
    const fipe = toNumber(req.body?.fipe);
    const storeName = String(req.body?.storeName || 'Sorocaba, SP').trim();

    if (!model || !year) {
      return res.status(400).json({ error: 'Informe modelo/versão e ano antes de pesquisar o mercado.' });
    }

    const prompt = `
Você é o motor MarketScan de uma concessionária brasileira de veículos seminovos.
Use a Pesquisa Google para localizar anúncios REAIS E ATUAIS de veículos comparáveis ao carro abaixo.

VEÍCULO ALVO
- Modelo / versão: ${model}
- Ano/modelo: ${year}
- KM atual: ${km || 'não informado'}
- FIPE atual: ${fipe || 'não informada'}
- Unidade/região: ${storeName}

FONTES PRIORITÁRIAS
1. Webmotors
2. OLX Autos
3. iCarros
4. Mobiauto
5. Mercado Livre Veículos
6. Portais e lojas de seminovos confiáveis

REGRAS DE COMPARABILIDADE
- Priorize EXATAMENTE a mesma versão e o mesmo ano/modelo.
- Se houver poucos anúncios, aceite ano ${year - 1} a ${year + 1}, deixando isso explícito.
- Priorize Sorocaba e interior de SP; se necessário, amplie para o estado de São Paulo.
- Se KM estiver disponível, prefira veículos próximos da quilometragem alvo.
- Considere apenas preço total anunciado do veículo. Ignore parcela, entrada, consórcio, aluguel e anúncios sem preço claro.
- Não invente preço, URL, quilometragem, versão ou localização.
- Se uma informação não estiver visível no resultado pesquisado, use null.
- Retorne no máximo 15 comparáveis.

RETORNE APENAS JSON VÁLIDO, SEM MARKDOWN, NESTE FORMATO:
{
  "comparables": [
    {
      "source": "Webmotors",
      "title": "texto real/resumido do anúncio",
      "price": 119900,
      "year": 2023,
      "km": 42000,
      "location": "Sorocaba, SP",
      "url": null
    }
  ],
  "notes": "resumo curto sobre qualidade/amplitude da amostra"
}
`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });

    const parsed = parseJson(response.text || '');
    const rawComparables: Comparable[] = Array.isArray(parsed?.comparables) ? parsed.comparables : [];

    const cleaned = rawComparables
      .map((item) => ({
        source: String(item.source || '').trim() || 'Web',
        title: String(item.title || '').trim() || model,
        price: toNumber(item.price),
        year: Math.round(toNumber(item.year)) || year,
        km: toNumber(item.km) || 0,
        location: String(item.location || '').trim(),
        url: item.url ? String(item.url) : '',
      }))
      .filter((item) => item.price >= 10000 && item.price <= 2000000)
      .filter((item) => Math.abs(item.year - year) <= 2);

    const initialMedian = median(cleaned.map(item => item.price));
    const filtered = initialMedian
      ? cleaned.filter(item => item.price >= initialMedian * 0.72 && item.price <= initialMedian * 1.28)
      : cleaned;

    const sample = filtered.length >= 3 ? filtered : cleaned;
    const prices = sample.map(item => item.price).sort((a, b) => a - b);
    const marketMedian = median(prices);
    const low = prices.length ? prices[0] : 0;
    const high = prices.length ? prices[prices.length - 1] : 0;
    const trimmed = prices.length >= 6 ? prices.slice(1, -1) : prices;
    const trimmedMean = trimmed.length ? trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length : 0;
    const observed = marketMedian && trimmedMean ? (marketMedian * 0.65 + trimmedMean * 0.35) : (marketMedian || trimmedMean || 0);

    const grounding = (response as any)?.candidates?.[0]?.groundingMetadata || {};
    const groundingChunks = Array.isArray(grounding?.groundingChunks) ? grounding.groundingChunks : [];
    const sources = groundingChunks
      .map((chunk: any) => chunk?.web)
      .filter((web: any) => web?.uri)
      .map((web: any) => ({ title: String(web.title || domainOf(web.uri) || 'Fonte web'), url: String(web.uri) }))
      .filter((item: any, index: number, arr: any[]) => arr.findIndex(other => other.url === item.url) === index)
      .slice(0, 20);

    const sourceDomains = new Set([
      ...sample.map(item => String(item.source || '').toLowerCase()).filter(Boolean),
      ...sources.map((item: any) => domainOf(item.url)).filter(Boolean),
    ]);

    const confidence = sample.length >= 8 && sourceDomains.size >= 3
      ? 'high'
      : sample.length >= 4 && sourceDomains.size >= 2
        ? 'medium'
        : 'low';

    if (!sample.length || !observed) {
      return res.status(200).json({
        comparables: [],
        stats: { count: 0, low: 0, median: 0, high: 0, observed: 0 },
        confidence: 'low',
        notes: parsed?.notes || 'Não encontrei comparáveis suficientes com preço verificável.',
        sources,
        searchQueries: grounding?.webSearchQueries || [],
      });
    }

    return res.status(200).json({
      comparables: sample.sort((a, b) => a.price - b.price),
      stats: {
        count: sample.length,
        low: round100(low),
        median: round100(marketMedian),
        high: round100(high),
        observed: round100(observed),
      },
      confidence,
      notes: parsed?.notes || '',
      sources,
      searchQueries: grounding?.webSearchQueries || [],
    });
  } catch (error: any) {
    console.error('Motyq MarketScan error:', error?.message || error);
    return res.status(500).json({ error: 'Não foi possível pesquisar o mercado agora. Tente novamente.' });
  }
}
