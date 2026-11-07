import * as XLSX from 'xlsx';

export type DealerStockVehicle={
 key:string;plate:string;chassis:string;brand:string;model:string;year:string;
 km:number;kmOriginal:string;kmValid:boolean;fuel:string;transmission:string;days:number;price:number;purchase:number;cost:number;
 operationalCost:number;osRule:number;osOutside:number;store:string;buyingCompany:string;
 location:string;condition:string;vehicleType:'car'|'motorcycle';serviceOrders:number;
 familyKey:string;exactKey:string;
};
export type DealerStockSnapshot={
 importedAt:string;reportDate:string;vehicles:DealerStockVehicle[];
 duplicateCount:number;warnings:string[];stores:string[];serviceOrderRows:number;
};
export type DealerRadarStats={
 count:number;stores:number;costTotal:number;daysAverage:number;daysMedian:number;
 priceMissing:number;underCost:number;over90:number;
 ageBuckets:{name:string;count:number}[];capitalCostEstimate:number;
};
export type DealerSnapshotDiff={
 entries:DealerStockVehicle[];exits:DealerStockVehicle[];
 transfers:{before:DealerStockVehicle;after:DealerStockVehicle}[];
 priceChanges:{before:DealerStockVehicle;after:DealerStockVehicle}[];
};
type Cell=string|number|boolean|null|undefined;
const text=(value:Cell)=>String(value??'').trim();
const normalized=(value:Cell)=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const number=(value:Cell)=>{
 if(typeof value==='number')return Number.isFinite(value)?value:0;
 const raw=text(value).replace(/R\$\s*/gi,'').replace(/\s/g,'');
 if(!raw)return 0;
 const decimal=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;
 const num=Number(decimal);return Number.isFinite(num)?num:0;
};
const keyFor=(plate:string,chassis:string)=>chassis&&chassis.length===17?
 'VIN:'+chassis:plate?'PLATE:'+plate:'';
const canonicalBrand=(value:string)=>{
 const s=normalized(value);
 if(/VOLKS|^VW$/.test(s))return 'VOLKSWAGEN';
 if(/^GM\b|CHEVROLET/.test(s))return 'CHEVROLET';
 if(/MERCEDES/.test(s))return 'MERCEDES-BENZ';
 return s;
};
const vehicleFamily=(brand:string,model:string)=>{
 const s=normalized(model).replace(/^(I VW|VW|GM|CHEVROLET|VOLKSWAGEN|FIAT|RENAULT|FORD)\s+/,'');
 const tokens=s.split(' ').filter(Boolean);
 // Family is a broad inventory signal, not equivalent to the exact FIPE trim.
 return canonicalBrand(brand)+'|'+(tokens[0]||'DESCONHECIDO');
};
const isMotorcycle=(brand:string,store:string,model:string)=>/MOTO|ROYAL ENFIELD|TRIUMPH|HARLEY|DAFRA|KAWASAKI|YAMAHA|HONDA MOTOS|BMW MOTORRAD/i.test(
 brand+' '+store+' '+model);
