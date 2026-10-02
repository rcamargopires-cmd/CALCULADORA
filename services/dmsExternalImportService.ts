import * as XLSX from 'xlsx';
import type { FinanceEntryType, OperationalStockItem, User } from '../types';
import { currentStockService } from './currentStockService';
import { dmsCustomerService } from './dmsCustomerService';
import { dmsSupplierService } from './dmsSupplierService';
import { financeService } from './financeService';
import { dmsAuditService } from './dmsAuditService';

export type ExternalImportKind='stock'|'customers'|'suppliers'|'finance';
export type ExternalImportPreview={
  kind:ExternalImportKind;
  fileName:string;
  sheetName:string;
  headers:string[];
  rows:Array<Record<string,unknown>>;
  normalized:Array<Record<string,unknown>>;
  warnings:string[];
};

const norm=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'').trim();
const cleanPlate=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const digits=(value:unknown,max=15)=>String(value??'').replace(/\D/g,'').slice(0,max);
const number=(value:unknown)=>{
  if(typeof value==='number')return Number.isFinite(value)?value:0;
  const raw=String(value??'').trim();
  if(!raw)return 0;
  const cleaned=raw.replace(/R\$|\s/g,'');
  const normalized=cleaned.includes(',')?cleaned.replace(/\./g,'').replace(',','.'):cleaned;
  const parsed=Number(normalized.replace(/[^0-9.-]/g,''));
  return Number.isFinite(parsed)?parsed:0;
};
const isoDate=(value:unknown)=>{
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.toISOString().slice(0,10);
  if(typeof value==='number'&&value>20000&&value<100000){
    const decoded=XLSX.SSF.parse_date_code(value);
    if(decoded)return `${decoded.y}-${String(decoded.m).padStart(2,'0')}-${String(decoded.d).padStart(2,'0')}`;
  }
  const raw=String(value??'').trim();
  if(!raw)return'';
  if(/^\d{4}-\d{2}-\d{2}/.test(raw))return raw.slice(0,10);
  const br=raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if(br)return `${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`;
  const date=new Date(raw);
  return Number.isNaN(date.getTime())?'':date.toISOString().slice(0,10);
};
const value=(row:Record<string,unknown>,aliases:string[])=>{
  const entries=Object.entries(row);
  for(const alias of aliases){
    const target=norm(alias);
    const found=entries.find(([key])=>norm(key)===target);
    if(found)return found[1];
  }
  return'';
};
const aliases={
  plate:['placa','license plate','licenseplate'],
  vehicle:['veiculo','veículo','modelo','model','vehicle','descricao','descrição'],
  brand:['marca','brand','fabricante'],
  year:['ano','ano modelo','anomodelo','year'],
  km:['km','quilometragem','mileage'],
  cost:['custo','valor compra','valorcompra','purchase price','purchaseprice','custo atual','custoatual'],
  fipe:['fipe','valor fipe','valorfipe'],
  asking:['preco venda','preço venda','precovenda','valor venda','valorvenda','asking price','askingprice'],
  location:['localizacao','localização','local','patio','pátio','location'],
  status:['status','situacao','situação'],
  entryDate:['data entrada','dataentrada','entrada','entry date','entrydate'],
  name:['nome','name','razao social','razão social','razaosocial'],
  phone:['telefone','celular','fone','phone','whatsapp'],
  email:['email','e-mail'],
  document:['cpf','cnpj','cpf/cnpj','documento','document'],
  address:['endereco','endereço','address','logradouro'],
  city:['cidade','city'],
  state:['uf','estado','state'],
  zip:['cep','zip','zipcode'],
  pix:['pix','chave pix','chavepix'],
  bank:['banco','dados bancarios','dados bancários','dadosbancarios','bank'],
  financeType:['tipo','natureza','type','pagar receber','pagarreceber'],
  category:['categoria','category'],
  description:['descricao','descrição','historico','histórico','description'],
  party:['favorecido','fornecedor','cliente','pagador','beneficiario','beneficiário','party'],
  amount:['valor','amount','total'],
  dueDate:['vencimento','data vencimento','datavencimento','due date','duedate'],
  financeStatus:['status','situacao','situação'],
};

