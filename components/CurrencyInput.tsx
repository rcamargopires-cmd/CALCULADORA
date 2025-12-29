import React from 'react';

interface CurrencyInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  textColor?: string; // Custom text color class
}

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

  const formattedValue = value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2
  });

  // Default to white if no color provided, otherwise use provided color
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