export const DEALER_STOCK_HEADERS=[
 'Empresa Compra','Estoque Atual','Modelo','Placa','Km','Dias','Preço Sugerido',
 'Marca','Ano Fab/Mod','Chassis','Valor Compra','Valor Custo'
] as const;
export function parseDealerStockRows(table:Cell[][],serviceRows:Cell[][]=[],dateHint=''):DealerStockSnapshot{
 const headerIndex=table.findIndex(r=>r.some(v=>normalized(v)==='PLACA')&&
  r.some(v=>normalized(v)==='PRECO SUGERIDO')&&r.some(v=>normalized(v)==='VALOR CUSTO'));
 if(headerIndex<0)throw new Error('A aba Consulta não contém o cabeçalho esperado do Dealer V44.');
 const header=table[headerIndex].map(normalized);
 const get=(r:Cell[],name:string):Cell=>r[header.indexOf(normalized(name))];
 for(const h of DEALER_STOCK_HEADERS)if(header.indexOf(normalized(h))<0)
  throw new Error('Falta a coluna obrigatória: '+h);
 const dateFromSheet=table.slice(0,headerIndex).flat().map(text)
  .find(v=>/Atualizado.*\d{2}\/\d{2}\/\d{4}/i.test(v));
 const match=dateFromSheet?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
 const reportDate=dateHint||(match?match[3]+'-'+match[2]+'-'+match[1]:'');
 const vehicles=new Map<string,DealerStockVehicle>();
 const warnings:string[]=[];let duplicateCount=0;let invalidKm=0;
 for(const row of table.slice(headerIndex+1,headerIndex+6001)){
  const plate=normalized(get(row,'Placa')).replace(/\s/g,'');
  const chassis=normalized(get(row,'Chassis')).replace(/\s/g,'');
  const model=text(get(row,'Modelo')),brand=text(get(row,'Marca'));
  const id=keyFor(plate,chassis);
  if(!model||!brand||!id)continue;
  const kmOriginal=text(get(row,'Km')),km=number(get(row,'Km')),days=number(get(row,'Dias'));
  const kmValid=kmOriginal!==''&&Number.isFinite(km)&&km>=0&&km<=999999;
  // Never discard a real stock vehicle because mileage is suspect.
  // Keep it in valuation/cost/stock KPIs; exclude the suspect mileage itself.
  if(!kmValid)invalidKm++;
  if(!Number.isFinite(days)||days<0||days>3000)continue;
  const price=number(get(row,'Preço Sugerido'));
  const purchase=number(get(row,'Valor Compra')),cost=number(get(row,'Valor Custo'));
  const store=text(get(row,'Estoque Atual'));
  const v:DealerStockVehicle={
   key:id,plate,chassis,brand,model,year:text(get(row,'Ano Fab/Mod')),
   km:kmValid?km:0,kmOriginal,kmValid,fuel:text(get(row,'Comb.')),transmission:text(get(row,'Transmissão')),
   days:Math.round(days),price:price>=0&&price<=20000000?price:0,
   purchase:purchase>=0&&purchase<=20000000?purchase:0,
   cost:cost>=0&&cost<=20000000?cost:0,
   operationalCost:number(get(row,'Custo Oper.')),osRule:number(get(row,'OS_Regra')),
   osOutside:number(get(row,'OS_Fora Regra')),store,
   buyingCompany:text(get(row,'Empresa Compra')),location:text(get(row,'Localização')),
   condition:text(get(row,'Situação')),vehicleType:isMotorcycle(brand,store,model)?'motorcycle':'car',
   serviceOrders:0,familyKey:vehicleFamily(brand,model),
   exactKey:canonicalBrand(brand)+'|'+normalized(model)+'|'+normalized(get(row,'Ano Fab/Mod'))
  };
  const existing=vehicles.get(id);
  if(existing){
   duplicateCount++;
   if([v.plate,v.cost,v.price,v.store].filter(Boolean).length<=
      [existing.plate,existing.cost,existing.price,existing.store].filter(Boolean).length)continue;
  }
  vehicles.set(id,v);
 }
 if(!vehicles.size)throw new Error('Nenhum veículo válido foi identificado na aba Consulta.');
 if(invalidKm)warnings.push(invalidKm+' veículo(s) com KM inconsistente mantido(s) no estoque; confira a quilometragem.');
 if(duplicateCount)warnings.push(duplicateCount+' duplicata(s) de placa/chassi consolidadas.');
 // Service orders are matched by chassis first, by license plate only as fallback.
 // They are informational and must never be added to Valor Custo a second time.
 if(serviceRows.length){
  const osHeader=serviceRows[0].map(normalized),vinIndex=osHeader.indexOf('VEICULO CHASSI'),
   plateIndex=osHeader.indexOf('VEICULO PLACA'),orderIndex=osHeader.indexOf('K OS CODIGO');
  const byVin=new Map([...vehicles.values()].filter(v=>v.chassis).map(v=>[v.chassis,v]));
  const byPlate=new Map([...vehicles.values()].filter(v=>v.plate).map(v=>[v.plate,v]));
  const seen=new Set<string>();
  for(const r of serviceRows.slice(1,12001)){
   const vin=normalized(r[vinIndex]).replace(/\s/g,'');
   const plate=normalized(r[plateIndex]).replace(/\s/g,'');
   const v=byVin.get(vin)||byPlate.get(plate);
   if(!v)continue;
   const order=text(r[orderIndex])||String(seen.size+1);
   const key=v.key+'|'+order;
   if(seen.has(key))continue;
   seen.add(key);v.serviceOrders++;
  }
 }
 const all=[...vehicles.values()];
 return {importedAt:new Date().toISOString(),reportDate,vehicles:all,
  duplicateCount,warnings,stores:[...new Set(all.map(v=>v.store).filter(Boolean))].sort(),
  serviceOrderRows:all.reduce((sum,v)=>sum+v.serviceOrders,0)};
}
export async function readDealerWorkbook(file:File):Promise<DealerStockSnapshot>{
 if(!/\.(xlsx|xlsm)$/i.test(file.name))throw new Error('Selecione um relatório Dealer .xlsx ou .xlsm.');
 if(file.size>42*1024*1024)throw new Error('Arquivo acima de 42 MB. Exporte um relatório menor.');
 const buffer=await file.arrayBuffer();
 // Reading XLSM data never executes VBA/macros.
 const book=XLSX.read(buffer,{type:'array',bookVBA:false,cellFormula:false,cellHTML:false});
 const sheet=book.Sheets['Consulta'];
 if(!sheet)throw new Error('Não encontrei a aba Consulta nesse relatório.');
 const table=XLSX.utils.sheet_to_json<Cell[]>(sheet,{header:1,raw:true,defval:'',blankrows:false});
 const os=book.Sheets['OrdensServ'];
 const serviceRows=os?XLSX.utils.sheet_to_json<Cell[]>(os,{header:1,raw:true,defval:'',blankrows:false}):[];
 return parseDealerStockRows(table,serviceRows);
}
const avg=(arr:number[])=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;
export function dealerRadarStats(rows:DealerStockVehicle[],monthlyCapitalPercent=1.5):DealerRadarStats{
 const days=rows.map(v=>v.days).sort((a,b)=>a-b);
 const priced=rows.filter(v=>v.price>0);
 const total=rows.reduce((s,v)=>s+v.cost,0);
 const median=days.length%2?days[(days.length-1)/2]||0:
  ((days[days.length/2-1]||0)+(days[days.length/2]||0))/2;
 const buckets=[
  ['0 a 30',0,30],['31 a 60',31,60],['61 a 90',61,90],
  ['91 a 120',91,120],['121 a 180',121,180],['181+',181,3000]
 ] as const;
 return {count:rows.length,stores:new Set(rows.map(v=>v.store).filter(Boolean)).size,
  costTotal:total,daysAverage:avg(days),daysMedian:median,
  priceMissing:rows.length-priced.length,
  underCost:priced.filter(v=>v.cost>0&&v.price<v.cost).length,
  over90:rows.filter(v=>v.days>90).length,
  ageBuckets:buckets.map(([name,min,max])=>({name,count:rows.filter(v=>v.days>=min&&v.days<=max).length})),
  capitalCostEstimate:rows.reduce((s,v)=>s+v.cost*(monthlyCapitalPercent/100)*(v.days/30),0)
 };
}
export function dealerSimilarStock(rows:DealerStockVehicle[],target:DealerStockVehicle){
 return rows.filter(v=>v.key!==target.key&&v.familyKey===target.familyKey)
  .sort((a,b)=>Math.abs(a.days-target.days)-Math.abs(b.days-target.days));
}
export function compareDealerSnapshots(previous:DealerStockSnapshot,current:DealerStockSnapshot):DealerSnapshotDiff{
 const prev=new Map(previous.vehicles.map(v=>[v.key,v])),cur=new Map(current.vehicles.map(v=>[v.key,v]));
 const entries=current.vehicles.filter(v=>!prev.has(v.key));
 const exits=previous.vehicles.filter(v=>!cur.has(v.key));
 const transfers:DealerSnapshotDiff['transfers']=[],priceChanges:DealerSnapshotDiff['priceChanges']=[];
 for(const after of current.vehicles){
  const before=prev.get(after.key);if(!before)continue;
  if(before.store!==after.store)transfers.push({before,after});
  if(before.price!==after.price)priceChanges.push({before,after});
 }
 return {entries,exits,transfers,priceChanges};
}
export function dealerRiskFlags(v:DealerStockVehicle){
 const f:string[]=[];
 if(v.days>90)f.push('Mais de 90 dias em estoque');
 if(v.price<=0)f.push('Sem preço sugerido');
 else if(v.cost>0&&v.price<v.cost)f.push('Preço sugerido abaixo do custo informado');
 if(!v.kmValid)f.push('KM inconsistente: conferir no Dealer');
 else if(v.km>250000)f.push('KM elevado: conferir');
 return f;
}
