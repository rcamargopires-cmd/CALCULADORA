import React, { useEffect, useState } from 'react';
import { CheckCircle2, DatabaseZap, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { User } from '../types';
import { tenantSecurityMigrationService, TenantMigrationResult } from '../services/tenantSecurityMigrationService';

const TenantSecurityPanel: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preparedAt, setPreparedAt] = useState('');
  const [result, setResult] = useState<TenantMigrationResult | null>(null);
  const [error, setError] = useState('');

  const loadStatus = async () => {
    try {
      const status = await tenantSecurityMigrationService.getStatus();
      setPreparedAt(String(status?.preparedAt || ''));
      if (status?.result) setResult(status.result as TenantMigrationResult);
    } catch {}
  };

  useEffect(() => { if (open) loadStatus(); }, [open]);

  const prepare = async () => {
    setBusy(true); setError('');
    try {
      const next = await tenantSecurityMigrationService.prepareDefaultTenant();
      setResult(next);
      setPreparedAt(new Date().toISOString());
    } catch (cause: any) {
      setError(cause?.message || 'Não consegui preparar os dados antigos.');
    } finally { setBusy(false); }
  };

  if (currentUser.role !== 'admin') return null;
  const total = result ? Object.values(result).reduce((sum, value) => sum + Number(value || 0), 0) : 0;

  return <>
    <button onClick={() => setOpen(true)} className="fixed bottom-44 right-5 z-[137] flex items-center gap-2 rounded-full border border-emerald-400/20 bg-zinc-900 px-4 py-3 text-sm font-semibold text-emerald-300 shadow-2xl"><ShieldCheck size={18}/> Segurança</button>
    {open && <div className="fixed inset-0 z-[245] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={() => setOpen(false)}><div className="mx-auto w-full max-w-3xl overflow-hidden rounded-[34px] border border-white/10 bg-zinc-950 shadow-2xl" onClick={event => event.stopPropagation()}>
      <header className="flex items-center justify-between border-b border-white/10 p-5 md:p-6"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-300 text-black"><ShieldCheck size={21}/></div><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Tenant Security</p><h3 className="mt-1 text-xl font-semibold text-white">Preparar blindagem multiempresa</h3><p className="mt-1 text-xs text-zinc-500">Carimba o histórico antigo com Empresa + Unidade antes das novas regras do Firestore.</p></div></div><button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><X size={18}/></button></header>

      <div className="space-y-5 p-5 md:p-6">
        <section className={`rounded-[26px] border p-5 ${preparedAt ? 'border-emerald-500/20 bg-emerald-500/[0.055]' : 'border-amber-400/20 bg-amber-400/[0.055]'}`}>
          <div className="flex gap-3">{preparedAt ? <CheckCircle2 className="mt-0.5 text-emerald-300" size={19}/> : <DatabaseZap className="mt-0.5 text-amber-300" size={19}/>}<div><p className="font-semibold text-white">{preparedAt ? 'Histórico preparado' : 'Migração ainda não executada'}</p><p className="mt-1 text-sm leading-6 text-zinc-400">{preparedAt ? `Última preparação: ${new Date(preparedAt).toLocaleString('pt-BR')}. ${total} registro(s) receberam ou tiveram a estrutura de tenant preparada.` : 'Execute uma vez enquanto as regras atuais ainda estão publicadas. Nenhum número comercial é alterado, somente identificadores de empresa e unidade.'}</p></div></div>
        </section>

        {result && <section className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Usuários" value={result.users}/><Metric label="Estoque" value={result.stock}/><Metric label="Histórico" value={result.meta}/><Metric label="Imports" value={result.imports}/><Metric label="My Performance" value={result.sellerPerformance}/><Metric label="Hist. vendedor" value={result.sellerHistory}/><Metric label="DealGuard" value={result.deals}/><Metric label="Aliases" value={result.aliases}/></section>}

        <section className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4"><p className="text-sm font-medium text-white">O que este botão faz</p><p className="mt-2 text-xs leading-5 text-zinc-500">Dados antigos sem identificação são reconhecidos como Abrão Reze / Outlet Sorocaba. Também são criadas cópias compatíveis dos pontos históricos usados por Trends. Pode executar novamente: a operação é idempotente e só preenche o que estiver faltando.</p></section>

        {error && <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-red-300">{error}</div>}
        <button disabled={busy} onClick={prepare} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white font-semibold text-black disabled:opacity-40">{busy ? <RefreshCw size={17} className="animate-spin"/> : <ShieldCheck size={17}/>} {busy ? 'Preparando histórico...' : preparedAt ? 'Executar verificação novamente' : 'Preparar dados para blindagem'}</button>

        <p className="text-center text-[11px] leading-5 text-zinc-600">Depois desta etapa, as regras novas ainda precisam ser publicadas manualmente no Firebase. O DealMaster não altera as regras do seu projeto automaticamente.</p>
      </div>
    </div></div>}
  </>;
};

const Metric = ({ label, value }: { label: string; value: number }) => <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</p><p className="mt-1 text-xl font-semibold text-white">{value}</p></div>;
export default TenantSecurityPanel;
