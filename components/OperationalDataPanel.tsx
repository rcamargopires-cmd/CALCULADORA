import React, { useMemo, useState } from 'react';
import { Building2, FileUp, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { User } from '../types';
import { mapSalesRows, mapStockRows, operationalDataService, parseCsv } from '../services/operationalDataService';

type Props = { currentUser: User };

type ImportType = 'stock' | 'sales';

const OperationalDataPanel: React.FC<Props> = ({ currentUser }) => {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ImportType>('stock');
  const [referenceDate, setReferenceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string,string>[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{kind:'ok'|'error'; text:string} | null>(null);

  const preview = useMemo(() => {
    if (!rows.length) return [];
    return type === 'stock' ? mapStockRows(rows, referenceDate).slice(0, 5) : mapSalesRows(rows, referenceDate).slice(0, 5);
  }, [rows, type, referenceDate]);

  const handleFile = async (next: File | null) => {
    setFile(next);
    setRows([]);
    setMessage(null);
    if (!next) return;
    if (!next.name.toLowerCase().endsWith('.csv')) {
      setMessage({kind:'error', text:'Nesta primeira versão, envie o arquivo em CSV.'});
      return;
    }
    const text = await next.text();
    const parsed = parseCsv(text);
    setRows(parsed);
    if (!parsed.length) setMessage({kind:'error', text:'Não consegui encontrar linhas válidas no CSV.'});
  };

  const importData = async () => {
    if (!file || !rows.length) return;
    setBusy(true);
    setMessage(null);
    try {
      if (type === 'stock') {
        const items = mapStockRows(rows, referenceDate);
        const count = await operationalDataService.importStock(items, file.name, currentUser);
        setMessage({kind:'ok', text:`Estoque atualizado com ${count} veículo(s). Esse passa a ser o retrato oficial de ${referenceDate}.`});
      } else {
        const items = mapSalesRows(rows, referenceDate);
        const count = await operationalDataService.importSales(items, file.name, referenceDate, currentUser);
        setMessage({kind:'ok', text:`${count} faturamento(s) importado(s). Registros já existentes foram atualizados, não duplicados.`});
      }
      setFile(null);
      setRows([]);
    } catch (error:any) {
      setMessage({kind:'error', text:error?.message || 'Erro ao importar os dados.'});
    } finally {
      setBusy(false);
    }
  };

  if (currentUser.role !== 'admin') return null;

  return <>
    <button onClick={() => setOpen(true)} className="fixed bottom-5 left-5 z-[130] flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl shadow-black/40 hover:bg-zinc-800">
      <Building2 size={18}/> Dados da Loja
    </button>

    {open && <div className="fixed inset-0 z-[220] bg-black/75 p-3 backdrop-blur-md md:p-6" onClick={() => setOpen(false)}>
      <div onClick={e => e.stopPropagation()} className="mx-auto max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-[32px] border border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 p-5 md:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">Operação diária</p>
            <h3 className="mt-1 text-2xl font-semibold text-white">Atualizar dados do Outlet</h3>
            <p className="mt-1 text-sm text-zinc-500">Estoque é o retrato do dia. Faturamentos entram no histórico e não são duplicados.</p>
          </div>
          <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><X size={18}/></button>
        </div>

        <div className="p-5 md:p-6">
          <div className="grid gap-3 md:grid-cols-2">
            <button onClick={() => {setType('stock'); setFile(null); setRows([]); setMessage(null)}} className={`rounded-[24px] border p-5 text-left ${type==='stock'?'border-white bg-white text-black':'border-white/10 bg-white/[0.03] text-white'}`}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-60">Arquivo 1</p>
              <p className="mt-2 text-xl font-semibold">Estoque do dia</p>
              <p className="mt-2 text-sm opacity-60">Placa, veículo, dias de estoque, custo, FIPE, preço e unidade quando disponíveis.</p>
            </button>
            <button onClick={() => {setType('sales'); setFile(null); setRows([]); setMessage(null)}} className={`rounded-[24px] border p-5 text-left ${type==='sales'?'border-white bg-white text-black':'border-white/10 bg-white/[0.03] text-white'}`}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-60">Arquivo 2</p>
              <p className="mt-2 text-xl font-semibold">Vendas e faturamento</p>
              <p className="mt-2 text-sm opacity-60">Data, placa, veículo, vendedor, valor faturado, margem em R$ e margem %.</p>
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[220px_1fr]">
            <div>
              <label className="mb-2 block text-xs text-zinc-500">Data de referência</label>
              <input type="date" value={referenceDate} onChange={e => setReferenceDate(e.target.value)} className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none"/>
            </div>
            <div>
              <label className="mb-2 block text-xs text-zinc-500">Arquivo CSV</label>
              <label className="flex h-12 cursor-pointer items-center justify-between rounded-2xl border border-dashed border-white/15 bg-white/[0.035] px-4 text-sm text-zinc-300 hover:bg-white/[0.06]">
                <span className="truncate">{file?.name || 'Selecionar arquivo exportado'}</span><FileUp size={17} className="text-zinc-500"/>
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => handleFile(e.target.files?.[0] || null)}/>
              </label>
            </div>
          </div>

          {rows.length > 0 && <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between"><div><p className="text-sm font-medium text-white">Prévia reconhecida</p><p className="text-xs text-zinc-500">{rows.length} linha(s) no arquivo</p></div><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">Pronto para importar</span></div>
            <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="text-zinc-600"><tr>{type==='stock'?<><th className="p-2">Placa</th><th className="p-2">Veículo</th><th className="p-2">Dias</th><th className="p-2">Custo</th></>:<><th className="p-2">Data</th><th className="p-2">Placa</th><th className="p-2">Vendedor</th><th className="p-2">Margem %</th></>}</tr></thead><tbody className="text-zinc-300">{preview.map((item:any,idx)=><tr key={idx} className="border-t border-white/5">{type==='stock'?<><td className="p-2">{item.plate||'-'}</td><td className="p-2">{item.vehicle||'-'}</td><td className="p-2">{item.stockDays}</td><td className="p-2">{item.cost.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td></>:<><td className="p-2">{item.saleDate}</td><td className="p-2">{item.plate||'-'}</td><td className="p-2">{item.seller||'-'}</td><td className="p-2">{item.marginPercent.toFixed(1)}%</td></>}</tr>)}</tbody></table></div>
          </div>}

          {message && <div className={`mt-5 flex items-start gap-3 rounded-2xl border p-4 text-sm ${message.kind==='ok'?'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300':'border-red-500/20 bg-red-500/[0.07] text-red-300'}`}>{message.kind==='ok'?<CheckCircle2 size={18}/>:<AlertTriangle size={18}/>}<span>{message.text}</span></div>}

          <div className="mt-6 flex justify-end"><button disabled={!file || !rows.length || busy} onClick={importData} className="rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-30">{busy?'Importando...':type==='stock'?'Atualizar estoque':'Importar faturamentos'}</button></div>
        </div>
      </div>
    </div>}
  </>;
};

export default OperationalDataPanel;
