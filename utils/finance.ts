
/**
 * Calcula a taxa de juros mensal dado o Valor Presente (PV), Pagamento (PMT) e Número de Parcelas (N).
 * Utiliza o método de Newton-Raphson para encontrar a taxa aproximada.
 * 
 * @param n Número de meses (prazo)
 * @param pmt Valor da parcela
 * @param pv Valor financiado (Present Value)
 * @returns Taxa mensal em decimal (ex: 0.015 para 1.5%) ou null se falhar
 */
export const calculateInterestRate = (n: number, pmt: number, pv: number): number | null => {
  if (n <= 0 || pmt <= 0 || pv <= 0) return null;

  // Chute inicial (ex: 2% ao mês)
  let rate = 0.02;
  const maxIterations = 50;
  const tolerance = 1e-6;

  for (let i = 0; i < maxIterations; i++) {
    // Fórmula do valor presente de uma anuidade:
    // PV = PMT * (1 - (1+r)^-n) / r
    // f(r) = PV - PMT * (1 - (1+r)^-n) / r  => Queremos encontrar r onde f(r) = 0
    
    // Para facilitar a derivada, usamos a fórmula rearranjada:
    // f(r) = PV * r * (1+r)^n - PMT * ((1+r)^n - 1)
    
    const pow = Math.pow(1 + rate, n);
    
    // Função f(rate)
    const f = pv * rate * pow - pmt * (pow - 1);
    
    // Derivada f'(rate)
    // Derivada aproximada ou analítica
    const df = pv * (pow + rate * n * Math.pow(1 + rate, n - 1)) - pmt * n * Math.pow(1 + rate, n - 1);

    const nextRate = rate - f / df;

    if (Math.abs(nextRate - rate) < tolerance) {
      return nextRate;
    }

    rate = nextRate;
  }

  return rate; // Retorna a melhor aproximação
};

export const calculateTotalInterest = (n: number, pmt: number, pv: number): number => {
  return (n * pmt) - pv;
};

/**
 * Calcula o valor da parcela (PMT) dado o Valor Presente, Taxa e Prazo.
 * @param pv Valor Presente (Financiado)
 * @param rate Taxa de juros mensal em decimal (ex: 0.0239 para 2.39%)
 * @param n Número de meses
 */
export const calculatePMT = (pv: number, rate: number, n: number): number => {
  if (rate <= 0) return pv / n;
  // PMT = PV * ( i * (1+i)^n ) / ( (1+i)^n - 1 )
  return pv * (rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1);
};

/**
 * Calcula o IOF estimado para Financiamento de Veículos (CDC) Pessoa Física.
 * Alíquota base atual (aprox): 0.38% fixo + 0.0082% ao dia (limitado a 365 dias).
 * 
 * @param amount Valor base para cálculo (Líquido + TAC)
 * @param months Prazo em meses
 * @returns Valor estimado do IOF
 */
export const calculateEstimatedIOF = (amount: number, months: number): number => {
  const fixedRate = 0.0038; // 0.38%
  
  // Cálculo simplificado de dias corridos (média 30 dias)
  const days = Math.min(months * 30, 365); 
  const dailyRate = 0.000082; // 0.0082% ao dia
  
  const iofTotalRate = fixedRate + (dailyRate * days);
  
  return amount * iofTotalRate;
};
