import React, { useEffect, useMemo, useState } from 'react';
import { CarFront, Check, Copy, ExternalLink, ImageOff, Link2, MessageCircle, Search, X } from 'lucide-react';
import type { GroupStockItem } from '../services/groupStockService';
import { isGroupStockAvailable, matchGroupStock } from '../services/crmStockMatchService';
import { showroomFlowService } from '../services/showroomFlowService';
import type { ShowroomPassage, User } from '../types';

type CatalogCar = {
  model: string;
  year: string;
  km: number;
  price: number;
  store: string;
  brand: string;
  color: string;
  fuel: string;
  transmission: string;
  imageUrl?: string;
};
type CatalogPayload = {
  version: 1;
  createdAt: string;
  sellerName: string;
  sellerPhone: string;
  introduction: string;
  cars: CatalogCar[];
};

const formatMoney = (number: number) => number > 0
  ? number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  : 'Consulte o valor';
const cleanPhone = (value: string) => String(value || '').replace(/\D/g, '').slice(0, 15);
const publicImage = (value: string) => {
  try {
    const url = new URL(String(value || '').trim());
    // Never leak SharePoint/intranet access links into a customer-facing catalog.
    if (url.protocol !== 'https:' || url.hostname.endsWith('.sharepoint.com') || url.hostname.endsWith('.sharepoint-df.com')) return '';
    return url.toString();
  } catch {
    return '';
  }
};
const bytesToBase64Url = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, char => String.fromCharCode(char)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const base64UrlToBytes = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 16000) throw new Error('Link inválido.');
  const encoded = value.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
  return Uint8Array.from(decoded, letter => letter.charCodeAt(0));
};

const encodeCatalog = async (payload: CatalogPayload) => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (bytes.length > 11000) throw new Error('Catálogo muito grande. Use até cinco carros e textos mais curtos.');
  if (typeof CompressionStream === 'undefined') return 'r' + bytesToBase64Url(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  const zipped = new Uint8Array(await new Response(stream).arrayBuffer());
  return 'g' + bytesToBase64Url(zipped);
};

const decodeCatalog = async (encoded: string): Promise<CatalogPayload> => {
  const mode = encoded[0];
  const bytes = base64UrlToBytes(encoded.slice(1));
  let decoded: Uint8Array = bytes;
  if (mode === 'g') {
    if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não suporta este formato de catálogo.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    decoded = new Uint8Array(await new Response(stream).arrayBuffer());
  } else if (mode !== 'r') throw new Error('Formato de catálogo inválido.');
  const value = JSON.parse(new TextDecoder().decode(decoded)) as CatalogPayload;
  if (value?.version !== 1 || !Array.isArray(value.cars) || value.cars.length < 1 || value.cars.length > 5) {
    throw new Error('Conteúdo de catálogo inválido.');
  }
  return value;
};

const snapshotCar = (item: GroupStockItem, imageUrl: string): CatalogCar => ({
  model: String(item.model || '').slice(0, 120),
  year: String(item.year || '').slice(0, 30),
  km: Number(item.km || 0),
  price: Number(item.suggestedPrice || 0),
  store: String(item.location || item.stockOwner || '').slice(0, 100),
  brand: String(item.brand || '').slice(0, 60),
  color: String(item.color || '').slice(0, 40),
  fuel: String(item.fuel || '').slice(0, 40),
  transmission: String(item.transmission || '').slice(0, 40),
  ...(publicImage(imageUrl) ? { imageUrl: publicImage(imageUrl) } : {}),
});

const VehicleImage = ({ url, compact = false }: {url?: string; compact?: boolean}) => {
  const [failed, setFailed] = useState(false);
  const valid = publicImage(url || '');
  return valid && !failed
    ? <img src={valid} onError={() => setFailed(true)} alt="Foto do veículo" referrerPolicy="no-referrer" loading="lazy" className={'w-full object-cover ' + (compact ? 'h-28 rounded-xl' : 'aspect-[16/10] rounded-2xl')}/>
    : <div className={'flex flex-col items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-slate-100 to-emerald-50 text-slate-400 ' + (compact ? 'h-28' : 'aspect-[16/10]')}>
      <CarFront size={compact ? 25 : 42}/><span className="text-[10px] font-semibold">Fotos ainda não vinculadas</span>
    </div>;
};

