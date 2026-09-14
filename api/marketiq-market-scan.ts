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

type MatchTier = 'exact' | 'same_model' | 'adjacent_year' | 'technical_peer';

type Comparable = {
  source?: string;
  title?: string;
  price?: number | string;
  year?: number | string;
  km?: number | string | null;
  location?: string;
  url?: string | null;
  matchType?: string;
  matchTier?: string;
  compatibilityScore?: number | string;
  similarityReason?: string;
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
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

const normalizeTier = (item: Comparable): MatchTier => {
  const raw = String(item.matchTier || item.matchType || '').toLowerCase().replace(/[-\s]+/g, '_');
  if (raw === 'exact' || raw === 'exato') return 'exact';
  if (raw.includes('adjacent') || raw.includes('ano_adjacente')) return 'adjacent_year';
  if (raw.includes('technical') || raw.includes('peer') || raw.includes('concorrente') || raw.includes('similar_model')) return 'technical_peer';
  return 'same_model';
};

const defaultScore = (tier: MatchTier) => {
  if (tier === 'exact') return 100;
  if (tier === 'same_model') return 92;
  if (tier === 'adjacent_year') return 84;
  return 74;
};

const defaultReason = (tier: MatchTier) => {
  if (tier === 'same_model') return 'mesmo modelo, ano-modelo e powertrain; versão comercial próxima';
  if (tier === 'adjacent_year') return 'mesmo modelo e powertrain em ano-modelo adjacente';
  if (tier === 'technical_peer') return 'veículo tecnicamente próximo em categoria, powertrain e faixa de mercado';
  return '';
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
Você é o motor de pesquisa do MOTYQ MarketScan, usado por avaliadores profissionais de seminovos no Brasil.
Sua missão é encontrar o MERCADO REAL do veículo, sem declarar "amostra insuficiente" enquanto existirem anúncios relevantes do mesmo modelo ou referências técnicas próximas.
Use Pesquisa Google e pesquise de verdade nas páginas/resultados dos portais.

VEÍCULO ALVO
- Modelo / versão informado no estoque: ${model}
- Ano-modelo alvo: ${year}
- KM atual: ${km || 'não informado'}
- FIPE atual: ${fipe ? `R$ ${fipe.toLocaleString('pt-BR')}` : 'não informada'}
- Unidade/região de origem: ${storeName}

REGRA FUNDAMENTAL SOBRE FIPE
- FIPE é REFERÊNCIA, NÃO É TETO de pesquisa.
- NÃO descarte um anúncio real apenas porque o preço está acima da FIPE.
- O objetivo aqui é medir o preço anunciado no mercado real. Depois o MarketIQ compara mercado, FIPE, giro, margem e risco.
- Ignore somente preços evidentemente inválidos, parcelas, entrada, consórcio, aluguel, leilão sem preço integral e anúncios sem preço total claro.

FONTES
- Prioridade máxima: Webmotors e iCarros.
- Depois: Mobiauto, OLX Autos e sites confiáveis de lojas/concessionárias.
- Nunca use Facebook, Facebook Marketplace, Mercado Livre ou Mercado Livre Veículos.

ANTES DE BUSCAR
- Interprete corretamente a marca, o modelo, a versão e o powertrain do texto recebido.
- Expanda abreviações internas. Exemplos: LGTD=Longitude, LTD=Limited, AT/AUT=automático.
- Use também o nome comercial que os portais usam. Ex.: "KONA 1.6 HEV SIGNATURE" deve virar buscas como "Hyundai Kona 1.6 GDI HEV Signature DCT" e também "Hyundai Kona 2026" quando a busca precisar ser ampliada.

FAÇA A PESQUISA EM FUNIL, NESTA ORDEM. NÃO PARE CEDO DEMAIS:

ETAPA 1 — EXATO
- Mesma marca + modelo + versão + powertrain + ano-modelo ${year}.
- Procure primeiro na região de ${storeName}, depois no estado e depois em TODO O BRASIL.
- Webmotors e iCarros vêm primeiro.
- Se encontrar pelo menos 3 anúncios exatos válidos, eles formam a amostra principal.

ETAPA 2 — MESMO MODELO, MESMO ANO
- Se houver menos de 3 exatos, mantenha a mesma marca/modelo, mesmo ano-modelo ${year}, mesma carroceria e mesmo powertrain.
- Libere versões comerciais próximas do MESMO MODELO.
- Exemplo: Signature e Ultimate podem ser comparadas se compartilharem o mesmo conjunto mecânico, mas devem ser marcadas como semelhantes.

ETAPA 3 — MESMO MODELO, ANO ADJACENTE
- Se ainda houver menos de 3 referências, mantenha marca/modelo, carroceria e powertrain e aceite ano-modelo ${year - 1} ou ${year + 1}.

ETAPA 4 — SEMELHANTE TÉCNICO
- Só se as etapas anteriores ainda forem insuficientes, use modelos concorrentes realmente próximos.
- Exija mesma categoria/carroceria, powertrain equivalente, proposta de uso próxima e faixa de preço de mercado razoavelmente compatível.
- Não misture SUV com hatch/sedan apenas por preço.
- Não misture híbrido com combustão convencional quando isso alterar materialmente o produto.

PONTUAÇÃO DE COMPATIBILIDADE
- exact: 100
- same_model: 88 a 95
- adjacent_year: 80 a 87
- technical_peer: 65 a 79
- Explique em uma frase curta por que o semelhante é comparável.

OFERTA DE MERCADO
- Procure deliberadamente páginas de resultado da Webmotors/iCarros que mostrem a quantidade de anúncios.
- Se houver contagem da versão exata, use-a.
- Se a contagem exata não existir, pode usar a contagem do MESMO MODELO + ANO, desde que marketOfferSource deixe explícito que inclui outras versões.
- Nunca invente contagem.
- Procure os menores preços válidos, mas não filtre por FIPE.

RETORNE NO MÁXIMO 20 ANÚNCIOS, ORDENADOS DO MENOR PARA O MAIOR PREÇO.
RETORNE APENAS JSON VÁLIDO:
{
  "comparables": [
    {
      "source": "Webmotors",
      "title": "Hyundai Kona 1.6 GDI HEV Signature DCT",
      "price": 238000,
      "year": ${year},
      "km": 0,
      "location": "São Paulo, SP",
      "url": null,
      "matchType": "exact",
      "matchTier": "exact",
      "compatibilityScore": 100,
      "similarityReason": ""
    },
    {
      "source": "Webmotors",
      "title": "Hyundai Kona 1.6 GDI HEV Ultimate DCT",
      "price": 179990,
      "year": ${year},
      "km": 0,
      "location": "São Paulo, SP",
      "url": null,
      "matchType": "similar",
      "matchTier": "same_model",
      "compatibilityScore": 92,
      "similarityReason": "mesmo Kona 2026 e mesmo powertrain HEV; versão comercial próxima"
    }
  ],
  "marketOfferCount": 0,
  "marketOfferSource": "",
  "expandedGeography": true,
  "notes": "resumo curto do que foi encontrado e até qual etapa foi necessário ampliar"
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

    const normalized = rawComparables
      .map((item) => {
        const tier = normalizeTier(item);
        const parsedYear = toModelYear(item.year) || 0;
        const scoreRaw = Math.round(toNumber(item.compatibilityScore));
        const score = clamp(scoreRaw || defaultScore(tier), 0, 100);
        const reasonRaw = String(item.similarityReason || '').trim() || defaultReason(tier);
        return {
          source: String(item.source || '').trim() || 'Web',
          title: String(item.title || '').trim() || model,
          price: toNumber(item.price),
          year: parsedYear,
          km: toNumber(item.km) || 0,
          location: String(item.location || '').trim(),
          url: item.url ? String(item.url) : '',
          matchType: tier === 'exact' ? 'exact' as const : 'similar' as const,
          matchTier: tier,
          compatibilityScore: score,
          similarityReason: tier === 'exact' ? '' : `Compatibilidade ${score}% · ${reasonRaw}`,
        };
      })
      .filter(item => item.price >= 10000 && item.price <= 2000000)
      .filter(item => item.year >= year - 1 && item.year <= year + 1)
      .filter(item => !isExcludedSource(item.source, item.url));

    const seen = new Set<string>();
    const deduped = normalized.filter(item => {
      const key = `${item.source}|${item.title}|${item.price}|${item.year}|${item.location}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const sortPreferred = (items: typeof deduped) => [...items].sort((a, b) => {
      const sourceA = isPreferredSource(a.source, a.url) ? 0 : 1;
      const sourceB = isPreferredSource(b.source, b.url) ? 0 : 1;
      if (sourceA !== sourceB) return sourceA - sourceB;
      return a.price - b.price;
    });

    const exact = sortPreferred(deduped.filter(item => item.matchTier === 'exact' && item.year === year));
    const sameModel = sortPreferred(deduped.filter(item => item.matchTier === 'same_model' && item.year === year));
    const adjacent = sortPreferred(deduped.filter(item => item.matchTier === 'adjacent_year'));
    const peers = sortPreferred(deduped.filter(item => item.matchTier === 'technical_peer'));

    let selectedTier: MatchTier = 'technical_peer';
    let sourcePool = [...exact, ...sameModel, ...adjacent, ...peers];

    if (exact.length >= 3) {
      selectedTier = 'exact';
      sourcePool = exact;
    } else if (exact.length + sameModel.length >= 3) {
      selectedTier = 'same_model';
      sourcePool = [...exact, ...sameModel];
    } else if (exact.length + sameModel.length + adjacent.length >= 3) {
      selectedTier = 'adjacent_year';
      sourcePool = [...exact, ...sameModel, ...adjacent];
    }

    sourcePool = sourcePool.slice(0, 20);

    const initialMedian = median(sourcePool.map(item => item.price));
    const cleaned = initialMedian
      ? sourcePool.filter(item => item.price >= initialMedian * 0.65 && item.price <= initialMedian * 1.35)
      : sourcePool;
    const sample = cleaned.length >= 3 ? cleaned : sourcePool;

    const prices = sample.map(item => item.price).sort((a, b) => a - b);
    const marketMedian = median(prices);
    const low = prices.length ? prices[0] : 0;
    const high = prices.length ? prices[prices.length - 1] : 0;
    const lowerBandCount = prices.length ? Math.min(prices.length, Math.max(3, Math.ceil(prices.length * 0.30))) : 0;
    const observed = median(prices.slice(0, lowerBandCount)) || marketMedian || 0;

    const reportedOfferCount = Math.max(0, Math.round(toNumber(parsed?.marketOfferCount)));
    const offerCount = reportedOfferCount || sample.length;
    const offerLevel = reportedOfferCount
      ? (reportedOfferCount >= 30 ? 'high' : reportedOfferCount >= 12 ? 'medium' : 'low')
      : (sample.length >= 15 ? 'high' : sample.length >= 8 ? 'medium' : 'low');
    const offerSource = String(parsed?.marketOfferSource || '').trim();
    const offerWarning = offerLevel === 'high'
      ? `ALTA OFERTA NO MERCADO${reportedOfferCount ? `: ${reportedOfferCount} anúncios identificados` : ''}. Cautela na compra: muita oferta aumenta a concorrência, pressiona preço e pode alongar o giro.`
      : offerLevel === 'medium'
        ? `Oferta relevante no mercado${reportedOfferCount ? `: ${reportedOfferCount} anúncios identificados` : ''}. Avalie preço de entrada e giro com atenção.`
        : '';

    const grounding = (response as any)?.candidates?.[0]?.groundingMetadata || {};
    const groundingChunks = Array.isArray(grounding?.groundingChunks) ? grounding.groundingChunks : [];
    const sources = groundingChunks
      .map((chunk: any) => chunk?.web)
      .filter((web: any) => web?.uri)
      .map((web: any) => ({ title: String(web.title || domainOf(web.uri) || 'Fonte web'), url: String(web.uri) }))
      .filter((item: any) => !isExcludedSource(item.title, item.url))
      .filter((item: any, index: number, arr: any[]) => arr.findIndex(other => other.url === item.url) === index)
      .slice(0, 20);

    if (!sample.length || !observed) {
      return res.status(200).json({
        comparables: [],
        stats: { count: 0, low: 0, median: 0, high: 0, observed: 0 },
        confidence: 'low',
        marketSupply: { level: offerLevel, count: offerCount, reported: Boolean(reportedOfferCount), source: offerSource, warning: offerWarning },
        expandedSearch: {
          used: true,
          scope: 'national_similar',
          exactCount: exact.length,
          similarCount: sameModel.length + adjacent.length + peers.length,
          warning: 'O MarketScan percorreu versão exata, mesmo modelo, anos adjacentes e semelhantes técnicos, mas não conseguiu validar preços suficientes nesta execução.',
        },
        notes: String(parsed?.notes || '').trim(),
        sources,
        searchQueries: grounding?.webSearchQueries || [],
      });
    }

    const exactInSample = sample.filter(item => item.matchType === 'exact').length;
    const similarInSample = sample.filter(item => item.matchType === 'similar').length;
    const expandedGeography = Boolean(parsed?.expandedGeography);
    const expandedUsed = selectedTier !== 'exact' || expandedGeography;

    const warning = selectedTier === 'exact'
      ? (expandedGeography
        ? 'A busca local foi pequena; o MarketScan ampliou a distância e encontrou comparáveis exatos em outras regiões.'
        : 'Amostra formada com veículos da mesma versão e ano-modelo.')
      : selectedTier === 'same_model'
        ? 'Havia poucos anúncios da versão exata. O MarketScan manteve o mesmo modelo, ano e powertrain e incluiu versões comerciais próximas com compatibilidade indicada.'
        : selectedTier === 'adjacent_year'
          ? 'A amostra exata continuou pequena. O MarketScan manteve o mesmo modelo/powertrain e incluiu anos-modelo adjacentes com peso menor.'
          : 'A oferta do mesmo modelo foi insuficiente. O MarketScan incluiu semelhantes técnicos de alta proximidade e reduziu a confiança da referência.';

    const sourceDomains = new Set([
      ...sample.map(item => String(item.source || '').toLowerCase()).filter(Boolean),
      ...sources.map((item: any) => domainOf(item.url)).filter(Boolean),
    ]);

    const confidence = selectedTier === 'exact'
      ? (sample.length >= 8 && sourceDomains.size >= 2 ? 'high' : sample.length >= 3 ? 'medium' : 'low')
      : selectedTier === 'same_model'
        ? (sample.length >= 6 ? 'medium' : 'low')
        : 'low';

    const noteParts = [
      warning,
      fipe ? `FIPE de R$ ${fipe.toLocaleString('pt-BR')} usada como referência, sem bloquear anúncios acima dela.` : '',
      reportedOfferCount && offerSource ? offerSource : '',
      'Prioridade para Webmotors e iCarros; Facebook e Mercado Livre excluídos.',
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
      marketSupply: { level: offerLevel, count: offerCount, reported: Boolean(reportedOfferCount), source: offerSource, warning: offerWarning },
      expandedSearch: {
        used: expandedUsed,
        scope: selectedTier === 'exact' ? 'national_exact' : 'national_similar',
        exactCount: exactInSample,
        similarCount: similarInSample,
        warning,
      },
      notes: noteParts.join(' '),
      sources,
      searchQueries: grounding?.webSearchQueries || [],
    });
  } catch (error: any) {
    console.error('Motyq MarketScan error:', error?.message || error);
    return res.status(500).json({ error: 'Não foi possível pesquisar o mercado agora. Tente novamente.' });
  }
}