const detect=(headers:string[]):ExternalImportKind=>{
  const set=new Set(headers.map(norm));
  const has=(list:string[])=>list.some(alias=>set.has(norm(alias)));
  if(has(aliases.plate)&&has(aliases.vehicle))return'stock';
  if(has(aliases.financeType)&&has(aliases.amount)&&has(aliases.description))return'finance';
  if(has(aliases.pix)||has(aliases.bank))return'suppliers';
  return'customers';
};

const normalizeRows=(kind:ExternalImportKind,rows:Array<Record<string,unknown>>)=>rows.map(row=>{
  if(kind==='stock')return{
    plate:cleanPlate(value(row,aliases.plate)),vehicle:String(value(row,aliases.vehicle)||'').trim(),
    brand:String(value(row,aliases.brand)||'').trim(),year:String(value(row,aliases.year)||'').trim(),
    km:number(value(row,aliases.km)),cost:number(value(row,aliases.cost)),fipe:number(value(row,aliases.fipe)),
    askingPrice:number(value(row,aliases.asking)),location:String(value(row,aliases.location)||'').trim(),
    status:String(value(row,aliases.status)||'Disponível').trim()||'Disponível',entryDate:isoDate(value(row,aliases.entryDate)),
  };
  if(kind==='customers')return{
    name:String(value(row,aliases.name)||'').trim(),phone:digits(value(row,aliases.phone)),email:String(value(row,aliases.email)||'').trim().toLowerCase(),
    document:digits(value(row,aliases.document),14),address:String(value(row,aliases.address)||'').trim(),city:String(value(row,aliases.city)||'').trim(),
    state:String(value(row,aliases.state)||'').trim().toUpperCase().slice(0,2),zipCode:digits(value(row,aliases.zip),8),
  };
  if(kind==='suppliers')return{
    name:String(value(row,aliases.name)||'').trim(),phone:digits(value(row,aliases.phone)),email:String(value(row,aliases.email)||'').trim().toLowerCase(),
    document:digits(value(row,aliases.document),14),pixKey:String(value(row,aliases.pix)||'').trim(),bankInfo:String(value(row,aliases.bank)||'').trim(),
  };
  const typeRaw=norm(value(row,aliases.financeType));
  const statusRaw=norm(value(row,aliases.financeStatus));
  return{
    entryType:(typeRaw.includes('receber')||typeRaw.includes('receita')||typeRaw==='r'?'receivable':'payable') as FinanceEntryType,
    category:String(value(row,aliases.category)||'Migração DMS').trim(),description:String(value(row,aliases.description)||'Lançamento migrado').trim(),
    party:String(value(row,aliases.party)||'Não informado').trim(),amount:number(value(row,aliases.amount)),dueDate:isoDate(value(row,aliases.dueDate)),
    importedStatus:statusRaw,
  };
});

const chunks=<T,>(rows:T[],size=8)=>Array.from({length:Math.ceil(rows.length/size)},(_,index)=>rows.slice(index*size,index*size+size));

