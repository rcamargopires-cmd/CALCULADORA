import { GoogleGenAI } from '@google/genai';

// Pesquisa via Google Search Grounding já utilizada pelo MarketScan do Motyq.
// Não acessa páginas restritas dos classificados, nem presume histórico limpo.
const normalize = (value: unknown) => String(value ?? '').trim();
const n = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = normalize(value).replace(/R\$/gi, '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  return Number(raw) || 0;
};
const json = (text: string): any => {
  const clean = text.replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(clean); } catch {}
  const first = clean.indexOf('{'), last = clean.lastIndexOf('}');
  if (first !== -1 && last > first) { try { return JSON.parse(clean.slice(first, last + 1)); } catch {} }
  return null;
};
const portal = (raw: string): 'webmotors' | 'olx' | null => {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') return null;
    if ((host === 'webmotors.com.br' || host.endsWith('.webmotors.com.br')) && url.pathname.toLowerCase().startsWith('/comprar/')) return 'webmotors';
    if ((host === 'olx.com.br' || host.endsWith('.olx.com.br')) &&
        /(?:autos-e-pecas|carros-vans-e-utilitarios|\bid-\d{7,})/i.test(url.pathname)) return 'olx';
    return null;
  } catch { return null; }
};
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  try {
    const bearer = normalize(req.headers?.authorization);
    const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Entre novamente no Motyq.' });
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'Pesquisa Google do MarketScan não está configurada.' });
    const brand = normalize(req.body?.brand).slice(0, 60);
    const model = normalize(req.body?.model).slice(0, 180);
    const year = Math.round(n(req.body?.year));
    const km = Math.round(n(req.body?.km));
    if (!brand || !model || year < 1990 || year > 2100 || km < 1) return res.status(400).json({ error: 'Selecione marca, versão, ano e quilometragem antes de pesquisar.' });
    const prompt = [
      'Você é o MarketScan do Motyq IQ. Use a ferramenta Google Search AGORA para localizar anúncios públicos individuais e atuais de carros usados no Brasil.',
      'Marca: ' + brand + '. Modelo e versão EXATOS: ' + model + '. Ano-modelo: ' + year + '. KM do veículo: ' + km + '.',
      'Priorize Webmotors, depois OLX. Faça pesquisa real, até 10 anúncios individuais de cada portal.',
      'IMPORTANTE: cada anúncio deve ter URL HTTPS DIRETA e específica do anúncio, não uma página de busca, não link de redirecionamento e não link inventado.',
      'Só devolva preço total anunciado, quilometragem e ano quando aparecerem explicitamente no resultado indexado. Não estime, não complete lacunas, não invente anúncios.',
      'Aceite apenas a mesma marca, linha/modelo, motorização, transmissão, versão e ano-modelo. Não misture Creta Attitude com Action, Pulse ou Platinum.',
      'Não inclua leilão, sinistro, recuperação, batido, entrada, parcelas, consórcio ou publicidade sem preço integral.',
      'Retorne no máximo 20 anúncios ordenados por preço, somente JSON no formato:',
      '{"ads":[{"title":"Hyundai Creta Attitude 1.6 AT 2020","url":"https://www.webmotors.com.br/comprar/...","price":85000,"km":47000,"year":2020,"evidence":"texto curto visto no resultado indexado"}]}',
      'Se não conseguir uma URL direta, preço, ano e KM de uma oferta real, omita esse anúncio e retorne lista vazia. Não inclua valores de exemplo.'
    ].join('\n');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const reply = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], temperature: 0.1 },
    });
    const grounded = (reply as any)?.candidates?.[0]?.groundingMetadata;
    const queries = Array.isArray(grounded?.webSearchQueries) ? grounded.webSearchQueries : [];
    const parsed = json(normalize(reply.text));
    // Sem evidência de pesquisa de fato executada, não retornar valores gerados pelo modelo.
    const raw: any[] = queries.length && Array.isArray(parsed?.ads) ? parsed.ads : [];
    const targetModel = model.split(/\s+/)[0]?.toLowerCase() || '';
    const dedupe = new Set<string>();
    const ads = raw.map((item: any) => {
      const url = normalize(item?.url);
      const source = portal(url);
      const title = normalize(item?.title).slice(0, 180);
      const price = n(item?.price), adKm = Math.round(n(item?.km)), adYear = Math.round(n(item?.year));
      const text = (title + ' ' + decodeURIComponent(url.split('?')[0])).toLowerCase();
      if (!source || !title || !targetModel || !text.includes(targetModel)) return null;
      if (price < 15000 || price > 2000000 || adKm < 1 || adKm > 900000 || adYear !== year) return null;
      if (/leil[aã]o|sinistr|recuperad|batid|salvado|sucata|cons[oó]rcio|entrada|parcela/i.test(title + ' ' + normalize(item?.evidence))) return null;
      const key = url.toLowerCase().split('?')[0];
      if (dedupe.has(key)) return null;
      dedupe.add(key);
      return { source, title, url, price, km: adKm, year: adYear, evidence: normalize(item?.evidence).slice(0, 220),
        confidence: 'candidate' as const };
    }).filter(Boolean).sort((a: any, b: any) => a.price - b.price).slice(0, 20);
    return res.status(200).json({
      ads,
      searchedAt: new Date().toISOString(),
      provider: 'MarketScan · Google Search',
      warning: 'Preços localizados por pesquisa indexada. A existência e os dados de cada anúncio ainda exigem conferência da página; nenhuma oferta é validada automaticamente para decisão final.',
      queries: queries.slice(0, 10),
    });
  } catch (error: any) {
    console.error('MarketIQ desk search failed:', error?.message || error);
    return res.status(502).json({ error: 'A pesquisa automática está indisponível agora. Nenhum preço foi inventado.' });
  }
}
