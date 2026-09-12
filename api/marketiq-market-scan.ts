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

const toModelYear = (value: unknown) => {
  const raw = String(value ?? '').trim();
  const matches = raw.match(/(?:19|20)\d{2}/g) || [];
  if (matches.length) return Number(matches[matches.length - 1]);
  const numeric = Math.round(toNumber(value));
  return numeric >= 1900 && numeric <= 2100 ? numeric : 0;
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

const sourceKey = (source: string, url: string) => `${String(source || '')} ${String(url || '')}`.toLowerCase();
const isExcludedSource = (source: string, url: string) => {
  const key = sourceKey(source, url);
  return key.includes('facebook') || key.includes('facebook.com') || key.includes('mercado livre') || key.includes('mercadolivre') || key.includes('mercadolivre.com');
};
const isPreferredSource = (source: string, url: string) => {
  const key = sourceKey(source, url);
  return key.includes('webmotors') || key.includes('webmotors.com') || key.includes('icarros') || key.includes('icarros.com');
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
    const year = toModelYear(req.body?.yearLabel || req.body?.year);
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
- Modelo / versão informado no estoque: ${model}
- ANO-MODELO obrigatório: ${year}
- KM atual: ${km || 'não informado'}
- FIPE atual: ${fipe || 'não informada'}
- Unidade/região: ${storeName}

IMPORTANTE SOBRE PREÇO X FIPE
- ${fipe ? `A FIPE atual é R$ ${fipe.toLocaleString('pt-BR')}. NÃO use nenhum anúncio com preço acima desse valor.` : 'A FIPE não foi informada; nesse caso, não aplique teto de FIPE.'}
- Para a precificação, anúncios acima da FIPE devem ser ignorados.
- Priorize os menores preços válidos abaixo ou iguais à FIPE.

IMPORTANTE SOBRE ANO
- Compare SOMENTE veículos de ANO-MODELO ${year}.
- Fabricação ${year - 1}/modelo ${year} pode ser aceita, pois o ano-modelo continua ${year}.
- NÃO aceite ano-modelo ${year - 1}, ${year + 1} ou qualquer outro ano-modelo.

IMPORTANTE SOBRE NOMES DE VERSÃO
- O texto vindo do estoque pode usar abreviações internas. Interprete e EXPANDA abreviações automotivas antes de pesquisar.
- Exemplos comuns: LGTD = Longitude, LTD = Limited, AT = automático, AUT = automático, T270 = motor T270.
- Pesquise também a forma comercial completa usada pelos portais, sem alterar marca/modelo/versão real.
- Exemplo: "RENEGADE LGTD T270" deve ser pesquisado também como "Jeep Renegade Longitude T270" e, quando compatível com os resultados, "1.3 T270 Turbo Flex Longitude AT6".
- NÃO misture outra versão, mesmo que seja do mesmo modelo e ano.

FONTES
- PRIORIDADE MÁXIMA: Webmotors e iCarros.
- Tente formar a amostra primeiro com anúncios dessas duas fontes.
- Somente se Webmotors + iCarros não fornecerem comparáveis suficientes, complemente com Mobiauto, OLX Autos e portais/lojas de seminovos confiáveis.
- NÃO use Facebook, Facebook Marketplace, Mercado Livre nem Mercado Livre Veículos em nenhuma hipótese.

ESTRATÉGIA DE PESQUISA
- Faça primeiro buscas específicas na Webmotors e no iCarros pela versão EXATA e ANO-MODELO ${year}, priorizando MENOR PREÇO.
- Exemplos: site:webmotors.com.br + versão completa + ${year} + região + menor preço; site:icarros.com.br + versão completa + ${year} + região + menor preço.
- Se uma página de resultados mostrar vários cards com preço, ano, KM e localização, use esses cards como evidência válida.
- Se a cidade tiver poucos resultados, amplie para raio/região e depois para o estado de São Paulo, SEM mudar versão nem ano-modelo.
- Só depois use fontes secundárias permitidas.

REGRAS DE COMPARABILIDADE
- EXIJA a mesma versão e o mesmo ANO-MODELO ${year}.
- Priorize ${storeName}; se necessário, amplie para o estado de São Paulo.
- Se KM estiver disponível, prefira veículos próximos da quilometragem alvo, mas não descarte um anúncio válido apenas por KM diferente.
- Considere apenas preço total anunciado do veículo. Ignore parcela, entrada, consórcio, aluguel e anúncios sem preço claro.
- ${fipe ? `DESCARTE qualquer preço acima de R$ ${fipe.toLocaleString('pt-BR')} (FIPE atual).` : ''}
- Procure deliberadamente o piso competitivo.
- NÃO use anúncios do Facebook ou Mercado Livre.
- Não invente preço, URL, quilometragem, versão ou localização.
- Retorne no máximo 20 comparáveis, ORDENADOS DO MENOR PARA O MAIOR PREÇO.

RETORNE APENAS JSON VÁLIDO, SEM MARKDOWN, NESTE FORMATO:
{
  "comparables": [
    {
      "source": "Webmotors",
      "title": "texto real/resumido do anúncio",
      "price": 97900,
      "year": ${year},
      "km": 25000,
      "location": "São Paulo, SP",
      "url": null
    }
  ],
  "notes": "resumo curto sobre a amostra encontrada"
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

    const exactYear = rawComparables
      .map((item) => ({
        source: String(item.source || '').trim() || 'Web',
        title: String(item.title || '').trim() || model,
        price: toNumber(item.price),
        year: toModelYear(item.year) || 0,
        km: toNumber(item.km) || 0,
        location: String(item.location || '').trim(),
        url: item.url ? String(item.url) : '',
      }))
      .filter((item) => item.price >= 10000 && item.price <= 2000000)
      .filter((item) => item.year === year)
      .filter((item) => !fipe || item.price <= fipe)
      .filter((item) => !isExcludedSource(item.source, item.url));

    const preferred = exactYear.filter(item => isPreferredSource(item.source, item.url));
    const sourcePool = preferred.length >= 3 ? preferred : exactYear;

    const initialMedian = median(sourcePool.map(item => item.price));
    const cleaned = initialMedian
      ? sourcePool.filter(item => item.price >= initialMedian * 0.72 && item.price <= initialMedian * 1.28)
      : sourcePool;

    const sample = cleaned.length >= 3 ? cleaned : sourcePool;
    const prices = sample.map(item => item.price).sort((a, b) => a - b);
    const marketMedian = median(prices);
    const low = prices.length ? prices[0] : 0;
    const high = prices.length ? prices[prices.length - 1] : 0;

    const lowerBandCount = prices.length ? Math.min(prices.length, Math.max(3, Math.ceil(prices.length * 0.30))) : 0;
    const lowerBand = prices.slice(0, lowerBandCount);
    const competitiveFloor = median(lowerBand);
    const observed = competitiveFloor || marketMedian || 0;

    const grounding = (response as any)?.candidates?.[0]?.groundingMetadata || {};
    const groundingChunks = Array.isArray(grounding?.groundingChunks) ? grounding.groundingChunks : [];
    const sources = groundingChunks
      .map((chunk: any) => chunk?.web)
      .filter((web: any) => web?.uri)
      .map((web: any) => ({ title: String(web.title || domainOf(web.uri) || 'Fonte web'), url: String(web.uri) }))
      .filter((item: any) => !isExcludedSource(item.title, item.url))
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
        notes: fipe
          ? `Não encontrei comparáveis suficientes da mesma versão e ano-modelo ${year} com preço até a FIPE nas fontes permitidas.`
          : `Não encontrei comparáveis suficientes da mesma versão com ano-modelo ${year} nas fontes permitidas.`,
        sources,
        searchQueries: grounding?.webSearchQueries || [],
      });
    }

    const noteParts = [
      `${sample.length} comparáveis válidos da mesma versão e ano-modelo ${year}.`,
      preferred.length >= 3 ? 'Amostra baseada prioritariamente em Webmotors e iCarros.' : 'Webmotors/iCarros insuficientes; amostra complementada apenas com fontes secundárias permitidas.',
      fipe ? `Anúncios acima da FIPE de R$ ${fipe.toLocaleString('pt-BR')} foram descartados.` : '',
      'Facebook e Mercado Livre foram excluídos.',
      `Base de precificação: ${lowerBandCount} menor${lowerBandCount === 1 ? '' : 'es'} preço${lowerBandCount === 1 ? '' : 's'} válido${lowerBandCount === 1 ? '' : 's'} da amostra.`,
      parsed?.notes ? String(parsed.notes).trim() : '',
    ].filter(Boolean);

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
      notes: noteParts.join(' '),
      sources,
      searchQueries: grounding?.webSearchQueries || [],
    });
  } catch (error: any) {
    console.error('Motyq MarketScan error:', error?.message || error);
    return res.status(500).json({ error: 'Não foi possível pesquisar o mercado agora. Tente novamente.' });
  }
}
