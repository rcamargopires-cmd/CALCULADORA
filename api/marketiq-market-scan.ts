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

const normalizeComparables = (raw: Comparable[], model: string, year: number) => raw
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

const dedupeComparables = <T extends { source: string; title: string; price: number; year: number; location: string }>(items: T[]) => {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${item.source}|${item.title}|${item.price}|${item.year}|${item.location}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const sortByCompetitivePrice = <T extends { price: number; source: string; url: string }>(items: T[]) => [...items].sort((a, b) => {
  if (a.price !== b.price) return a.price - b.price;
  const sourceA = isPreferredSource(a.source, a.url) ? 0 : 1;
  const sourceB = isPreferredSource(b.source, b.url) ? 0 : 1;
  return sourceA - sourceB;
});

const groundingData = (response: any) => {
  const grounding = response?.candidates?.[0]?.groundingMetadata || {};
  const chunks = Array.isArray(grounding?.groundingChunks) ? grounding.groundingChunks : [];
  const sources = chunks
    .map((chunk: any) => chunk?.web)
    .filter((web: any) => web?.uri)
    .map((web: any) => ({ title: String(web.title || domainOf(web.uri) || 'Fonte web'), url: String(web.uri) }))
    .filter((item: any) => !isExcludedSource(item.title, item.url));
  return { sources, queries: Array.isArray(grounding?.webSearchQueries) ? grounding.webSearchQueries : [] };
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
Sua missão é medir o MERCADO REAL DE COMPRA, dando prioridade aos anúncios válidos de MENOR PREÇO, porque são eles que pressionam a revenda e a avaliação de entrada.
Use Pesquisa Google e pesquise de verdade nas páginas/resultados dos portais.

VEÍCULO ALVO
- Modelo / versão informado: ${model}
- Ano-modelo alvo: ${year}
- KM atual: ${km || 'não informado'}
- FIPE atual: ${fipe ? `R$ ${fipe.toLocaleString('pt-BR')}` : 'não informada'}
- Região de origem: ${storeName}

REGRAS DE PREÇO
- FIPE é referência, não teto e não piso.
- NÃO elimine anúncio por estar abaixo ou acima da FIPE.
- NÃO use média genérica do portal para substituir preços visíveis dos anúncios.
- Se houver anúncios exatos a R$ 83 mil, R$ 92 mil, R$ 95 mil e outros a R$ 103 mil, os mais baratos DEVEM aparecer na amostra.
- Quilometragem alta NÃO elimina o anúncio. Retorne a KM para o MOTYQ ponderar depois.
- Ignore apenas parcela, entrada, consórcio, aluguel, leilão sem preço integral e preço evidentemente inválido.

FONTES
- Prioridade: Webmotors e iCarros.
- Depois: Mobiauto, OLX Autos e sites confiáveis de lojas/concessionárias.
- Nunca Facebook ou Mercado Livre.

NORMALIZAÇÃO DO NOME
- Interprete abreviações do estoque. Exemplos: HL=Highline, LGTD=Longitude, LTD=Limited, AT/AUT=automático.
- Pesquise usando também o nome comercial completo usado pelos portais.

FUNIL
1. EXATO: mesma marca + modelo + versão + powertrain + ano-modelo ${year}.
2. Se houver menos de 3 exatos, mesmo modelo/ano/powertrain em versão comercial próxima.
3. Depois ano-modelo ${year - 1} ou ${year + 1} do mesmo modelo/powertrain.
4. Só por último semelhante técnico.

OBRIGATÓRIO NA ETAPA EXATA
- Procure uma página/listagem ordenada por MENOR PREÇO quando possível.
- Se a página indicar mais de 8 anúncios exatos, tente retornar pelo menos os 8 a 12 anúncios mais baratos válidos, não apenas três anúncios aleatórios.
- A amostra deve representar o piso competitivo do mercado, não os anúncios mais caros.
- Se a Webmotors mostrar uma contagem com filtros exatos de versão + ano, use essa contagem.
- Não use contagem de modelo mais amplo como se fosse da versão exata.

PONTUAÇÃO
- exact: 100
- same_model: 88 a 95
- adjacent_year: 80 a 87
- technical_peer: 65 a 79

RETORNE APENAS JSON VÁLIDO:
{
  "comparables": [
    {
      "source": "Webmotors",
      "title": "nome completo do anúncio",
      "price": 93000,
      "year": ${year},
      "km": 80000,
      "location": "Campinas, SP",
      "url": null,
      "matchType": "exact",
      "matchTier": "exact",
      "compatibilityScore": 100,
      "similarityReason": ""
    }
  ],
  "marketOfferCount": 0,
  "marketOfferSource": "",
  "marketOfferScope": "exact",
  "expandedGeography": false,
  "notes": "resumo curto"
}
`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });

    const parsed = parseJson(response.text || '') || {};
    const mainRaw: Comparable[] = Array.isArray(parsed?.comparables) ? parsed.comparables : [];
    const mainNormalized = normalizeComparables(mainRaw, model, year);
    const initialExact = mainNormalized.filter(item => item.matchTier === 'exact' && item.year === year);
    const initialOfferCount = Math.max(0, Math.round(toNumber(parsed?.marketOfferCount)));
    const initialOfferScope = String(parsed?.marketOfferScope || '').toLowerCase();
    const initialMinExact = initialExact.length ? Math.min(...initialExact.map(item => item.price)) : 0;

    const shouldAuditExactFloor =
      (initialOfferCount >= 8 && initialExact.length < 6) ||
      (initialOfferCount >= 12 && initialExact.length < 8) ||
      Boolean(fipe && initialExact.length >= 3 && initialMinExact > fipe * 1.03);

    let auditResponse: any = null;
    let auditParsed: any = null;

    if (shouldAuditExactFloor) {
      const auditPrompt = `
Você é o AUDITOR DE PREÇO do MOTYQ. A primeira busca encontrou poucos anúncios ou um piso suspeitamente alto.
Faça uma SEGUNDA BUSCA independente e focada somente nos MENORES PREÇOS da versão EXATA.

ALVO EXATO
- ${model}
- ano-modelo ${year}
- FIPE informada: ${fipe ? `R$ ${fipe.toLocaleString('pt-BR')}` : 'não informada'}

REGRAS
- Pesquise primeiro Webmotors, depois iCarros.
- Use filtros de versão e ano exatos e procure/considere ordenação por MENOR PREÇO.
- NÃO amplie para outra versão, outro motor ou outro ano nesta auditoria.
- Retorne os 8 a 12 menores preços válidos que conseguir confirmar.
- NÃO descarte anúncio por KM alta.
- NÃO descarte anúncio por preço abaixo da FIPE.
- Se a página da Webmotors informar, por exemplo, 19 anúncios com esses filtros exatos, exactOfferCount deve ser 19.
- Não confunda contagem de toda a linha/modelo com a versão exata.
- Não invente preços nem contagem.

RETORNE APENAS JSON:
{
  "comparables": [
    {"source":"Webmotors","title":"","price":0,"year":${year},"km":0,"location":"","url":null,"matchType":"exact","matchTier":"exact","compatibilityScore":100,"similarityReason":""}
  ],
  "exactOfferCount": 0,
  "exactOfferSource": "",
  "notes": ""
}
`;
      auditResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: auditPrompt,
        config: { tools: [{ googleSearch: {} }] },
      });
      auditParsed = parseJson(auditResponse.text || '') || {};
    }

    const auditRaw: Comparable[] = Array.isArray(auditParsed?.comparables) ? auditParsed.comparables : [];
    const mergedNormalized = dedupeComparables(normalizeComparables([...mainRaw, ...auditRaw], model, year));

    const exact = sortByCompetitivePrice(mergedNormalized.filter(item => item.matchTier === 'exact' && item.year === year));
    const sameModel = sortByCompetitivePrice(mergedNormalized.filter(item => item.matchTier === 'same_model' && item.year === year));
    const adjacent = sortByCompetitivePrice(mergedNormalized.filter(item => item.matchTier === 'adjacent_year'));
    const peers = sortByCompetitivePrice(mergedNormalized.filter(item => item.matchTier === 'technical_peer'));

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

    // Para avaliação de compra, a amostra principal é a faixa competitiva: os menores anúncios válidos.
    // Isso impede três anúncios caros de inflarem artificialmente o "mercado observado".
    const sample = sortByCompetitivePrice(sourcePool).slice(0, 12);
    const prices = sample.map(item => item.price).sort((a, b) => a - b);
    const marketMedian = median(prices);
    const low = prices.length ? prices[0] : 0;
    const high = prices.length ? prices[prices.length - 1] : 0;
    const lowerBandCount = prices.length ? Math.min(prices.length, Math.max(3, Math.ceil(prices.length * 0.30))) : 0;
    const observed = median(prices.slice(0, lowerBandCount)) || marketMedian || 0;

    const auditOfferCount = Math.max(0, Math.round(toNumber(auditParsed?.exactOfferCount)));
    const auditOfferSource = String(auditParsed?.exactOfferSource || '').trim();
    const mainCountIsExact = initialOfferScope === 'exact';
    const reportedOfferCount = auditOfferCount || (mainCountIsExact ? initialOfferCount : 0);
    const offerCount = reportedOfferCount || sample.length;
    const offerSource = auditOfferSource || (mainCountIsExact ? String(parsed?.marketOfferSource || '').trim() : '');
    const offerReported = Boolean(reportedOfferCount);
    const offerLevel = offerReported
      ? (reportedOfferCount >= 30 ? 'high' : reportedOfferCount >= 12 ? 'medium' : 'low')
      : (sample.length >= 10 ? 'medium' : 'low');
    const offerWarning = offerLevel === 'high'
      ? `ALTA OFERTA NO MERCADO: ${reportedOfferCount} anúncios exatos identificados. Cautela na compra: muita oferta aumenta a concorrência, pressiona preço e pode alongar o giro.`
      : offerLevel === 'medium'
        ? `${offerReported ? `Oferta relevante: ${reportedOfferCount} anúncios exatos identificados.` : 'Amostra competitiva relevante encontrada.'} Avalie preço de entrada e giro com atenção.`
        : '';

    const mainGrounding = groundingData(response);
    const auditGrounding = groundingData(auditResponse);
    const sources = [...mainGrounding.sources, ...auditGrounding.sources]
      .filter((item, index, arr) => arr.findIndex(other => other.url === item.url) === index)
      .slice(0, 20);
    const searchQueries = Array.from(new Set([...mainGrounding.queries, ...auditGrounding.queries]));

    if (!sample.length || !observed) {
      return res.status(200).json({
        comparables: [],
        stats: { count: 0, low: 0, median: 0, high: 0, observed: 0 },
        confidence: 'low',
        marketSupply: { level: offerLevel, count: offerCount, reported: offerReported, source: offerSource, warning: offerWarning },
        expandedSearch: {
          used: true,
          scope: 'national_similar',
          exactCount: exact.length,
          similarCount: sameModel.length + adjacent.length + peers.length,
          warning: 'O MarketScan percorreu versão exata, mesmo modelo, anos adjacentes e semelhantes técnicos, mas não conseguiu validar preços suficientes nesta execução.',
        },
        notes: String(parsed?.notes || '').trim(),
        sources,
        searchQueries,
      });
    }

    const exactInSample = sample.filter(item => item.matchType === 'exact').length;
    const similarInSample = sample.filter(item => item.matchType === 'similar').length;
    const expandedGeography = Boolean(parsed?.expandedGeography);
    const expandedUsed = selectedTier !== 'exact' || expandedGeography;

    const warning = selectedTier === 'exact'
      ? (expandedGeography
        ? 'A busca local foi pequena; o MarketScan ampliou a distância, mas manteve a versão exata e priorizou os menores preços válidos.'
        : 'Amostra formada com a versão exata, priorizando os menores preços válidos do mercado.')
      : selectedTier === 'same_model'
        ? 'Havia poucos anúncios da versão exata. O MarketScan manteve o mesmo modelo, ano e powertrain e incluiu versões próximas com compatibilidade indicada.'
        : selectedTier === 'adjacent_year'
          ? 'A amostra exata continuou pequena. O MarketScan manteve o mesmo modelo/powertrain e incluiu anos-modelo adjacentes com peso menor.'
          : 'A oferta do mesmo modelo foi insuficiente. O MarketScan incluiu semelhantes técnicos e reduziu a confiança da referência.';

    const sourceDomains = new Set([
      ...sample.map(item => String(item.source || '').toLowerCase()).filter(Boolean),
      ...sources.map(item => domainOf(item.url)).filter(Boolean),
    ]);

    const coverage = reportedOfferCount ? sample.length / reportedOfferCount : 0;
    const confidence = selectedTier === 'exact'
      ? (sample.length >= 8 && sourceDomains.size >= 2 ? 'high' : sample.length >= 5 || coverage >= 0.30 ? 'medium' : 'low')
      : selectedTier === 'same_model'
        ? (sample.length >= 6 ? 'medium' : 'low')
        : 'low';

    const noteParts = [
      warning,
      shouldAuditExactFloor ? 'O piso de preço foi auditado em uma segunda busca focada nos anúncios exatos mais baratos.' : '',
      'O mercado observado usa a faixa inferior da amostra competitiva, evitando que anúncios caros inflem a avaliação.',
      fipe ? `FIPE de R$ ${fipe.toLocaleString('pt-BR')} usada apenas como referência, sem excluir anúncios reais abaixo ou acima dela.` : '',
      reportedOfferCount && offerSource ? offerSource : '',
      parsed?.notes ? String(parsed.notes).trim() : '',
      auditParsed?.notes ? String(auditParsed.notes).trim() : '',
    ].filter(Boolean);

    return res.status(200).json({
      comparables: sample,
      stats: {
        count: sample.length,
        low: round100(low),
        median: round100(marketMedian),
        high: round100(high),
        observed: round100(observed),
      },
      confidence,
      marketSupply: { level: offerLevel, count: offerCount, reported: offerReported, source: offerSource, warning: offerWarning },
      expandedSearch: {
        used: expandedUsed,
        scope: selectedTier === 'exact' ? 'national_exact' : 'national_similar',
        exactCount: exactInSample,
        similarCount: similarInSample,
        warning,
      },
      notes: noteParts.join(' '),
      sources,
      searchQueries,
    });
  } catch (error: any) {
    console.error('Motyq MarketScan error:', error?.message || error);
    return res.status(500).json({ error: 'Não foi possível pesquisar o mercado agora. Tente novamente.' });
  }
}
