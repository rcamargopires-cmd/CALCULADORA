type FipeBrand = { codigo: string | number; nome: string };
type FipeModel = { codigo: string | number; nome: string };
type FipeYear = { codigo: string; nome: string };

export type MarketIqFipeResult = {
  value: number;
  brand: string;
  model: string;
  year: number;
  fuel: string;
  referenceMonth: string;
  fipeCode: string;
  confidence: number;
};

const BASE = 'https://parallelum.com.br/fipe/api/v1/carros';
const cache = new Map<string, any>();
const clean = (value: string) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const canonicalBrand = (value: string) => clean(value)
  .replace(/^vw\s+volkswagen$/, 'volkswagen')
  .replace(/^gm\s+chevrolet$/, 'chevrolet')
  .replace(/^mercedes\s+benz$/, 'mercedes benz');
const tokens = (value: string) => clean(value).split(' ').filter(Boolean).filter(t => !new Set(['flex','gasolina','alcool','diesel','automatico','aut','mec','manual','cv','16v','8v','4p','5p']).has(t));
const scoreText = (target: string, candidate: string) => {
  const a = tokens(target); const b = tokens(candidate);
  if (!a.length || !b.length) return 0;
  let score = 0;
  for (const t of a) {
    if (b.includes(t)) score += /^\d/.test(t) ? 1.5 : 1;
    else if (b.some(x => x.includes(t) || t.includes(x))) score += 0.45;
  }
  const denom = a.reduce((s,t)=>s+( /^\d/.test(t) ? 1.5 : 1),0);
  return Math.min(1, score / Math.max(1, denom));
};
const getJson = async (url: string) => {
  if (cache.has(url)) return cache.get(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`FIPE HTTP ${response.status}`);
  const data = await response.json();
  cache.set(url, data);
  return data;
};
const parseValue = (value: string) => Number(String(value || '').replace(/[^0-9,]/g,'').replace(',','.')) || 0;
const modelYearFrom = (value: string) => {
  const matches = String(value || '').match(/(?:19|20)\d{2}/g) || [];
  return matches.length ? Number(matches[matches.length - 1]) : 0;
};

export const marketIqFipeResolver = {
  resolve: async (input: { brand: string; model: string; year: string; fuel?: string }): Promise<MarketIqFipeResult | null> => {
    try {
      const brands = await getJson(`${BASE}/marcas`) as FipeBrand[];
      const wantedBrand = canonicalBrand(input.brand);
      let brand = brands.find(item => canonicalBrand(item.nome) === wantedBrand);
      if (!brand) brand = brands.sort((a,b)=>scoreText(input.brand,b.nome)-scoreText(input.brand,a.nome))[0];
      if (!brand || scoreText(input.brand, brand.nome) < 0.45) return null;

      const modelPayload = await getJson(`${BASE}/marcas/${brand.codigo}/modelos`);
      const models = (modelPayload?.modelos || []) as FipeModel[];
      const ranked = models.map(item => ({ item, score: scoreText(input.model, item.nome) })).sort((a,b)=>b.score-a.score);
      const best = ranked[0];
      if (!best || best.score < 0.42) return null;

      const years = await getJson(`${BASE}/marcas/${brand.codigo}/modelos/${best.item.codigo}/anos`) as FipeYear[];
      const targetYear = modelYearFrom(input.year);
      const yearCandidates = years.filter(item => !targetYear || String(item.codigo).startsWith(`${targetYear}-`) || String(item.nome).includes(String(targetYear)));
      const chosenYears = yearCandidates.length ? yearCandidates : years.slice(0, 3);
      const fuelWanted = clean(input.fuel || '');
      let bestDetail: any = null;
      let bestFuelScore = -1;
      for (const year of chosenYears.slice(0, 4)) {
        const detail = await getJson(`${BASE}/marcas/${brand.codigo}/modelos/${best.item.codigo}/anos/${year.codigo}`);
        const fuelScore = fuelWanted && clean(detail?.Combustivel || '').includes(fuelWanted.split(' ')[0]) ? 1 : 0;
        if (!bestDetail || fuelScore > bestFuelScore) { bestDetail = detail; bestFuelScore = fuelScore; }
      }
      if (!bestDetail) return null;
      return {
        value: parseValue(bestDetail.Valor),
        brand: String(bestDetail.Marca || brand.nome),
        model: String(bestDetail.Modelo || best.item.nome),
        year: Number(bestDetail.AnoModelo || targetYear || 0),
        fuel: String(bestDetail.Combustivel || ''),
        referenceMonth: String(bestDetail.MesReferencia || ''),
        fipeCode: String(bestDetail.CodigoFipe || ''),
        confidence: best.score,
      };
    } catch (error) {
      console.warn('Motyq MarketIQ: falha ao resolver FIPE por metadados.', error);
      return null;
    }
  },
};
