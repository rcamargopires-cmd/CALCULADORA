import React, { useEffect } from 'react';

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  min?: number;
}

const normalizeLabel = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const NumberInput: React.FC<NumberInputProps> = ({
  label,
  value,
  onChange,
  className = "",
  placeholder = "0",
  min = 0
}) => {

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    const numericValue = parseInt(rawValue, 10);
    onChange(isNaN(numericValue) ? 0 : numericValue);
  };

  useEffect(() => {
    if (normalizeLabel(label) !== 'dias de estoque') return;
    const fill = (event: Event) => {
      const next = Number((event as CustomEvent<{ stockDays?: number }>).detail?.stockDays);
      if (Number.isFinite(next)) onChange(Math.max(min, next));
    };
    const clear = () => onChange(0);
    window.addEventListener('motyq:group-stock-fill', fill);
    window.addEventListener('motyq:group-stock-clear', clear);
    return () => {
      window.removeEventListener('motyq:group-stock-fill', fill);
      window.removeEventListener('motyq:group-stock-clear', clear);
    };
  }, [label, min, onChange]);

  return (
    <div className={`flex flex-col ${className}`}>
      <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">
        {label}
      </label>
      <input
        type="text"
        inputMode="numeric"
        value={value === 0 ? '' : value}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full border border-zinc-700 bg-zinc-800 rounded px-3 py-2 text-right font-mono text-white focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-sm transition-all placeholder-zinc-600"
      />
    </div>
  );
};

export default NumberInput;