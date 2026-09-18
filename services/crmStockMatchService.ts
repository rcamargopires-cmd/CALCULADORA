import type { GroupStockItem } from './groupStockService';

export type CrmStockMatch = {
  item: GroupStockItem;
  score: number;
  kind: 'exact' | 'similar';
};

const normalize = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const STOP = new Set([
  'quero','procuro','procurando','interesse','interessado','interessada','cliente','carro','veiculo',
  'um','uma','de','do','da','dos','das','com','sem','para','ate','até','valor','faixa','preco','preço',
  'reais','mil','aproximadamente','mais','menos','suv','sedan','hatch',
]);

const tokensOf = (value: string) => normalize(value)
  .split(' ')
  .filter(Boolean)
  .filter(token => !STOP.has(token))
  .filter(token => /^[a-z]{2,}$/.test(token) || /^20\d{2}$/.test(token));

const parseBudget = (interest: string) => {
  const value = normalize(interest);
  const mil = value.match(/(?:ate\s+)?(\d{2,3})\s*mil\b/);
  if (mil) return Number(mil[1]) * 1000;
  const money = value.match(/(?:r\$\s*)?(\d{5,6})\b/);
  return money ? Number(money[1]) : 0;
};

export const isGroupStockAvailable = (item: GroupStockItem) => {
  const status = normalize(item.status);
  if (!status) return true;
  return !['bloquead','vendid','faturad','cancelad','baixad','proposta','pedido']
    .some(term => status.includes(term));
};

const itemText = (item: GroupStockItem) => normalize([
  item.brand,item.model,item.year,item.transmission,item.fuel,item.color,
].filter(Boolean).join(' '));

export const matchGroupStock = (
  items: GroupStockItem[],
  interest: string,
  limit = 5,
): CrmStockMatch[] => {
  const desired = String(interest || '').trim();
  const wantedTokens = tokensOf(desired);
  if (!desired || !wantedTokens.length) return [];

  const budget = parseBudget(desired);
  const desiredNorm = normalize(desired);

  return items
    .filter(isGroupStockAvailable)
    .map(item => {
      const haystack = itemText(item);
      const matched = wantedTokens.filter(token => haystack.includes(token));
      if (!matched.length) return null;

      const coverage = matched.length / wantedTokens.length;
      const phraseHit = desiredNorm.length >= 4 && haystack.includes(desiredNorm);
      let score = phraseHit ? 1 : coverage;

      // One distinctive model token such as "creta", "nivus" or "kardian" is already a strong hit.
      if (wantedTokens.length === 1 && matched.length === 1) score = Math.max(score, 0.92);

      // Respect an explicit budget when the shared stock has a suggested price.
      if (budget && Number(item.suggestedPrice || 0)) {
        const price = Number(item.suggestedPrice || 0);
        if (price <= budget) score += 0.05;
        else if (price > budget * 1.12) score -= 0.18;
      }

      score = Math.max(0, Math.min(1, score));
      if (score < 0.5) return null;
      return { item, score, kind: score >= 0.72 ? 'exact' : 'similar' } as CrmStockMatch;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const left = a as CrmStockMatch;
      const right = b as CrmStockMatch;
      return right.score - left.score
        || Number(left.item.suggestedPrice || 0) - Number(right.item.suggestedPrice || 0)
        || Number(left.item.days || 0) - Number(right.item.days || 0);
    })
    .slice(0, Math.max(1, limit)) as CrmStockMatch[];
};
