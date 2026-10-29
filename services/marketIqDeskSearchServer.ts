// Pesquisa automática sem chave: Tavily Keyless (uso gratuito limitado).
// Apenas snippets públicos indexados. Não consulta placas nem contorna bloqueios dos classificados.
const string = (value: unknown) => String(value ?? '').trim();
const normalize = (value: string) => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
type Source = 'webmotors' | 'olx';
const portal = (raw: string): Source | null => {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase(), path = u.pathname.toLowerCase();
    if ((host === 'webmotors.com.br' || host.endsWith('.webmotors.com.br')) && path.startsWith('/comprar/')) return 'webmotors';
    if ((host === 'olx.com.br' || host.endsWith('.olx.com.br')) && /autos-e-pecas|carros-vans-e-utilitarios|-id-\d{7,}/.test(path)) return 'olx';
    return null;
  } catch { return null; }
};
const priceOf = (text: string) => {
  const found = text.match(/R\$\s*((?:\d{1,3}\.){1,2}\d{3})(?:,\d{2})?/i);
  const value = found ? Number(found[1].replace(/\./g, '')) : 0;
  return value >= 15000 && value <= 2000000 ? value : 0;
};
const kmOf = (text: string) => {
  const compact = text.match(/\b(\d{1,3}(?:\.\d{3})+|\d{4,6})\s*(?:km|quil[oô]metros)\b/i);
  if (compact) return Number(compact[1].replace(/\./g, ''));
  const thousands = text.match(/\b(\d{1,3})(?:[,.](\d))?\s*mil\s*(?:km|quil[oô]metros)\b/i);
  return thousands ? Number(thousands[1]) * 1000 + Number(thousands[2] || 0) * 100 : 0;
};
const riskWords = /leil[aã]o|sinistr|recuperad|batid|salvado|sucata|cons[oó]rcio|parcela|entrada/i;
const search = async (query: string, domain: string) => {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'X-Tavily-Access-Mode': 'keyless',
      'X-Client-Source': 'tavily-mcp-keyless',
      'X-Session-Id': 'motyq-iq-market-preview',
    },
    body: JSON.stringify({ query, search_depth: 'basic', topic: 'general', max_results: 10, include_domains: [domain], include_raw_content: false }),
    signal: AbortSignal.timeout(16000),
  });
  if (response.status === 401 || response.status === 402 || response.status === 429) {
    throw new Error('Cota gratuita de pesquisa temporariamente indisponível (HTTP ' + response.status + ').');
  }
  if (!response.ok) throw new Error('Pesquisa web falhou (HTTP ' + response.status + ').');
  const data = await response.json() as any;
  return Array.isArray(data?.results) ? data.results : [];
};

export default async function marketIqDeskSearchServer(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const brand = string(req.body?.brand).slice(0, 60);
  const model = string(req.body?.model).slice(0, 140);
  const year = Number(req.body?.year);
  const km = Number(req.body?.km);
  if (!brand || !model || !Number.isInteger(year) || year < 1990 || year > 2100 || !Number.isFinite(km) || km <= 0)
    return res.status(400).json({ error: 'Selecione marca, versão, ano e quilometragem antes da pesquisa.' });
  const queryBase = brand + ' ' + model + ' ' + year + ' preço R$ km carro usado';
  const lookups = await Promise.allSettled([
    search(queryBase + ' site:webmotors.com.br/comprar', 'webmotors.com.br'),
    search(queryBase + ' site:olx.com.br', 'olx.com.br'),
  ]);
  const complete = lookups.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const failed = lookups.filter(result => result.status === 'rejected') as PromiseRejectedResult[];
  if (!complete.length && failed.length === 2) {
    const detail = failed.map(x => String(x.reason?.message || '')).filter(Boolean).join(' / ');
    return res.status(503).json({ error: 'A pesquisa gratuita está indisponível. ' + detail.slice(0, 240) });
  }
  const modelTokens = normalize(model).split(/[^a-z0-9]+/).filter(Boolean);
  const coreModel = modelTokens[0] || '';
  const trimToken = modelTokens.slice(1).find(token =>
    token.length >= 4 && !['flex','auto','automatico','manual','turbo','diesel','gasolina','hibrido','eletrico','motor','sedan','hatch'].includes(token));
  const seen = new Set<string>();
  const ads = complete.map((item: any) => {
    const url = string(item?.url);
    const source = portal(url);
    const title = string(item?.title).slice(0, 180);
    const snippet = string(item?.content).slice(0, 2200);
    const text = title + ' ' + snippet;
    const normalizedText = normalize(text + ' ' + url);
    const price = priceOf(text), adKm = kmOf(text);
    if (!source || !coreModel || !normalizedText.includes(coreModel)) return null;
    if (trimToken && !normalizedText.includes(trimToken)) return null;
    if (!normalizedText.includes(String(year))) return null;
    if (!price || !adKm || Math.abs(adKm - km) > 50000 || riskWords.test(title + ' ' + snippet)) return null;
    const cleanUrl = url.split('?')[0];
    if (seen.has(cleanUrl)) return null;
    seen.add(cleanUrl);
    return { source, title, url: cleanUrl, price, km: adKm, year,
      evidence: snippet.slice(0, 220), confidence: 'candidate' };
  }).filter(Boolean).sort((a: any, b: any) => a.price - b.price).slice(0, 20);
  return res.status(200).json({
    ads, searchedAt: new Date().toISOString(), provider: 'Tavily Keyless · busca web gratuita',
    warning: 'Dados extraídos de trechos indexados, não diretamente da página do anunciante. Conferência do anúncio necessária antes de aprovar compra.',
    sourcesChecked: lookups.map((result, i) => ({ source: i === 0 ? 'Webmotors' : 'OLX', available: result.status === 'fulfilled' })),
  });
}
