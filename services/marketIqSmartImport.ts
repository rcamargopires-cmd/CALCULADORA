/**
 * Motyq IQ · Detector local de planilhas.
 * Apenas identifica a estrutura; não salva nem envia nenhum dado.
 * O importador oficial de cada módulo ainda valida todos os registros.
 */
import * as XLSX from 'xlsx';

export type MarketIqWorkbookKind='dealer'|'evaluations';
export type MarketIqIncomingFile={token:string;file:File;kind:MarketIqWorkbookKind};
export type MarketIqWorkbookDetection={
 kind:MarketIqWorkbookKind;
 sheet:string;
 headline:string;
 description:string;
};
const clean=(v:unknown)=>String(v??'').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toUpperCase()
 .replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const has=(headers:Set<string>,...keys:string[])=>keys.some(key=>headers.has(clean(key)));
const headerRows=(sheet:XLSX.WorkSheet)=>{
 const range=XLSX.utils.decode_range(sheet['!ref']||'A1:A1');
 const last=Math.min(range.e.r,range.s.r+11);
 const first=Math.max(0,range.s.r);
 return XLSX.utils.sheet_to_json<unknown[]>(sheet,{
  header:1,raw:true,defval:'',blankrows:false,range:{s:{r:first,c:0},e:{r:last,c:Math.min(range.e.c,120)}}
 });
};
const rowsHave=(rows:unknown[][],check:(headers:Set<string>)=>boolean)=>
 rows.some(row=>check(new Set(row.map(clean).filter(Boolean))));
const dealerHeaders=(h:Set<string>)=>
 has(h,'Placa')&&has(h,'Preço Sugerido')&&has(h,'Valor Custo')&&
 has(h,'Modelo')&&has(h,'Dias')&&has(h,'Estoque Atual');
const appraisalHeaders=(h:Set<string>)=>
 has(h,'ID Avaliação','ID Avaliacao')&&has(h,'Data de Avaliação','Data avaliação')&&
 has(h,'Valor avaliado','Valor da avaliação')&&has(h,'Marca')&&has(h,'Modelo');

export function classifyMarketIqWorkbook(book:XLSX.WorkBook):MarketIqWorkbookDetection{
 const sheets=(book.SheetNames||[]).slice(0,12);
 const isDealer=Boolean(book.Sheets?.['Consulta']&&rowsHave(headerRows(book.Sheets['Consulta']),dealerHeaders));
 const evaluationSheets=sheets.filter(name=>book.Sheets[name]&&rowsHave(headerRows(book.Sheets[name]),appraisalHeaders));
 if(isDealer&&evaluationSheets.length)
  throw new Error('A planilha contém dados de estoque e de avaliações. Importe cada relatório separadamente.');
 if(isDealer)return {
  kind:'dealer',sheet:'Consulta',
  headline:'Estoque do Dealer identificado',
  description:'Veículos, custos e dias em estoque. Vai para Meu estoque (Radar), sem alterar avaliações.'
 };
 if(evaluationSheets.length===1)return {
  kind:'evaluations',sheet:evaluationSheets[0],
  headline:'Avaliações do AutoAvaliar identificadas',
  description:'Histórico por mês de avaliação. Meses já arquivados exigem confirmação antes de serem substituídos.'
 };
 if(evaluationSheets.length>1)
  throw new Error('Mais de uma aba de avaliações foi encontrada. Escolha o arquivo mensal original sem abas duplicadas.');
 throw new Error('Formato não identificado. Para estoque, use o Dealer V44 com a aba Consulta. Para avaliações, use o relatório AutoAvaliar com ID Avaliação, Data de Avaliação e Valor avaliado. Nada foi importado.');
}

export async function detectMarketIqWorkbook(file:File):Promise<MarketIqWorkbookDetection>{
 const extension=file.name.toLowerCase().split('.').pop()||'';
 if(!['xlsx','xlsm','xls'].includes(extension))
  throw new Error('Formato não permitido. Escolha uma planilha .xlsx, .xlsm ou .xls.');
 if(file.size===0)throw new Error('O arquivo está vazio.');
 if(file.size>42*1024*1024)throw new Error('Arquivo acima do limite de 42 MB. Exporte um relatório menor.');
 // Read in the browser only. VBA is never loaded/executed.
 const book=XLSX.read(await file.arrayBuffer(),{
  type:'array',bookVBA:false,cellFormula:false,cellHTML:false,
  sheetRows:12
 });
 const result=classifyMarketIqWorkbook(book);
 if(result.kind==='dealer'&&extension==='xls')
  throw new Error('O estoque Dealer deve ser exportado em .xlsx ou .xlsm (V44).');
 if(result.kind==='evaluations'&&file.size>18*1024*1024)
  throw new Error('O arquivo de avaliações tem mais de 18 MB. Exporte um relatório menor.');
 return result;
}
