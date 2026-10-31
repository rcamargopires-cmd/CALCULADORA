/**
 * Motyq IQ · preço-alvo histórico experimental (apenas preview).
 *
 * Treinado em outubro/2026 com 223 aquisições de status UTILIZADO, únicas,
 * excluindo o avaliador indicado, motocicletas e 1 valor pago inválido.
 * Somente coeficientes agregados entram no código. Nenhuma avaliação individual.
 * As duas compras confirmadas manualmente foram mantidas fora do treino.
 *
 * Ridge alpha=1 em preço pago/FIPE. GroupKFold(5) por modelo:
 * MAE R$ 3.785; mediana R$ 2.785; percentil 80 de |erro|/FIPE = 5,89%.
 * Amostra de 1 mês, várias lojas. Não é oferta vinculante nem aprovação.
 */
export type HistoricalClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'SEM CLASSE';
export type HistoricalDestination = 'SHOWROOM' | 'REPASSE';

export interface HistoricalPriceInput {
  fipe: number;
  modelYear: number;
  km: number;
  preparation: number;
  destination: HistoricalDestination;
  classification: HistoricalClass;
}

export interface HistoricalPriceResult {
  target: number;
  rangeMin: number;
  rangeMax: number;
  fipeFraction: number;
  uncertainty: number;
  sampleSize: number;
  classSampleSize: number;
  confidence: 'medium' | 'low';
  warnings: string[];
  modelVersion: string;
}

const classCoefficient: Record<HistoricalClass, number> = {
  A: 0.0087916449,
  B: -0.0043966968,
  C: -0.0148171088,
  D: -0.0289000598,
  E: -0.0004079186,
  'SEM CLASSE': 0.0397301391,
};
const classCount: Record<HistoricalClass, number> = {
  A: 23, B: 72, C: 71, D: 42, E: 8, 'SEM CLASSE': 7,
};
const clamp = (v: number, lower: number, upper: number) => Math.min(upper, Math.max(lower, v));
const round100 = (v: number) => Math.round(v / 100) * 100;

export const MOTYQ_HISTORY_MODEL = {
  version: '2026-10-piloto-1',
  purchases: 223,
  crossValidationMethod: 'GroupKFold(5) por modelo de veículo',
  crossValidationMae: 3785,
  crossValidationMedianAbsoluteError: 2785,
  crossValidation80PctAbsErrorPerFipe: 0.0589,
  // Não equivale a 80% de certeza para uma avaliação individual.
} as const;

export function calculateHistoricalPrice(input: HistoricalPriceInput): HistoricalPriceResult | null {
  const { fipe, modelYear, km, destination, classification } = input;
  const preparation = Number(input.preparation || 0);
  if (!Number.isFinite(fipe) || fipe < 15000 || !Number.isFinite(km) || km <= 0 ||
      !Number.isFinite(modelYear) || modelYear < 1980 || modelYear > 2028 ||
      !Number.isFinite(preparation) || preparation < 0 || !(classification in classCoefficient) ||
      !['SHOWROOM','REPASSE'].includes(destination)) return null;

  const age = clamp(2026 - modelYear, 0, 20);
  const m = clamp(km, 0, 220000);
  const preparationRate = clamp(preparation / fipe, 0, 0.15) / 0.05;

  const ratio = 0.8092829610
    + (destination === 'SHOWROOM' ? 0.0425368420 : 0.0012028903)
    + classCoefficient[classification]
    - 0.0258872217 * clamp(age, 0, 2) / 2
    + 0.0060400744 * clamp(age - 2, 0, 3) / 3
    - 0.0206655870 * clamp(age - 5, 0, 4) / 4
    - 0.1158938357 * clamp(age - 9, 0, 10) / 10
    - 0.0141184119 * clamp(m, 0, 50000) / 50000
    - 0.0078619067 * clamp(m - 50000, 0, 50000) / 50000
    - 0.0961060302 * clamp(m - 100000, 0, 60000) / 60000
    - 0.0647385133 * clamp(m - 160000, 0, 60000) / 60000
    - 0.0070544683 * (Math.log(Math.max(12000, fipe)) - Math.log(90000))
    - 0.0241855553 * preparationRate;

  const warnings: string[] = [];
  const scarceClass = classCount[classification] < 15;
  if (scarceClass) warnings.push('Poucos veículos dessa classificação na amostra.');
  if (age >= 10) warnings.push('Veículo com 10 anos ou mais: maior incerteza.');
  if (km > 160000) warnings.push('Quilometragem alta: maior incerteza.');
  if (fipe > 241569 || fipe < 20056) warnings.push('FIPE fora da faixa histórica observada.');
  if (preparation / fipe > 0.15) warnings.push('Preparo acima da faixa usada no treinamento.');
  if (classification === 'SEM CLASSE') warnings.push('Classificação não informada reduz a precisão.');
  // Model trained only on purchases. A low price is not evidence of clean history.
  warnings.push('Não identifica leilão, sinistro ou avarias; inspeção e pesquisa de mercado continuam necessárias.');

  const target = round100(fipe * clamp(ratio, 0.30, 1.03));
  const broadening = 1 + (scarceClass ? 0.25 : 0) + (age >= 10 ? 0.20 : 0) +
    (km > 160000 ? 0.15 : 0) + ((fipe < 20056 || fipe > 241569) ? 0.25 : 0);
  const uncertainty = round100(Math.max(3000, fipe * MOTYQ_HISTORY_MODEL.crossValidation80PctAbsErrorPerFipe * broadening));
  return {
    target,
    rangeMin: Math.max(0, round100(target - uncertainty)),
    rangeMax: round100(target + uncertainty),
    fipeFraction: target / fipe,
    uncertainty,
    sampleSize: MOTYQ_HISTORY_MODEL.purchases,
    classSampleSize: classCount[classification],
    confidence: warnings.length > 1 ? 'low' : 'medium',
    warnings,
    modelVersion: MOTYQ_HISTORY_MODEL.version,
  };
}
