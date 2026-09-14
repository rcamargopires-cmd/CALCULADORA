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

type MatchType = 'exact' | 'similar';

type Comparable = {
  source?: string;
  title?: string;
  price?: number | string;
  year?: number | string;
  km?: number | string | null;
  location?: string;
  url?: string | null;
  matchType?: MatchType | string;
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
Você é o motor de contingência do MOTYQ MarketScan para avaliação de seminovos no Brasil.
A pesquisa estrita anterior não encontrou comparáveis suficientes. Agora amplie a busca automaticamente, mas sem misturar carros aleatórios.
Use Pesquisa Google e encontre anúncios REAIS, ATUAIS e com preço verificável.

VEÍCULO ALVO
- Modelo / versão: ${model}
- Ano-modelo alvo: ${year}
- KM: ${km || 'não informado'}
- FIPE alvo: ${fipe || 'não informada'}
- Unidade de origem: ${storeName}

REGRA ABSOLUTA DE PREÇO
- ${fipe ? `NÃO use nenhum anúncio acima de R$ ${fipe.toLocaleString('pt-BR')}, que é a FIPE do veículo alvo.` : 'A FIPE não foi informada; não aplique teto de FIPE.'}
- Ignore parcela, entrada, consórcio, aluguel, leilão sem preço integral e anúncios sem preço claro.

FONTES
- Prioridade máxima: Webmotors e iCarros.
- Depois: Mobiauto, OLX Autos e sites confiáveis de lojas/concessionárias.
- Nunca use Facebook, Facebook Marketplace, Mercado Livre ou Mercado Livre Veículos.

FAÇA A BUSCA EM ETAPAS, NESTA ORDEM:
1. MESMA versão + mesmo ano-modelo ${year}, primeiro no estado de São Paulo e depois em TODO O BRASIL.
2. Se ainda houver menos de 3 anúncios exatos, mantenha o mesmo modelo/família, mesmo tipo de carroceria e mesma motorização/powertrain e procure as versões comerciais MAIS PRÓXIMAS no mesmo ano-modelo ${year}, em todo o Brasil.
3. Se ainda houver menos de 3 referências, aceite somente semelhantes muito próximos do mesmo modelo/família e mesma motorização/powertrain nos anos-modelo ${year - 1} ou ${year + 1}.

REGRAS PARA SEMELHANTES
- Um semelhante precisa ser tecnicamente próximo: mesmo modelo/família, mesma carroceria e mesma motorização ou conjunto híbrido/elétrico equivalente.
- Exemplo: não compare Kona HEV com Kona apenas a combustão se o conjunto mecânico for diferente.
- Não compare SUV com hatch/sedan diferente só porque a faixa de preço é próxima.
- Não use modelo concorrente de outra marca como semelhante nesta contingência.
- Marque cada anúncio como matchType="exact" quando for a mesma versão e ano-modelo alvo.
- Marque como matchType="similar" quando for versão próxima ou ano adjacente e explique em similarityReason.
- Se houver pelo menos 3 EXATOS encontrados nacionalmente, retorne preferencialmente os exatos e não precisa completar com semelhantes.
- Se precisar usar semelhantes, deixe isso explícito. Eles são referência de mercado, não equivalência perfeita.

NOMENCLATURA
- Expanda abreviações internas antes de pesquisar. Ex.: LGTD=Longitude, LTD=Limited, AT/AUT=automático.
- Preserve o modelo real e interprete corretamente nomes comerciais completos.

MERCADO / OFERTA
- Só informe marketOfferCount se uma fonte exibir explicitamente a quantidade para filtros equivalentes do veículo ALVO exato.
- Não estime a oferta com base nos semelhantes.
- Procure deliberadamente os menores preços válidos.
- Retorne no máximo 20 anúncios, ordenados do menor para o maior preço.

RETORNE APENAS JSON VÁLIDO:
{
  "comparables": [
    {
      "source": "Webmotors",
      "title": "título resumido do anúncio",
      "price": 150000,
      "year": ${year},
      "km": 12000,
      "location": "Curitiba, PR",
      "url": null,
      "matchType": "exact",
      "similarityReason": ""
    },
    {
      "source": "iCarros",
      "title": "versão próxima do mesmo modelo e powertrain",
      "price": 148000,
      "year": ${year + 1},
      "km": 9000,
      "location": "Belo Horizonte, MG",
      "url": null,
      "matchType": "similar",
      "similarityReason": "mesmo modelo e powertrain, versão próxima / ano-modelo adjacente"
    }
  ],
  "marketOfferCount": 0,
  "marketOfferSource": "",
  "notes": "resumo curto do alcance da pesquisa ampliada"
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

    const valid = rawComparables
      .map((item) => {
        const parsedYear = toModelYear(item.year) || 0;
        const rawMatch = String(item.matchType || '').toLowerCase();
        const inferredExact = parsedYear === year && rawMatch !== 'similar';
        return {
          source: String(item.source || '').trim() || 'Web',
          title: String(item.title || '').trim() || model,
          price: toNumber(item.price),
          year: parsedYear,
          km: toNumber(item.km) || 0,
          location: String(item.location || '').trim(),
          url: item.url ? String(item.url) : '',
          matchType: (rawMatch === 'exact' || inferredExact ? 'exact' : 'similar') as MatchType,
          similarityReason: String(item.similarityReason || '').trim(),
        };
      })
      .filter(item => item.price >= 10000 && item.price <= 2000000)
      .filter(item => item.year >= year - 1 && item.year <= year + 1)
      .filter(item => !fipe || item.price <= fipe)
      .filter(item => !isExcludedSource(item.source, item.url));

    const exact = valid.filter(item => item.matchType === 'exact' && item.year === year);
    const similar = valid.filter(item => item.matchType === 'similar');
    const preferredExact = exact.filter(item => isPreferredSource(item.source, item.url));
    const preferredSimilar = similar.filter(item => isPreferredSource(item.source, item.url));

    let searchScope: 'national_exact' | 'national_similar' = 'national_similar';
    let sourcePool = valid;
    if (exact.length >= 3) {
      searchScope = 'national_exact';
      sourcePool = preferredExact.length >= 3 ? preferredExact : exact;
    } else {
      const orderedFallback = [...preferredExact, ...exact.filter(item => !isPreferredSource(item.source, item.url)), ...preferredSimilar, ...similar.filter(item => !isPreferredSource(item.source, item.url))];
      const seen = new Set<string>();
      sourcePool = orderedFallback.filter(item => {
        const key = `${item.source}|${item.title}|${item.price}|${item.year}|${item.location}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    const initialMedian = median(sourcePool.map(item => item.price));
    const cleaned = initialMedian
      ? sourcePool.filter(item => item.price >= initialMedian * 0.70 && item.price <= initialMedian * 1.30)
      : sourcePool;
    const sample = cleaned.length >= 3 ? cleaned : sourcePool;

    const prices = sample.map(item => item.price).sort((a, b) => a - b);
    const marketMedian = median(prices);
    const low = prices.length ? prices[0] : 0;
    const high = prices.length ? prices[prices.length - 1] : 0;
    const lowerBandCount = prices.length ? Math.min(prices.length, Math.max(3, Math.ceil(prices.length * 0.30))) : 0;
    const observed = median(prices.slice(0, lowerBandCount)) || marketMedian || 0;

    const reportedOfferCount = Math.max(0, Math.round(toNumber(parsed?.marketOfferCount)));
    const offerLevel = reportedOfferCount >= 30 ? 'high' : reportedOfferCount >= 12 ? 'medium' : 'low';
    const offerSource = String(parsed?.marketOfferSource || '').trim();
    const offerWarning = reportedOfferCount >= 30
      ? `ALTA OFERTA NO MERCADO: ${reportedOfferCount} anúncios equivalentes identificados. Cautela na compra: muita oferta aumenta a concorrência, pressiona os preços e pode alongar o giro.`
      : reportedOfferCount >= 12
        ? `Oferta relevante no mercado: ${reportedOfferCount} anúncios equivalentes identificados. Avalie preço de entrada e giro com atenção.`
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
        expandedSearch: {
          used: true,
          scope: 'national_similar',
          exactCount: 0,
          similarCount: 0,
          warning: 'A pesquisa foi ampliada para todo o Brasil e para veículos semelhantes do mesmo modelo/powertrain, mas ainda não houve amostra verificável suficiente.',
        },
        marketSupply: { level: offerLevel, count: reportedOfferCount, reported: Boolean(reportedOfferCount), source: offerSource, warning: offerWarning },
        notes: `Pesquisa ampliada concluída sem amostra suficiente. ${String(parsed?.notes || '').trim()}`.trim(),
        sources,
        searchQueries: grounding?.webSearchQueries || [],
      });
    }

    const exactInSample = sample.filter(item => item.matchType === 'exact').length;
    const similarInSample = sample.filter(item => item.matchType === 'similar').length;
    const sourceDomains = new Set([
      ...sample.map(item => String(item.source || '').toLowerCase()).filter(Boolean),
      ...sources.map((item: any) => domainOf(item.url)).filter(Boolean),
    ]);

    const confidence = searchScope === 'national_exact'
      ? (sample.length >= 8 && sourceDomains.size >= 3 ? 'high' : sample.length >= 4 && sourceDomains.size >= 2 ? 'medium' : 'low')
      : 'low';

    const fallbackWarning = searchScope === 'national_exact'
      ? 'A região local tinha poucos comparáveis. O MarketScan ampliou a busca geográfica e encontrou veículos exatos em outras regiões do Brasil.'
      : `Amostra exata insuficiente. O MarketScan ampliou a busca para todo o Brasil e incluiu ${similarInSample} semelhante(s) tecnicamente próximo(s). Use estes semelhantes como referência complementar, não como equivalência perfeita.`;

    const noteParts = [
      fallbackWarning,
      exactInSample ? `${exactInSample} anúncio(s) exato(s) na amostra.` : '',
      similarInSample ? `${similarInSample} semelhante(s) identificado(s).` : '',
      fipe ? `Nenhum preço acima da FIPE de R$ ${fipe.toLocaleString('pt-BR')} foi usado.` : '',
      'Facebook e Mercado Livre foram excluídos.',
      `Base de precificação: ${lowerBandCount} menor(es) preço(s) válido(s) da amostra ampliada.`,
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
      expandedSearch: {
        used: true,
        scope: searchScope,
        exactCount: exactInSample,
        similarCount: similarInSample,
        warning: fallbackWarning,
      },
      marketSupply: { level: offerLevel, count: reportedOfferCount, reported: Boolean(reportedOfferCount), source: offerSource, warning: offerWarning },
      notes: noteParts.join(' '),
      sources,
      searchQueries: grounding?.webSearchQueries || [],
    });
  } catch (error: any) {
    console.error('Motyq MarketScan expanded error:', error?.message || error);
    return res.status(500).json({ error: 'Não foi possível ampliar a pesquisa de mercado agora. Tente novamente.' });
  }
}
