import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, CarFront, FileUp, MapPin, Search, ShieldAlert, X } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import * as XLSX from 'xlsx';
import { auth } from '../firebase';
import { User } from '../types';
import { userService } from '../services/userService';
import { companyIdForUser } from '../services/companyService';
import { COMPANY_SCOPE_EVENT, companyScopeService } from '../services/companyScopeService';
import { GroupStockItem, GroupStockSnapshot, groupStockService } from '../services/groupStockService';
import { formatCurrency } from '../utils/currency';

const cleanPlate = (value: unknown) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const asText = (value: unknown) => String(value ?? '').trim();
const asNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = asText(value).replace(/R\$/gi, '').replace(/\s/g, '');
  if (!raw) return 0;
  if (raw.includes(',') && raw.includes('.')) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  if (raw.includes(',')) return Number(raw.replace(',', '.')) || 0;
  return Number(raw) || 0;
};

const readGroupStockFile = async (file: File): Promise<{ items: GroupStockItem[]; sourceUpdatedAt: string }> => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames.find(name => normalize(name) === 'consulta') || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('Não encontrei a aba Consulta no arquivo.');
  const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: true });
  const headerIndex = matrix.findIndex(row => row.some(cell => normalize(cell) === 'placa') && row.some(cell => normalize(cell) === 'valor custo') && row.some(cell => normalize(cell) === 'modelo'));
  if (headerIndex < 0) throw new Error('Não encontrei o cabeçalho esperado com Placa, Modelo e Valor Custo.');

  const headers = matrix[headerIndex].map(normalize);
  const indexOf = (...names: string[]) => headers.findIndex(header => names.map(normalize).includes(header));
  const indexes = {
    purchaseCompany: indexOf('Empresa Compra'),
    stockOwner: indexOf('Estoque Atual'),
    model: indexOf('Modelo'),
    plate: indexOf('Placa'),
    color: indexOf('Cor'),
    km: indexOf('Km'),
    fuel: indexOf('Comb.', 'Comb'),
    transmission: indexOf('Transmissão', 'Transmissao'),
    days: indexOf('Dias'),
    suggestedPrice: indexOf('Preço Sugerido', 'Preco Sugerido'),
    brand: indexOf('Marca'),
    year: indexOf('Ano Fab/Mod'),
    status: indexOf('Situação', 'Situacao'),
    transit: indexOf('Transito', 'Trânsito'),
    cost: indexOf('Valor Custo'),
    notice1: indexOf('Aviso 1'),
    notice2: indexOf('Aviso 2'),
    notice3: indexOf('Aviso 3'),
    location: indexOf('Localização', 'Localizacao'),
  };
  if (indexes.plate < 0 || indexes.model < 0 || indexes.cost < 0) throw new Error('O arquivo não possui as colunas obrigatórias para a consulta do grupo.');

  const sourceUpdatedAt = matrix.slice(0, headerIndex).flat().map(asText).find(value => normalize(value).startsWith('atualizado')) || '';
  const unique = new Map<string, GroupStockItem>();

  matrix.slice(headerIndex + 1).forEach(row => {
    const plate = cleanPlate(row[indexes.plate]);
    if (!/^[A-Z0-9]{7}$/.test(plate)) return;
    const notices = [indexes.notice1, indexes.notice2, indexes.notice3].map(index => index >= 0 ? asText(row[index]) : '').filter(Boolean);
    unique.set(plate, {
      plate,
      model: indexes.model >= 0 ? asText(row[indexes.model]) : '',
      stockOwner: indexes.stockOwner >= 0 ? asText(row[indexes.stockOwner]) : '',
      location: indexes.location >= 0 ? asText(row[indexes.location]) : '',
      days: indexes.days >= 0 ? asNumber(row[indexes.days]) : 0,
      cost: indexes.cost >= 0 ? asNumber(row[indexes.cost]) : 0,
      suggestedPrice: indexes.suggestedPrice >= 0 ? asNumber(row[indexes.suggestedPrice]) : 0,
      km: indexes.km >= 0 ? asNumber(row[indexes.km]) : 0,
      year: indexes.year >= 0 ? asText(row[indexes.year]) : '',
      color: indexes.color >= 0 ? asText(row[indexes.color]) : '',
      fuel: indexes.fuel >= 0 ? asText(row[indexes.fuel]) : '',
      transmission: indexes.transmission >= 0 ? asText(row[indexes.transmission]) : '',
      brand: indexes.brand >= 0 ? asText(row[indexes.brand]) : '',
      status: indexes.status >= 0 ? asText(row[indexes.status]) : '',
      transit: indexes.transit >= 0 ? asText(row[indexes.transit]) : '',
      notices,
      ...(indexes.purchaseCompany >= 0 && asText(row[indexes.purchaseCompany]) ? { purchaseCompany: asText(row[indexes.purchaseCompany]) } : {}),
    });
  });

  const items = Array.from(unique.values());
  if (!items.length) throw new Error('Nenhuma placa válida foi reconhecida na aba Consulta.');
  return { items, sourceUpdatedAt };
};