export const dmsExternalImportService={
  parse:async(file:File,forcedKind?:ExternalImportKind):Promise<ExternalImportPreview>=>{
    const buffer=await file.arrayBuffer();
    const workbook=XLSX.read(buffer,{type:'array',cellDates:true});
    const sheetName=workbook.SheetNames[0];
    if(!sheetName)throw new Error('A planilha não possui abas.');
    const sheet=workbook.Sheets[sheetName];
    const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:'',raw:true});
    if(!rows.length)throw new Error('A primeira aba da planilha está vazia.');
    const headers=Array.from(new Set(rows.flatMap(row=>Object.keys(row))));
    const kind=forcedKind||detect(headers);
    const normalized=normalizeRows(kind,rows);
    const warnings:string[]=[];
    if(kind==='stock'){
      const invalid=normalized.filter(row=>!/^[A-Z0-9]{7}$/.test(String(row.plate||''))||!String(row.vehicle||'').trim()).length;
      if(invalid)warnings.push(`${invalid} linha(s) de estoque sem placa/modelo válido serão ignoradas.`);
    }else if(kind==='customers'||kind==='suppliers'){
      const invalid=normalized.filter(row=>!String(row.name||'').trim()).length;
      if(invalid)warnings.push(`${invalid} linha(s) sem nome serão ignoradas.`);
    }else{
      const invalid=normalized.filter(row=>Number(row.amount||0)<=0).length;
      if(invalid)warnings.push(`${invalid} lançamento(s) sem valor positivo serão ignorados.`);
    }
    return{kind,fileName:file.name,sheetName,headers,rows,normalized,warnings};
  },

  commit:async(input:{
    preview:ExternalImportPreview;companyId:string;storeId:string;actor:User;
  })=>{
    const {preview,companyId,storeId,actor}=input;
    let imported=0,ignored=0;
    if(preview.kind==='stock'){
      const valid=preview.normalized.filter(row=>/^[A-Z0-9]{7}$/.test(String(row.plate||''))&&String(row.vehicle||'').trim());
      ignored=preview.normalized.length-valid.length;
      const items:OperationalStockItem[]=valid.map((row,index)=>({
        id:`external_stock_${Date.now()}_${index}`,snapshotDate:new Date().toISOString().slice(0,10),
        plate:String(row.plate),vehicle:String(row.vehicle),model:String(row.vehicle),
        brand:String(row.brand||''),year:String(row.year||''),km:Number(row.km)||0,stockDays:0,
        cost:Number(row.cost)||0,purchaseCost:Number(row.cost)||0,prepCost:0,fipe:Number(row.fipe)||0,
        askingPrice:Number(row.askingPrice)||0,entryDate:String(row.entryDate||''),location:String(row.location||''),
        status:String(row.status||'Disponível'),source:'import',companyId,storeId,
      }));
      await currentStockService.replaceImported(items,actor,storeId,companyId);
      imported=items.length;
    }else if(preview.kind==='customers'){
      const valid=preview.normalized.filter(row=>String(row.name||'').trim());
      ignored=preview.normalized.length-valid.length;
      for(const group of chunks(valid)){
        await Promise.all(group.map(row=>dmsCustomerService.ensure({
          companyId,storeId,name:String(row.name),phone:String(row.phone||''),email:String(row.email||''),document:String(row.document||''),
          address:String(row.address||''),city:String(row.city||''),state:String(row.state||''),zipCode:String(row.zipCode||''),actor,
        })));
      }
      imported=valid.length;
    }else if(preview.kind==='suppliers'){
      const valid=preview.normalized.filter(row=>String(row.name||'').trim());
      ignored=preview.normalized.length-valid.length;
      for(const group of chunks(valid)){
        await Promise.all(group.map(row=>dmsSupplierService.ensure({
          companyId,storeId,name:String(row.name),phone:String(row.phone||''),email:String(row.email||''),document:String(row.document||''),
          pixKey:String(row.pixKey||''),bankInfo:String(row.bankInfo||''),actor,
        })));
      }
      imported=valid.length;
    }else{
      const valid=preview.normalized.filter(row=>Number(row.amount||0)>0);
      ignored=preview.normalized.length-valid.length;
      for(const row of valid){
        const entry=await financeService.create({
          entryType:row.entryType as FinanceEntryType,category:String(row.category||'Migração DMS'),
          description:String(row.description||'Lançamento migrado'),party:String(row.party||'Não informado'),amount:Number(row.amount)||0,
          dueDate:String(row.dueDate||'')||undefined,origin:'other',companyId,storeId,actor,
        });
        const status=String(row.importedStatus||'');
        if(status.includes('pago')||status.includes('paid')||status.includes('recebido')||status.includes('received')){
          await financeService.settle(entry,actor,'Migração DMS',preview.fileName);
        }
        imported+=1;
      }
    }
    await dmsAuditService.record({
      companyId,storeId,entityType:'system',entityId:`external_import_${Date.now()}`,
      action:'external_dms_import',label:`Migração de outro DMS: ${preview.kind}`,
      details:`${preview.fileName} · aba ${preview.sheetName} · importados=${imported} · ignorados=${ignored}`,actor,
    }).catch(()=>undefined);
    return{imported,ignored,kind:preview.kind};
  },
};
