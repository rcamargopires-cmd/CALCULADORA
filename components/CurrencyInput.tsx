import React, { useEffect } from 'react';

interface CurrencyInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  textColor?: string;
}

const normalizeLabel = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const CurrencyInput: React.FC<CurrencyInputProps> = ({
  label,
  value,
  onChange,
  disabled = false,
  className = "",
  placeholder = "R$ 0,00",
  textColor
}) => {

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    const numericValue = Number(rawValue) / 100;
    onChange(numericValue);
  };

  useEffect(() => {
    if (normalizeLabel(label) !== 'custo do veiculo') return;
    const fill = (event: Event) => {
      const next = Number((event as CustomEvent<{ vehicleCost?: number }>).detail?.vehicleCost);
      if (Number.isFinite(next)) onChange(Math.max(0, next));
    };
    const clear = () => onChange(0);
    window.addEventListener('motyq:group-stock-fill', fill);
    window.addEventListener('motyq:group-stock-clear', clear);
    return () => {
      window.removeEventListener('motyq:group-stock-fill', fill);
      window.removeEventListener('motyq:group-stock-clear', clear);
    };
  }, [label, onChange]);

  const formattedValue = value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2
  });

  const inputTextColor = textColor || "text-white";

  return (
    <div className={`flex flex-col ${className}`}>
      <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">
        {label}
      </label>
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={value === 0 ? '' : formattedValue}
        onChange={handleChange}
        placeholder={placeholder}
        className={`w-full border border-zinc-700 bg-zinc-800 rounded px-3 py-2 text-right font-mono ${inputTextColor} focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-zinc-900 disabled:text-zinc-600 shadow-sm transition-all placeholder-zinc-600`}
      />
    </div>
  );
};

export default CurrencyInput;