const VehicleCard = ({ car, index }: {car: CatalogCar; index: number}) => (
  <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
    <VehicleImage url={car.imageUrl}/>
    <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
      <div><span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Opção {index + 1}</span>
        <h3 className="mt-1 text-xl font-bold text-slate-900">{car.model}</h3>
        <p className="mt-1 text-sm text-slate-500">{[car.year, car.color, car.transmission].filter(Boolean).join(' · ')}</p>
      </div>
      <strong className="text-xl text-emerald-700">{formatMoney(car.price)}</strong>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-4 text-xs text-slate-600">
      <span>Quilometragem</span><strong className="text-right text-slate-800">{car.km ? car.km.toLocaleString('pt-BR') + ' km' : 'A consultar'}</strong>
      <span>Combustível</span><strong className="text-right text-slate-800">{car.fuel || 'A consultar'}</strong>
      <span>Unidade</span><strong className="text-right text-slate-800">{car.store || 'A consultar'}</strong>
    </div>
  </article>
);

const CrmPersonalizedCatalog = ({lead, user, stockItems}: {
  lead: ShowroomPassage; user: User; stockItems: GroupStockItem[];
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [sellerPhone, setSellerPhone] = useState('');
  const [intro, setIntro] = useState('Separei estas opções de seminovos para você conhecer. Me diga qual delas chamou mais a sua atenção!');
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedHistory, setSavedHistory] = useState(false);
  const interest = lead.desiredVehicle || lead.interestModel || '';
  const stock = useMemo(() => stockItems.filter(isGroupStockAvailable), [stockItems]);
  const suggested = useMemo(() => new Set(matchGroupStock(stock, interest, 30).map(row => row.item.plate)), [stock, interest]);
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('pt-BR');
    return stock.filter(car =>
      !needle || [car.model,car.brand,car.plate,car.year,car.location,car.stockOwner]
        .some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(needle))
    ).sort((a,b) => Number(suggested.has(b.plate)) - Number(suggested.has(a.plate)))
      .slice(0,80);
  }, [stock, search, suggested]);

  const toggle = (plate: string) => {
    setError('');setGeneratedLink('');setCopied(false);setSavedHistory(false);
    setChosen(prev => prev.includes(plate) ? prev.filter(id => id !== plate)
      : prev.length < 5 ? [...prev, plate] : prev);
  };

  const generate = async () => {
    setError('');setBusy(true);setCopied(false);setSavedHistory(false);
    try {
      const selected = chosen.map(plate => stock.find(car => car.plate === plate)).filter(Boolean) as GroupStockItem[];
      if (!selected.length) throw new Error('Selecione pelo menos um veículo disponível.');
      const payload: CatalogPayload = {
        version:1,
        createdAt:new Date().toISOString(),
        sellerName:String(user.name || '').slice(0,100),
        sellerPhone:cleanPhone(sellerPhone),
        introduction:intro.trim().slice(0,350),
        cars:selected.map(item => snapshotCar(item, photoUrls[item.plate] || '')),
      };
      const encoded = await encodeCatalog(payload);
      const url = window.location.origin + '/#/catalogo/' + encoded;
      if (url.length > 7500) throw new Error('Link muito longo. Reduza o texto ou remova URLs grandes de fotos.');
      setGeneratedLink(url);
      const brief = selected.map(item => item.model + ' (' + item.plate + ')').join(', ');
      try {
        await showroomFlowService.addCrmNote(lead.id,
          'Catálogo personalizado preparado com ' + selected.length + ' veículo(s): ' + brief +
          '\nLink: ' + url,
          {email:user.email,name:user.name}
        );
        setSavedHistory(true);
      } catch (historyError) {
        console.warn('Não foi possível registrar o catálogo na ficha:', historyError);
        setError('Link criado, mas não foi possível gravar o registro na ficha. Copie o link antes de sair.');
      }
    } catch (failure: any) {setError(failure?.message || 'Não foi possível gerar o catálogo.');}
    finally {setBusy(false);}
  };

  const copyLink = async () => {
    try {await navigator.clipboard.writeText(generatedLink);setCopied(true);}
    catch {setError('Seu navegador não permitiu copiar automaticamente. Selecione o link no campo abaixo.');}
  };
  const send = () => {
    const number = cleanPhone(lead.phone);
    const withCountry = number.length === 10 || number.length === 11 ? '55' + number : number;
    const firstName = lead.customerName.trim().split(/\s+/)[0] || 'Olá';
    const message = 'Olá, ' + firstName + '! Separei algumas opções de seminovos para você: ' + generatedLink +
      '\nOs preços e a disponibilidade devem ser confirmados antes de fechar negócio.';
    window.open('https://wa.me/' + (withCountry.length >= 12 ? withCountry : '') + '?text=' + encodeURIComponent(message),
      '_blank','noopener,noreferrer');
  };
  return <section className="rounded-[26px] border border-emerald-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">MOTYQ · VITRINE</p>
        <h3 className="mt-1 text-lg font-bold text-slate-900">Opções para o cliente</h3>
        <p className="mt-1 text-xs text-slate-500">Monte uma seleção de até cinco veículos do estoque compartilhado.</p>
      </div>
      <button onClick={() => setOpen(value => !value)} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white">
        {open ? 'FECHAR' : 'MONTAR CATÁLOGO'}
      </button>
    </div>
    {open && <div className="mt-5 space-y-4 border-t border-slate-100 pt-4">
      <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
        Interesse: <strong>{interest || 'Não informado'}</strong>. As opções sugeridas aparecem primeiro.
      </p>
      <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
        <Search size={16} className="text-slate-400"/>
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar modelo, placa, ano ou loja"
          className="h-11 w-full bg-transparent text-sm outline-none"/>
      </label>
      <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
        {!stock.length && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700">Sem estoque compartilhado disponível. Atualize o estoque para montar o catálogo.</p>}
        {visible.map(item => {
          const active = chosen.includes(item.plate);
          return <div key={item.plate} className={'rounded-2xl border p-3 ' + (active ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50')}>
            <button type="button" disabled={!active && chosen.length >= 5} onClick={() => toggle(item.plate)}
              className="flex w-full items-center gap-3 text-left disabled:opacity-40">
              <span className={'grid h-6 w-6 shrink-0 place-items-center rounded-md border ' + (active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white')}>
                {active && <Check size={14}/>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-800">{item.model} {suggested.has(item.plate) && <span className="text-[10px] text-emerald-700">· SUGERIDO</span>}</span>
                <span className="mt-1 block text-xs text-slate-500">{item.plate} · {item.year} · {item.km ? item.km.toLocaleString('pt-BR')+' km · ' : ''}{item.location || item.stockOwner}</span>
              </span>
              <span className="shrink-0 text-xs font-bold text-emerald-700">{formatMoney(item.suggestedPrice)}</span>
            </button>
            {active && <label className="mt-3 block text-xs text-slate-600">Foto pública do veículo (opcional)
              <input value={photoUrls[item.plate] || ''} onChange={event => {setPhotoUrls(current => ({...current,[item.plate]:event.target.value}));setGeneratedLink('');setSavedHistory(false);}}
                placeholder="https://.../foto.jpg" className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none"/>
              <span className="mt-1 block text-[10px] text-amber-700">Não cole links internos do SharePoint. Use apenas fotos autorizadas e públicas.</span>
            </label>}
          </div>;
        })}
      </div>
      <p className="text-xs font-bold text-slate-600">{chosen.length} de 5 veículos selecionados</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">Telefone comercial do vendedor (opcional)
          <input value={sellerPhone} onChange={event => {setSellerPhone(event.target.value);setGeneratedLink('');setSavedHistory(false);}} placeholder="(15) 99999-9999"
            className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none"/>
        </label>
        <label className="text-xs font-semibold text-slate-600 md:col-span-2">Mensagem de apresentação
          <textarea rows={2} maxLength={350} value={intro} onChange={event => {setIntro(event.target.value);setGeneratedLink('');setSavedHistory(false);}}
            className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none"/>
        </label>
      </div>
      {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
      <button disabled={busy || chosen.length===0} onClick={generate}
        className="w-full rounded-xl bg-slate-900 py-3 text-sm font-black text-white disabled:opacity-40">
        {busy ? 'GERANDO...' : 'GERAR CATÁLOGO'}
      </button>
      {generatedLink && <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-xs font-bold text-emerald-800">{savedHistory ? 'Catálogo criado e registrado na ficha.' : 'Catálogo criado.'}</p>
        <input readOnly value={generatedLink} onFocus={event => event.currentTarget.select()} className="w-full rounded-xl border border-emerald-200 bg-white p-3 text-xs text-slate-600"/>
        <div className="flex flex-wrap gap-2">
          <button onClick={copyLink} className="flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-800"><Copy size={14}/>{copied ? 'COPIADO' : 'COPIAR LINK'}</button>
          <button onClick={send} className="flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white"><MessageCircle size={14}/>WHATSAPP</button>
          <button onClick={() => window.open(generatedLink,'_blank','noopener,noreferrer')}
            className="flex items-center gap-1 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-slate-800">
            <ExternalLink size={14}/>PRÉ-VISUALIZAR
          </button>
        </div>
        <p className="text-[11px] text-emerald-900">Este link guarda uma cópia da seleção e não atualiza preço ou disponibilidade automaticamente. Confira antes de enviar.</p>
      </div>}
    </div>}
  </section>;
};

export const isPublicCatalogRoute = () => /^#\/catalogo\/[A-Za-z0-9_-]+$/.test(window.location.hash);

export const PublicCatalogPage = () => {
  const [payload, setPayload] = useState<CatalogPayload | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const value = window.location.hash.replace(/^#\/catalogo\//,'');
    decodeCatalog(value).then(data => {if (alive) setPayload(data);})
      .catch(failure => {if (alive) setError(failure?.message || 'Não foi possível abrir o catálogo.');});
    return () => {alive=false;};
  },[]);
  return <main className="min-h-screen bg-[#f5f7fb] text-slate-900">
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="rounded-3xl bg-slate-950 p-7 text-white md:p-10">
        <span className="text-xs font-black uppercase tracking-[.2em] text-emerald-300">MOTYQ · SELEÇÃO DE VEÍCULOS</span>
        <h1 className="mt-4 text-3xl font-bold md:text-4xl">Opções selecionadas para você</h1>
        {payload && <>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200">{payload.introduction}</p>
          <p className="mt-4 text-xs text-slate-300">Seleção de {payload.sellerName} · {new Date(payload.createdAt).toLocaleDateString('pt-BR')}</p>
        </>}
      </header>
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {!payload && !error && <p className="mt-8 text-sm text-slate-500">Carregando catálogo...</p>}
      {payload && <>
        <div className="mt-6 grid gap-5 md:grid-cols-2">{payload.cars.map((car,index)=><VehicleCard key={index} car={car} index={index}/>)}</div>
        {payload.sellerPhone && <a className="mt-7 flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-4 font-bold text-white"
          href={'https://wa.me/' + (payload.sellerPhone.length===10||payload.sellerPhone.length===11?'55':'') + payload.sellerPhone}
          target="_blank" rel="noopener noreferrer"><MessageCircle size={18}/>FALAR COM {payload.sellerName.split(' ')[0].toUpperCase()}</a>}
        <p className="mt-6 text-center text-xs leading-6 text-slate-500">
          Catálogo elaborado em {new Date(payload.createdAt).toLocaleString('pt-BR')}. Informações e preços são uma referência da data da seleção e dependem de confirmação de disponibilidade. Imagens e condições, quando apresentadas, devem ser confirmadas com o vendedor.
        </p>
      </>}
    </div>
  </main>;
};

export default CrmPersonalizedCatalog;
