import React from 'react';
import { Check, AlertCircle } from 'lucide-react';

interface TextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  maxLength?: number;
  isValid?: boolean | null;
}

const TextInput: React.FC<TextInputProps> = ({ 
  label, 
  value, 
  onChange, 
  className = "",
  placeholder = "",
  maxLength,
  isValid = null
}) => {
  
  let borderColor = "border-zinc-700";
  let ringColor = "focus:ring-amber-400";
  let icon = null;

  if (isValid === true) {
    borderColor = "border-green-500/50";
    ringColor = "focus:ring-green-500";
    icon = <Check size={16} className="text-green-500" />;
  } else if (isValid === false) {
    borderColor = "border-red-500/50";
    ringColor = "focus:ring-red-500";
    icon = <AlertCircle size={16} className="text-red-500" />;
  }

  return (
    <div className={`flex flex-col ${className}`}>
      <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1 flex justify-between items-center">
        {label}
        {isValid === false && <span className="text-red-400 text-[10px]">Formato Inválido</span>}
      </label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className={`w-full border ${borderColor} bg-zinc-800 rounded px-3 py-2 text-left font-mono text-white focus:outline-none focus:ring-2 ${ringColor} shadow-sm transition-all placeholder-zinc-600 uppercase pr-10`}
        />
        {icon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

export default TextInput;