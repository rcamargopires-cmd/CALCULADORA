import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

type Notice = { kind: 'ok' | 'warn'; text: string } | null;

const UnifiedStockAuditNotice: React.FC = () => {
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    let timer: number | undefined;
    const show = (next: Notice) => {
      setNotice(next);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setNotice(null), 6500);
    };
    const onSuccess = (event: Event) => {
      const detail = (event as CustomEvent<{ stockCount?: number; auditCount?: number }>).detail || {};
      show({ kind: 'ok', text: `Estoque substituído: ${detail.stockCount || 0} veículos · Auditoria Site: ${detail.auditCount || 0} registros atualizados.` });
    };
    const onWarning = () => show({ kind: 'warn', text: 'O estoque foi atualizado, mas a aba Auditoria Site precisa ser revisada ou importada novamente.' });
    window.addEventListener('motyq:unified-stock-audit-imported', onSuccess);
    window.addEventListener('motyq:unified-stock-audit-warning', onWarning);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('motyq:unified-stock-audit-imported', onSuccess);
      window.removeEventListener('motyq:unified-stock-audit-warning', onWarning);
    };
  }, []);

  if (!notice) return null;
  const ok = notice.kind === 'ok';
  return <div className={`fixed bottom-5 left-1/2 z-[800] flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl ${ok ? 'border-emerald-300/25 bg-emerald-950/95 text-emerald-100' : 'border-amber-300/25 bg-amber-950/95 text-amber-100'}`}>
    {ok ? <CheckCircle2 size={19} className="mt-0.5 shrink-0"/> : <AlertTriangle size={19} className="mt-0.5 shrink-0"/>}
    <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.14em] opacity-70">MOTYQ · IMPORTAÇÃO</p><p className="mt-1 text-sm font-semibold leading-5">{notice.text}</p></div>
    <button onClick={() => setNotice(null)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/5"><X size={14}/></button>
  </div>;
};

export default UnifiedStockAuditNotice;
