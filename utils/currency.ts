export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatPercentage = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
};

export const parseCurrencyInput = (value: string): number => {
  // Remove non-numeric characters except comma (decimal separator)
  const cleanValue = value.replace(/[^\d,]/g, '');
  // Replace comma with dot for parsing
  const dotValue = cleanValue.replace(',', '.');
  return parseFloat(dotValue) || 0;
};