const statusTone = (status: string) => {
  const value = normalize(status);
  if (value.includes('bloqueado')) return 'border-red-400/30 bg-red-400/[.08] text-red-300';
  if (value.includes('proposta')) return 'border-amber-400/30 bg-amber-400/[.08] text-amber-300';
  if (value.includes('pedido')) return 'border-violet-400/30 bg-violet-400/[.08] text-violet-300';
  return 'border-emerald-400/20 bg-emerald-400/[.06] text-emerald-300';
};

const GroupStockModule: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [snapshot, setSnapshot] = useState<GroupStockSnapshot | null>(null);
  const [selected, setSelected] = useState<GroupStockItem | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<GroupStockItem[]>([]);
  const [sourceUpdatedAt, setSourceUpdatedAt] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const autoFilledPlate = useRef('');

  useEffect(() => onAuthStateChanged(auth, async firebaseUser => {
    if (!firebaseUser?.email) {
      setUser(null); setCompanyId(''); setSnapshot(null); setSelected(null); return;
    }
    try {
      const profile = await userService.getUser(firebaseUser.email);
      if (!profile || profile.status !== 'active') return;
      setUser(profile);
      setCompanyId(profile.role === 'admin' ? companyScopeService.get(profile) : companyIdForUser(profile));
    } catch {}
  }), []);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    const onCompany = (event: Event) => {
      const next = (event as CustomEvent<{ companyId?: string }>).detail?.companyId;
      if (next) setCompanyId(next);
    };
    window.addEventListener(COMPANY_SCOPE_EVENT, onCompany);
    return () => window.removeEventListener(COMPANY_SCOPE_EVENT, onCompany);
  }, [user]);

  useEffect(() => {
    if (!companyId || user?.role === 'reception') { setSnapshot(null); return; }
    return groupStockService.subscribe(companyId, setSnapshot, error => console.warn('Motyq: estoque compartilhado indisponível.', error));
  }, [companyId, user?.role]);

  const byPlate = useMemo(() => new Map((snapshot?.items || []).map(item => [item.plate, item])), [snapshot]);

  useEffect(() => {
    const onPlate = (event: Event) => {
      const plate = cleanPlate((event as CustomEvent<{ plate?: string }>).detail?.plate || '');
      const match = /^[A-Z0-9]{7}$/.test(plate) ? byPlate.get(plate) || null : null;

      if (!match) {
        if (autoFilledPlate.current && autoFilledPlate.current !== plate) {
          window.dispatchEvent(new CustomEvent('motyq:group-stock-clear', { detail: { plate: autoFilledPlate.current } }));
          autoFilledPlate.current = '';
        }
        setSelected(null);
        return;
      }

      setSelected(match);
      if (autoFilledPlate.current !== plate) {
        autoFilledPlate.current = plate;
        window.dispatchEvent(new CustomEvent('motyq:group-stock-fill', {
          detail: { plate, stockDays: match.days, vehicleCost: match.cost, model: match.model },
        }));
      }
    };
    window.addEventListener('motyq:calculator-plate-changed', onPlate);
    return () => window.removeEventListener('motyq:calculator-plate-changed', onPlate);
  }, [byPlate]);

  const units = useMemo(() => new Set(preview.map(item => item.stockOwner).filter(Boolean)).size, [preview]);
  const blocked = useMemo(() => preview.filter(item => normalize(item.status).includes('bloqueado')).length, [preview]);
  const inProposal = useMemo(() => preview.filter(item => normalize(item.status).includes('proposta')).length, [preview]);
  const requested = useMemo(() => preview.filter(item => normalize(item.status).includes('pedido')).length, [preview]);

  const handleFile = async (next: File | null) => {
    setFile(next); setPreview([]); setSourceUpdatedAt(''); setMessage('');
    if (!next) return;
    try {
      if (!/\.(xls|xlsx|xlsm)$/i.test(next.name)) throw new Error('Envie o arquivo XLS, XLSX ou XLSM do estoque do grupo.');
      const parsed = await readGroupStockFile(next);
      setPreview(parsed.items);
      setSourceUpdatedAt(parsed.sourceUpdatedAt);
    } catch (error: any) {
      setMessage(error?.message || 'Não consegui ler o arquivo.');
    }
  };

  const save = async () => {
    if (!user || user.role !== 'admin' || !companyId || !file || !preview.length) return;
    setBusy(true); setMessage('');
    try {
      const count = await groupStockService.save({
        companyId,
        items: preview,
        sourceFile: file.name,
        sourceUpdatedAt,
        importedAt: new Date().toISOString(),
        importedBy: user.email,
      });
      setMessage(`Estoque compartilhado substituído com ${count} veículos.`);
      setFile(null); setPreview([]); setSourceUpdatedAt('');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível salvar o estoque compartilhado.');
    } finally { setBusy(false); }
  };

  const canLookup = user && user.status === 'active' && user.role !== 'reception';

  return <>
    {user?.role === 'admin' && <button title="Estoque Compartilhado do Grupo" onClick={() => { setAdminOpen(true); setMessage(''); }} className="hidden">Estoque Compartilhado do Grupo</button>}

    {canLookup && selected && <div className="fixed right-3 top-[132px] z-[345] w-[calc(100%-24px)] max-w-[410px] rounded-[24px] border border-sky-300/25 bg-zinc-950/95 p-4 text-white shadow-2xl backdrop-blur md:right-5 md:top-[150px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.15em] text-sky-300"><Search size={13}/> Estoque compartilhado do grupo</p><h3 className="mt-1 truncate text-lg font-semibold">{selected.model}</h3><p className="mt-0.5 text-xs text-zinc-500">{selected.plate} · {[selected.brand, selected.year].filter(Boolean).join(' · ')}</p></div>
        {selected.status && <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${statusTone(selected.status)}`}>{selected.status}</span>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-white/10 bg-white/[.035] p-2.5"><span className="text-zinc-600">Dias</span><strong className="mt-0.5 block text-white">{selected.days}</strong></div>
        <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[.04] p-2.5"><span className="text-zinc-600">Valor Custo aplicado</span><strong className="mt-0.5 block text-emerald-300">{formatCurrency(selected.cost)}</strong></div>
        <div className="rounded-xl border border-white/10 bg-white/[.035] p-2.5"><span className="text-zinc-600">Preço sugerido</span><strong className="mt-0.5 block text-white">{selected.suggestedPrice ? formatCurrency(selected.suggestedPrice) : 'Não informado'}</strong></div>
        <div className="rounded-xl border border-white/10 bg-white/[.035] p-2.5"><span className="text-zinc-600">KM</span><strong className="mt-0.5 block text-white">{selected.km ? selected.km.toLocaleString('pt-BR') : 'Não informado'}</strong></div>
      </div>
      <div className="mt-3 space-y-1.5 rounded-xl border border-white/10 bg-black/20 p-3 text-xs"><p className="flex items-center gap-2 text-zinc-300"><Building2 size={13} className="text-sky-300"/><span className="text-zinc-600">Estoque:</span> {selected.stockOwner || 'Não informado'}</p><p className="flex items-center gap-2 text-zinc-300"><MapPin size={13} className="text-sky-300"/><span className="text-zinc-600">Localização:</span> {selected.location || selected.stockOwner || 'Não informada'}</p>{selected.transit && <p className="text-[10px] text-zinc-500">Trânsito: {selected.transit}</p>}</div>
      {selected.notices.length > 0 && <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[.05] p-3"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] text-amber-300"><ShieldAlert size={13}/> Avisos do veículo</p>{selected.notices.map((notice, index) => <p key={index} className="mt-1 text-xs leading-5 text-amber-100/80">{notice}</p>)}</div>}
    </div>}

    {user?.role === 'admin' && adminOpen && <div className="fixed inset-0 z-[590] overflow-y-auto bg-black/75 p-3 backdrop-blur-md" onClick={() => setAdminOpen(false)}><div onClick={event => event.stopPropagation()} className="mx-auto mt-5 max-w-4xl rounded-[30px] border border-white/10 bg-zinc-950 text-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-white/10 p-5 md:p-6"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-sky-300">ESTOQUE COMPARTILHADO DO GRUPO</p><h2 className="mt-2 text-2xl font-semibold">Base comercial para todas as lojas</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">Esta carga não entra no aging nem nos indicadores da unidade. Ela serve para consulta na calculadora. O custo usado é exclusivamente <strong className="text-zinc-300">Valor Custo</strong>, nunca Valor Compra.</p></div><button onClick={() => setAdminOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400"><X size={18}/></button></header>
      <div className="p-5 md:p-6">
        {snapshot && <div className="mb-5 rounded-2xl border border-emerald-300/15 bg-emerald-300/[.04] p-4"><p className="text-xs font-bold text-emerald-300">Base atual: {snapshot.items.length} veículos</p><p className="mt-1 text-[11px] text-zinc-500">Arquivo: {snapshot.sourceFile || 'não informado'}{snapshot.sourceUpdatedAt ? ` · ${snapshot.sourceUpdatedAt}` : ''}</p></div>}
        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-[22px] border border-dashed border-white/15 bg-white/[.025] px-5 text-center transition hover:border-sky-300/30"><FileUp size={22} className="text-sky-300"/><span className="mt-2 text-sm font-semibold">{file?.name || 'Selecionar arquivo de estoque do grupo'}</span><span className="mt-1 text-xs text-zinc-600">XLSM, XLSX ou XLS · aba Consulta</span><input type="file" accept=".xls,.xlsx,.xlsm" className="hidden" onChange={event => handleFile(event.target.files?.[0] || null)}/></label>
        {preview.length > 0 && <div className="mt-5"><div className="grid grid-cols-2 gap-2 md:grid-cols-5"><Stat label="Veículos" value={preview.length}/><Stat label="Estoques" value={units}/><Stat label="Bloqueados" value={blocked}/><Stat label="Em proposta" value={inProposal}/><Stat label="Com pedido" value={requested}/></div><div className="mt-4 overflow-hidden rounded-2xl border border-white/10"><div className="grid grid-cols-[85px_1fr_100px_110px] gap-2 bg-white/[.04] px-3 py-2 text-[10px] font-black uppercase text-zinc-600"><span>Placa</span><span>Veículo</span><span>Dias</span><span>Custo</span></div>{preview.slice(0, 5).map(item => <div key={item.plate} className="grid grid-cols-[85px_1fr_100px_110px] gap-2 border-t border-white/10 px-3 py-2 text-xs"><span className="font-mono text-sky-300">{item.plate}</span><span className="truncate text-zinc-300">{item.model}</span><span>{item.days}</span><span>{formatCurrency(item.cost)}</span></div>)}</div><button disabled={busy} onClick={save} className="mt-5 w-full rounded-xl bg-sky-300 px-5 py-3 text-sm font-black text-sky-950 disabled:opacity-40">{busy ? 'IMPORTANDO...' : `SUBSTITUIR ESTOQUE COMPARTILHADO · ${preview.length} VEÍCULOS`}</button></div>}
        {message && <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${message.includes('substituído') ? 'border-emerald-300/20 bg-emerald-300/[.05] text-emerald-300' : 'border-amber-300/20 bg-amber-300/[.05] text-amber-200'}`}>{message}</div>}
      </div>
    </div></div>}
  </>;
};

const Stat = ({ label, value }: { label: string; value: number }) => <div className="rounded-xl border border-white/10 bg-white/[.03] p-3"><p className="text-[9px] font-black uppercase tracking-[.12em] text-zinc-600">{label}</p><p className="mt-1 text-xl font-semibold text-white">{value}</p></div>;

export default GroupStockModule;
