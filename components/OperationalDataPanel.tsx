import React, { useMemo, useState } from 'react';
import { Building2, FileUp, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { OperationalPerformanceSnapshot, User } from '../types';
import { mapPerformanceRows, mapStockRows, normalize, operationalDataService, parseCsv } from '../services/operationalDataService';

type Props = { currentUser: User };
type ImportType = 'stock' | 'performance';

const MONTHS = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

const excelRows = async (file: File) => {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
  const headerIndex = matrix.findIndex(r => r.some((c: any) => ['placa', 'vendedor', 'familia', 'modelo'].includes(normalize(String(c)))));
  if (headerIndex < 0) return [];
  const headers = matrix[headerIndex].map((h: any) => normalize(String(h)));
  return matrix.slice(headerIndex + 1).map(r => {
    const o: Record<string, string> = {};
    headers.forEach((h: string, i: number) => { if (h) o[h] = String(r[i] ?? ''); });
    return o;
  }).filter(r => Object.values(r).some(Boolean));
};

const readPerformanceMap = async (file: File, referenceDate: string): Promise<OperationalPerformanceSnapshot> => {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const month = MONTHS[Math.max(0, Number(referenceDate.slice(5, 7)) - 1)];
  const sheetName = wb.SheetNames.find(name => normalize(name) === normalize(month)) || wb.SheetNames[wb.SheetNames.length - 1];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Não encontrei a aba ${month} no arquivo.`);

  const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '', raw: true });
  const headerIndex = matrix.findIndex(row => row.some((cell: any) => normalize(String(cell)) === 'vendedor'));
  if (headerIndex < 0) throw new Error('Não encontrei o cabeçalho de vendedores no mapa.');

  const headers = matrix[headerIndex].map((h: any) => normalize(String(h)));
  const sellerRows: Record<string, string>[] = [];
  let storeSectionIndex = -1;

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    const first = normalize(String(row[0] ?? ''));
    if (first === 'indicadores da loja' || first === 'indicadores do dia') {
      storeSectionIndex = i;
      break;
    }
    if (!first) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h: string, col: number) => { if (h) obj[h] = String(row[col] ?? ''); });
    sellerRows.push(obj);
  }

  const { sellers, total } = mapPerformanceRows(sellerRows);
  if (!sellers.length) throw new Error(`A aba ${sheetName} foi encontrada, mas nenhum vendedor foi reconhecido.`);

  const storeMetrics: Record<string, number | string> = {};
  if (storeSectionIndex >= 0) {
    for (let r = storeSectionIndex + 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      for (let col = 0; col < row.length; col++) {
        const rawLabel = row[col];
        if (typeof rawLabel !== 'string' || !rawLabel.trim()) continue;
        const label = normalize(rawLabel);
        if (!label || /^#/.test(label)) continue;
        for (let next = col + 1; next <= Math.min(col + 2, row.length - 1); next++) {
          const value = row[next];
          if (value === '' || value === null || value === undefined) continue;
          if (typeof value === 'number' || (!Number.isNaN(Number(String(value).replace(',', '.'))) && !String(value).startsWith('#'))) {
            storeMetrics[label] = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
            break;
          }
        }
      }
    }
  }

  return {
    referenceDate,
    sheetName,
    sellers,
    ...(total ? { total } : {}),
    storeMetrics,
  };
};

const OperationalDataPanel: React.FC<Props> = ({ currentUser }) => {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ImportType>('stock');
  const [referenceDate, setReferenceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [performance, setPerformance] = useState<OperationalPerformanceSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const stockPreview = useMemo(() => !rows.length ? [] : mapStockRows(rows, referenceDate).slice(0, 5), [rows, referenceDate]);

  const handleFile = async (next: File | null) => {
    setFile(next);
    setRows([]);
    setPerformance(null);
    setMessage(null);
    if (!next) return;
    try {
      const lower = next.name.toLowerCase();
      if (!lower.endsWith('.csv') && !lower.endsWith('.xls') && !lower.endsWith('.xlsx')) {
        setMessage({ kind: 'error', text: 'Envie CSV, XLS ou XLSX.' });
        return;
      }

      if (type === 'performance') {
        if (lower.endsWith('.csv')) {
          setMessage({ kind: 'error', text: 'Para o Mapa de Indicadores, envie o arquivo XLS ou XLSX com as abas mensais.' });
          return;
        }
        const parsed = await readPerformanceMap(next, referenceDate);
        setPerformance(parsed);
        return;
      }

      const parsed = lower.endsWith('.csv') ? parseCsv(await next.text()) : await excelRows(next);
      setRows(parsed);
      if (!parsed.length) setMessage({ kind: 'error', text: 'Não encontrei uma tabela reconhecível no arquivo.' });
    } catch (e: any) {
      setMessage({ kind: 'error', text: e?.message || 'Não consegui ler esse arquivo. Verifique se ele abre normalmente no LibreOffice.' });
    }
  };

  const importData = async () => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      if (type === 'stock') {
        const items = mapStockRows(rows, referenceDate);
        const count = await operationalDataService.importStock(items, file.name, currentUser);
        setMessage({ kind: 'ok', text: `Estoque atualizado: ${count} veículos. Fotografia oficial de ${referenceDate}.` });
      } else {
        if (!performance) throw new Error('Mapa de performance ainda não foi reconhecido.');
        const count = await operationalDataService.importPerformance(performance, file.name, currentUser);
        setMessage({ kind: 'ok', text: `Performance atualizada: ${count} vendedores da aba ${performance.sheetName}. Snapshot de ${referenceDate} preservado.` });
      }
      setFile(null);
      setRows([]);
      setPerformance(null);
      window.dispatchEvent(new Event('dealmaster:operational-data-updated'));
    } catch (e: any) {
      setMessage({ kind: 'error', text: e?.message || 'Erro ao importar.' });
    } finally {
      setBusy(false);
    }
  };

  if (!['admin', 'manager'].includes(currentUser.role)) return null;

  const reset = (t: ImportType) => {
    setType(t);
    setFile(null);
    setRows([]);
    setPerformance(null);
    setMessage(null);
  };

  const recognized = type === 'stock' ? rows.length > 0 : !!performance;

  return <>
    <button onClick={() => setOpen(true)} className="fixed bottom-5 left-5 z-[130] flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl"><Building2 size={18}/> Dados da Loja</button>
    {open && <div className="fixed inset-0 z-[220] overflow-y-auto bg-black/75 p-3 backdrop-blur-md" onClick={() => setOpen(false)}>
      <div onClick={e => e.stopPropagation()} className="mx-auto mt-5 max-w-4xl rounded-[32px] border border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 p-6">
          <div><p className="text-xs font-semibold uppercase tracking-[.15em] text-zinc-500">Atualização diária</p><h3 className="mt-1 text-2xl font-semibold text-white">Dados do Outlet</h3><p className="mt-1 text-sm text-zinc-500">Dois arquivos separados. O estoque substitui a fotografia atual; o mapa preserva o histórico.</p></div>
          <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[.06] text-zinc-400"><X size={18}/></button>
        </div>
        <div className="p-6">
          <div className="grid gap-3 md:grid-cols-2">
            <button onClick={() => reset('stock')} className={`rounded-[24px] border p-5 text-left ${type === 'stock' ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[.03] text-white'}`}><p className="text-xs font-semibold uppercase opacity-60">Arquivo 1</p><p className="mt-2 text-xl font-semibold">📦 Atualizar Estoque</p><p className="mt-2 text-sm opacity-60">Padrão DealerNet: Família, Modelo, Placa, Ano, Cor, Preço Venda, KM, Dias Estoque e Custo.</p></button>
            <button onClick={() => reset('performance')} className={`rounded-[24px] border p-5 text-left ${type === 'performance' ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[.03] text-white'}`}><p className="text-xs font-semibold uppercase opacity-60">Arquivo 2</p><p className="mt-2 text-xl font-semibold">📊 Atualizar Performance</p><p className="mt-2 text-sm opacity-60">Mapa de Indicadores: vendedores, vendas Syonet, margem, captura, projeção e indicadores da loja.</p></button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[220px_1fr]">
            <div><label className="mb-2 block text-xs text-zinc-500">Data de referência</label><input type="date" value={referenceDate} onChange={e => setReferenceDate(e.target.value)} className="h-12 w-full rounded-2xl border border-white/10 bg-white/[.05] px-4 text-white"/></div>
            <div><label className="mb-2 block text-xs text-zinc-500">Arquivo do DealerNet / LibreOffice</label><label className="flex h-12 cursor-pointer items-center justify-between rounded-2xl border border-dashed border-white/15 bg-white/[.035] px-4 text-sm text-zinc-300"><span className="truncate">{file?.name || 'Selecionar CSV, XLS ou XLSX'}</span><FileUp size={17}/><input type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={e => handleFile(e.target.files?.[0] || null)}/></label></div>
          </div>

          {recognized && <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[.03] p-4">
            <div className="flex justify-between"><div><p className="text-sm font-medium text-white">Arquivo reconhecido</p><p className="text-xs text-zinc-500">{type === 'stock' ? `${rows.length} linhas · ${stockPreview.length ? 'mapeamento pronto' : 'revise o formato'}` : `${performance?.sellers.length || 0} vendedores · aba ${performance?.sheetName}`}</p></div><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">Prévia OK</span></div>
            {type === 'stock' && <div className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">{stockPreview.map((i: any) => <div key={i.id} className="rounded-xl bg-black/20 p-2 text-zinc-300">{i.plate || '-'}<br/><span className="text-zinc-500">{i.vehicle} · {i.stockDays} dias</span></div>)}</div>}
            {type === 'performance' && performance && <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">{performance.sellers.slice(0, 6).map(s => <div key={s.sellerKey} className="rounded-xl bg-black/20 p-3"><p className="font-medium text-zinc-200">{s.seller}</p><p className="mt-1 text-zinc-500">Vendas Syonet: <span className="text-zinc-300">{s.syonetSales}</span> · Projeção: <span className="text-zinc-300">{s.projection.toFixed(1)}</span></p><p className="mt-1 text-zinc-500">MC: <span className="text-zinc-300">{s.marginPercent.toFixed(1)}%</span> · Captura: <span className="text-zinc-300">{s.capturePercent.toFixed(1)}%</span></p></div>)}</div>}
          </div>}

          {message && <div className={`mt-5 flex gap-3 rounded-2xl border p-4 text-sm ${message.kind === 'ok' ? 'border-emerald-500/20 bg-emerald-500/[.07] text-emerald-300' : 'border-red-500/20 bg-red-500/[.07] text-red-300'}`}>{message.kind === 'ok' ? <CheckCircle2 size={18}/> : <AlertTriangle size={18}/>}<span>{message.text}</span></div>}

          <div className="mt-6 flex justify-end"><button disabled={!file || !recognized || busy} onClick={importData} className="rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-black disabled:opacity-30">{busy ? 'Atualizando...' : type === 'stock' ? 'Atualizar estoque' : 'Atualizar performance'}</button></div>
        </div>
      </div>
    </div>}
  </>;
};

export default OperationalDataPanel;
