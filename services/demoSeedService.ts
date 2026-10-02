import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Company, MarketPresenceItem, OperationalPerformanceSeller, OperationalSaleItem,
  OperationalStockItem, PrepOrder, ShowroomPassage, ShowroomQueueState, Store, User,
} from '../types';
import { companyService } from './companyService';
import { companyScopeService } from './companyScopeService';
import { storeService } from './storeService';
import { storeScopeService } from './storeScopeService';
import { userService } from './userService';

export const DEMO_COMPANY_ID = 'motyq-demo';
export const DEMO_STORE_ID = 'motyq-demo-principal';

export const DEMO_COMPANY: Company = {
  id: DEMO_COMPANY_ID,
  slug: DEMO_COMPANY_ID,
  name: 'Motyq Demo Motors',
  plan: 'enterprise',
  status: 'active',
  environment:'demo',
  createdAt: '2026-08-01T00:00:00.000Z',
};

export const DEMO_STORE: Store = {
  id: DEMO_STORE_ID,
  code: 'DEMO',
  name: 'Motyq Demo Motors · Matriz',
  active: true,
  companyId: DEMO_COMPANY_ID,
  environment:'demo',
};

const safeId = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]/g, '-')
  .replace(/-+/g, '-')
  .slice(0, 150);

const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

const monthDate = (day:number) => {
  const now=new Date();
  return localDate(new Date(now.getFullYear(),now.getMonth(),Math.max(1,Math.min(day,now.getDate()))));
};

const daysAgo = (days:number, hour=10, minute=0) => {
  const date=new Date();
  date.setDate(date.getDate()-days);
  date.setHours(hour,minute,0,0);
  return date.toISOString();
};

const daysAhead = (days:number, hour=10, minute=0) => {
  const date=new Date();
  date.setDate(date.getDate()+days);
  date.setHours(hour,minute,0,0);
  return date.toISOString();
};

const demoUsers: User[] = [
  { id:'mariana.lopes@demo.motyq',email:'mariana.lopes@demo.motyq',name:'Mariana Lopes',role:'manager',status:'active',companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,storeIds:[DEMO_STORE_ID],companyPlan:'enterprise',companyStatus:'active' },
  { id:'ana.costa@demo.motyq',email:'ana.costa@demo.motyq',name:'Ana Costa',role:'seller',status:'active',companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,storeIds:[DEMO_STORE_ID],companyPlan:'enterprise',companyStatus:'active',goals:{monthly:15,firstHalf:6,capture:60,margin:8} },
  { id:'bruno.lima@demo.motyq',email:'bruno.lima@demo.motyq',name:'Bruno Lima',role:'seller',status:'active',companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,storeIds:[DEMO_STORE_ID],companyPlan:'enterprise',companyStatus:'active',goals:{monthly:15,firstHalf:6,capture:60,margin:8} },
  { id:'carla.mendes@demo.motyq',email:'carla.mendes@demo.motyq',name:'Carla Mendes',role:'seller',status:'active',companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,storeIds:[DEMO_STORE_ID],companyPlan:'enterprise',companyStatus:'active',goals:{monthly:15,firstHalf:6,capture:60,margin:8} },
  { id:'diego.rocha@demo.motyq',email:'diego.rocha@demo.motyq',name:'Diego Rocha',role:'seller',status:'active',companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,storeIds:[DEMO_STORE_ID],companyPlan:'enterprise',companyStatus:'active',goals:{monthly:15,firstHalf:6,capture:60,margin:8} },
  { id:'julia.alves@demo.motyq',email:'julia.alves@demo.motyq',name:'Júlia Alves',role:'reception',status:'active',companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,storeIds:[DEMO_STORE_ID],companyPlan:'enterprise',companyStatus:'active' },
  { id:'ricardo.nunes@demo.motyq',email:'ricardo.nunes@demo.motyq',name:'Ricardo Nunes',role:'evaluator',status:'active',companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,storeIds:[DEMO_STORE_ID],companyPlan:'enterprise',companyStatus:'active' },
  { id:'rafael.martins@demo.motyq',email:'rafael.martins@demo.motyq',name:'Rafael Martins',role:'director',status:'active',companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,storeIds:[DEMO_STORE_ID],companyPlan:'enterprise',companyStatus:'active' },
];

const seller = (
  name:string,key:string,sales:number,flow:number,margin:number,capture:number,projection:number,evaluations:number,passages:number,
):OperationalPerformanceSeller=>{
  const marginPerCar=Number((5400+margin*240).toFixed(2));
  const orders=Math.max(Math.round(flow*.62),sales);
  return{
    seller:name,sellerKey:key,passages,orders,flowTotal:flow,
    orderPercent:flow?orders/flow*100:0,workInPeriod:22,avgContactsPerDay:Number((flow/22).toFixed(1)),
    evaluations,evaluationRate:passages?evaluations/passages*100:0,
    closing:sales,syonetSales:sales,closingPercent:flow?sales/flow*100:0,
    marginPerCar,marginTotal:marginPerCar*sales,marginPercent:margin,
    captureQty:capture,capturePercent:sales?capture/sales*100:0,
    pipeline:Math.max(projection-sales,0),projection,additionalPurchase:Math.max(Math.round(sales*.18),0),
  };
};

export const demoPerformanceSnapshots=()=>{
  const now=new Date();
  const day=Math.max(1,now.getDate());
  const baseline=[
    seller('Ana Costa','ana-costa',6,34,7.7,3,14,12,24),
    seller('Bruno Lima','bruno-lima',5,32,7.0,2,12,10,22),
    seller('Carla Mendes','carla-mendes',6,36,8.0,4,14,14,25),
    seller('Diego Rocha','diego-rocha',3,30,6.2,1,10,8,21),
  ];
  const middle=[
    seller('Ana Costa','ana-costa',11,49,8.8,7,17,20,34),
    seller('Bruno Lima','bruno-lima',9,45,7.4,5,15,18,32),
    seller('Carla Mendes','carla-mendes',10,48,8.5,7,17,21,35),
    seller('Diego Rocha','diego-rocha',6,42,6.6,2,12,13,30),
  ];
  const current=[
    seller('Ana Costa','ana-costa',16,61,9.4,11,18,30,43),
    seller('Bruno Lima','bruno-lima',13,58,7.8,7,15,26,41),
    seller('Carla Mendes','carla-mendes',15,60,8.7,10,17,29,44),
    seller('Diego Rocha','diego-rocha',9,53,6.9,4,13,20,38),
  ];
  return[
    {referenceDate:monthDate(Math.min(3,day)),sheetName:'Demo · abertura do mês',sellers:baseline},
    {referenceDate:monthDate(Math.min(15,day)),sheetName:'Demo · meio do mês',sellers:middle},
    {referenceDate:localDate(now),sheetName:'Demo · operação de hoje',sellers:current},
  ].filter((item,index,items)=>items.findIndex(other=>other.referenceDate===item.referenceDate)===index);
};

type DemoStockTuple=[string,string,number,number,number,number,string,number,string,string,string];

const stockTuples:DemoStockTuple[]=[
  ['DMT1A01','VW Nivus Highline 2023',178,101500,116500,109900,'2022/2023',68400,'Cinza','Volkswagen','Automático'],
  ['DMT2B02','Jeep Renegade Longitude 2022',146,81500,94500,87900,'2021/2022',73100,'Branco','Jeep','Automático'],
  ['DMT3C03','Hyundai Creta Limited 2022',132,100500,118000,109900,'2022/2022',62900,'Prata','Hyundai','Automático'],
  ['DMT4D04','Toyota Corolla XEi 2021',111,111000,126500,119900,'2020/2021',78200,'Preto','Toyota','Automático'],
  ['DMT5E05','Fiat Strada Freedom 2024',96,78500,89500,82900,'2023/2024',41300,'Branco','Fiat','Manual'],
  ['DMT6F06','Chevrolet Tracker LT 2023',82,86800,99000,92900,'2022/2023',52800,'Azul','Chevrolet','Automático'],
  ['DMT7G07','VW T-Cross Comfortline 2023',75,95800,109000,102900,'2022/2023',46900,'Cinza','Volkswagen','Automático'],
  ['DMT8H08','Hyundai HB20 Platinum 2024',64,72200,81500,76900,'2023/2024',33700,'Prata','Hyundai','Automático'],
  ['DMT9J09','Fiat Pulse Audace 2024',58,83800,95500,89900,'2023/2024',29200,'Vermelho','Fiat','Automático'],
  ['DMT0K10','Honda City EX 2023',47,96800,108500,103900,'2022/2023',44600,'Branco','Honda','Automático'],
  ['DMT1L11','VW Polo Highline 2024',38,81700,92500,87900,'2023/2024',25500,'Cinza','Volkswagen','Automático'],
  ['DMT2M12','Chevrolet Onix Premier 2024',31,78900,89500,84900,'2023/2024',31100,'Preto','Chevrolet','Automático'],
  ['DMT3N13','Fiat Fastback Audace 2024',26,100500,113500,107900,'2023/2024',22700,'Cinza','Fiat','Automático'],
  ['DMT4P14','Nissan Kicks Exclusive 2023',20,99900,112000,106900,'2022/2023',37400,'Azul','Nissan','Automático'],
  ['DMT5Q15','Jeep Compass Longitude 2022',16,117500,132500,125900,'2021/2022',59200,'Branco','Jeep','Automático'],
  ['DMT6R16','BYD Dolphin GS 2024',12,112000,126000,119900,'2023/2024',18300,'Cinza','BYD','Automático'],
  ['DMT7S17','Toyota Yaris XLS 2024',8,98200,109500,104900,'2023/2024',20100,'Prata','Toyota','Automático'],
  ['DMT8T18','VW Virtus Highline 2024',5,108500,121500,115900,'2023/2024',14600,'Branco','Volkswagen','Automático'],
];

export const demoStockRows=():OperationalStockItem[]=>{
  const snapshotDate=localDate();
  return stockTuples.map(([plate,vehicle,stockDays,cost,fipe,askingPrice],index)=>({
    id:safeId(`${DEMO_COMPANY_ID}_${DEMO_STORE_ID}_${snapshotDate}_${plate}`),
    snapshotDate,plate,vehicle,stockDays,cost,fipe,askingPrice,
    location:index<7?'Pátio A':index<13?'Pátio B':'Showroom',
    status:'available',companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,
  }));
};

const seedCompaniesStoresUsers=async()=>{
  const companies=await companyService.getAll();
  await companyService.saveAll([...companies.filter(item=>item.id!==DEMO_COMPANY_ID),DEMO_COMPANY]);
  const stores=await storeService.getAll();
  await storeService.saveAll([...stores.filter(item=>item.id!==DEMO_STORE_ID),DEMO_STORE]);
  await Promise.all(demoUsers.map(user=>userService.save({...user,createdAt:user.createdAt||daysAgo(60)})));
};

const seedPerformance=async()=>{
  const snapshots=demoPerformanceSnapshots();
  await Promise.all(snapshots.map(snapshot=>setDoc(
    doc(db,'operational_meta',`performance_${safeId(DEMO_STORE_ID)}_${safeId(snapshot.referenceDate)}`),
    {...snapshot,companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,sourceFile:'Mapa Performance · Demo Motors.xlsx',importedBy:'demo@motyq.com.br',updatedAt:serverTimestamp()},
    {merge:true},
  )));
  const latest=snapshots[snapshots.length-1];
  await setDoc(doc(db,'operational_meta',`current_${safeId(DEMO_STORE_ID)}`),{
    companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,latestPerformanceDate:latest.referenceDate,
    performanceRowsLastImport:latest.sellers.length,updatedAt:serverTimestamp(),
  },{merge:true});
};

const seedStock=async()=>{
  const stock=demoStockRows();
  const snapshotDate=stock[0].snapshotDate;
  const batchId=`demo-stock-${snapshotDate}`;
  await Promise.all(stock.map(item=>setDoc(doc(db,'operational_stock',item.id),item,{merge:true})));

  const currentValue=stock.reduce((sum,item)=>sum+item.cost,0);
  const aged=stock.filter(item=>item.stockDays>60);
  const critical=stock.filter(item=>item.stockDays>90);
  const points=[
    {date:monthDate(3),count:24,value:2185000,aged60:12,critical90:8,criticalValue:862000},
    {date:monthDate(15),count:21,value:1938000,aged60:10,critical90:6,criticalValue:641000},
    {date:snapshotDate,count:stock.length,value:currentValue,aged60:aged.length,critical90:critical.length,criticalValue:critical.reduce((sum,item)=>sum+item.cost,0)},
  ];
  await Promise.all(points.filter((p,i,a)=>a.findIndex(x=>x.date===p.date)===i).map(point=>setDoc(
    doc(db,'operational_meta',`stock_summary_${safeId(DEMO_STORE_ID)}_${safeId(point.date)}`),
    {referenceDate:point.date,companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,stockCount:point.count,stockValue:point.value,aged60:point.aged60,critical90:point.critical90,critical90Value:point.criticalValue,updatedAt:serverTimestamp()},
    {merge:true},
  )));
  await setDoc(doc(db,'operational_meta',`current_${safeId(DEMO_STORE_ID)}`),{
    companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,latestStockDate:snapshotDate,latestStockBatchId:batchId,stockRows:stock.length,updatedAt:serverTimestamp(),
  },{merge:true});

  const groupItems=stockTuples.map(([plate,model,days,cost,,suggestedPrice,year,km,color,brand,transmission])=>({
    plate,model,stockOwner:'Motyq Demo Motors',location:'Matriz',days,cost,suggestedPrice,km,year,color,
    fuel:brand==='BYD'?'Elétrico':'Flex',transmission,brand,status:'Disponível',transit:'',notices:days>120?['Aging crítico','Prioridade de giro']:days>90?['Acima de 90 dias']:[],
  }));
  await setDoc(doc(db,'config',`group_stock_${safeId(DEMO_COMPANY_ID)}`),{
    companyId:DEMO_COMPANY_ID,items:groupItems,sourceFile:'Estoque Demo Motors.xlsx',sourceUpdatedAt:snapshotDate,
    importedAt:new Date().toISOString(),importedBy:'demo@motyq.com.br',rows:groupItems.length,addedRows:0,updatedAt:serverTimestamp(),
  },{merge:false});
};

const seedSales=async()=>{
  const targets=[
    {name:'Ana Costa',key:'ana',count:16,base:112000,margin:9.4},
    {name:'Bruno Lima',key:'bruno',count:13,base:92000,margin:7.8},
    {name:'Carla Mendes',key:'carla',count:15,base:106000,margin:8.7},
    {name:'Diego Rocha',key:'diego',count:9,base:88000,margin:6.9},
  ];
  const models=['VW T-Cross','Chevrolet Tracker','Hyundai Creta','Fiat Pulse','Honda City','Nissan Kicks','Jeep Renegade','Toyota Corolla','VW Nivus','Chevrolet Onix'];
  const today=new Date().getDate();
  const rows:OperationalSaleItem[]=[];
  let seq=1;
  for(const target of targets){
    for(let i=0;i<target.count;i++){
      const invoiceValue=target.base+((i%5)-2)*3500;
      const marginPercent=Number((target.margin+((i%3)-1)*.45).toFixed(1));
      const marginValue=Math.round(invoiceValue*marginPercent/100);
      const day=((seq*3)%Math.max(today,1))+1;
      rows.push({
        id:`demo_sale_${target.key}_${String(i+1).padStart(2,'0')}`,
        saleDate:monthDate(Math.min(day,today)),
        plate:`VDM${String(seq).padStart(4,'0')}`.slice(0,7),
        vehicle:models[(seq-1)%models.length],
        seller:target.name,invoiceValue,marginValue,marginPercent,hasTradeIn:seq%3!==0,
        companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,
      });
      seq++;
    }
  }
  await Promise.all(rows.map(item=>setDoc(doc(db,'operational_sales',item.id),item,{merge:true})));
  await setDoc(doc(db,'operational_meta',`current_${safeId(DEMO_STORE_ID)}`),{
    companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,latestSalesImportDate:localDate(),salesRowsLastImport:rows.length,updatedAt:serverTimestamp(),
  },{merge:true});
};

const proposal=(id:string,vehicle:string,plate:string,price:number,createdByEmail:string,createdByName:string)=>({
  id,version:1,status:'sent' as const,vehicle,plate,year:'2023/2024',km:28000,location:'Matriz',
  stockPriceAtCreation:price,salePrice:price-1500,discount:1500,tradeInPlate:'ABC1D23',tradeInValue:55000,tradeInDebt:12000,
  cashEntry:18000,financedAmount:price-1500-55000+12000-18000,installments:48,estimatedInstallment:1890,
  notes:'Cliente avaliando condição com veículo na troca.',createdAt:daysAgo(1,14),createdByEmail,createdByName,updatedAt:daysAgo(1,14),updatedByEmail:createdByEmail,updatedByName:createdByName,
});

const activity=(id:string,type:any,at:string,label:string,status:any,details='',byEmail='',byName='')=>({id,type,at,label,status,details,byEmail,byName});

const crmRows=():ShowroomPassage[]=>{
  const sellers=[
    {id:'ana.costa@demo.motyq',email:'ana.costa@demo.motyq',name:'Ana Costa'},
    {id:'bruno.lima@demo.motyq',email:'bruno.lima@demo.motyq',name:'Bruno Lima'},
    {id:'carla.mendes@demo.motyq',email:'carla.mendes@demo.motyq',name:'Carla Mendes'},
    {id:'diego.rocha@demo.motyq',email:'diego.rocha@demo.motyq',name:'Diego Rocha'},
  ];
  const base=(id:string,customer:string,phone:string,interest:string,sellerIndex:number,status:any,createdAt:string,source:any,temp:any,notes:string):ShowroomPassage=>{
    const s=sellers[sellerIndex];
    return{
      id,customerName:customer,phone,interestModel:interest,desiredVehicle:interest,origin:'walk_in',
      assignedSellerId:s.id,assignedSellerEmail:s.email,assignedSellerName:s.name,status,
      createdAt,updatedAt:createdAt,notes,leadSource:source,sourceLabel:source==='showroom'?'Loja':source==='web'?'Site Motyq Demo':source==='whatsapp'?'WhatsApp':'Instagram',
      leadTemperature:temp,preferredContact:'whatsapp',purchaseTimeline:temp==='hot'?'Até 7 dias':temp==='warm'?'Este mês':'Sem urgência',
      customerEmail:`${safeId(customer).toLowerCase()}@exemplo.com`,desiredEntry:25000,desiredPayment:1900,
      activityHistory:[activity(`act_${id}`,'created',createdAt,'Lead criado',status,`Interesse: ${interest}`,'julia.alves@demo.motyq','Júlia Alves')],
      createdBy:'julia.alves@demo.motyq',createdByName:'Júlia Alves',companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,
    };
  };
  const rows=[
    base('demo_crm_01','Eduardo Lima','15900001001','VW T-Cross Comfortline',0,'waiting',daysAgo(0,9,12),'showroom','hot','Cliente chegou com veículo para avaliação.'),
    base('demo_crm_02','Patrícia Gomes','15900001002','Hyundai Creta Limited',1,'waiting',daysAgo(0,10,4),'showroom','warm','Primeira visita. Quer comparar Creta e Kicks.'),
    base('demo_crm_03','Marcelo Souza','15900001003','Jeep Compass Longitude',2,'in_service',daysAgo(0,10,20),'showroom','hot','Atendimento em andamento. Tem Compass 2018 na troca.'),
    base('demo_crm_04','Fernanda Alves','15900001004','BYD Dolphin GS',3,'in_service',daysAgo(0,11,0),'web','hot','Lead do site. Perguntou financiamento e garantia.'),
    base('demo_crm_05','Roberto Mendes','15900001005','Toyota Corolla XEi',0,'evaluation',daysAgo(1,16),'whatsapp','hot','Veículo de troca em avaliação.'),
    base('demo_crm_06','Camila Rocha','15900001006','Fiat Fastback Audace',1,'evaluation',daysAgo(1,14),'instagram','warm','Quer fechar se parcela ficar abaixo de R$ 2.200.'),
    base('demo_crm_07','Gustavo Ribeiro','15900001007','Honda City EX',2,'proposal',daysAgo(2,15),'web','hot','Proposta enviada com usado na troca.'),
    base('demo_crm_08','Larissa Martins','15900001008','Nissan Kicks Exclusive',3,'proposal',daysAgo(2,11),'whatsapp','hot','Aguardando retorno do banco.'),
    base('demo_crm_09','André Oliveira','15900001009','VW Nivus Highline',0,'proposal',daysAgo(3,13),'showroom','warm','Negociação em ajuste de preço.'),
    base('demo_crm_10','Juliana Freitas','15900001010','Chevrolet Onix Premier',1,'follow_up',daysAgo(4,10),'web','warm','Pediu retorno após receber proposta do concorrente.'),
    base('demo_crm_11','Felipe Moraes','15900001011','Fiat Pulse Audace',2,'follow_up',daysAgo(5,9),'whatsapp','warm','Está vendendo o carro particular antes de fechar.'),
    base('demo_crm_12','Renata Pires','15900001012','VW Polo Highline',3,'follow_up',daysAgo(6,15),'instagram','cold','Retomar no fim da semana.'),
    base('demo_crm_13','Thiago Castro','15900001013','Chevrolet Tracker LT',0,'follow_up',daysAgo(7,11),'showroom','warm','Gostou do carro, aguardando entrada.'),
    base('demo_crm_14','Sabrina Lopes','15900001014','Hyundai HB20 Platinum',1,'follow_up',daysAgo(3,16),'web','hot','Cliente pediu simulação em 36x e 48x.'),
    base('demo_crm_15','Paulo Henrique','15900001015','VW Virtus Highline',2,'follow_up',daysAgo(8,10),'whatsapp','warm','Aguardando vender motocicleta para compor entrada.'),
    base('demo_crm_16','Daniela Reis','15900001016','Toyota Yaris XLS',3,'follow_up',daysAgo(9,9),'showroom','warm','Retorno agendado para hoje à tarde.'),
  ];
  rows[4].tradeInPlate='DEF4G56';
  rows[6].crmProposals=[proposal('prop_demo_1','Honda City EX','DMT0K10',103900,'carla.mendes@demo.motyq','Carla Mendes')];
  rows[7].crmProposals=[proposal('prop_demo_2','Nissan Kicks Exclusive','DMT4P14',106900,'diego.rocha@demo.motyq','Diego Rocha')];
  rows[8].crmProposals=[proposal('prop_demo_3','VW Nivus Highline','DMT1A01',109900,'ana.costa@demo.motyq','Ana Costa')];
  rows[9].nextFollowUpAt=daysAhead(0,14);
  rows[10].nextFollowUpAt=daysAhead(1,9);
  rows[11].nextFollowUpAt=daysAhead(2,10);
  rows[12].nextFollowUpAt=daysAhead(0,16);
  rows[13].nextFollowUpAt=daysAhead(0,13);
  rows[14].nextFollowUpAt=daysAhead(3,11);
  rows[15].nextFollowUpAt=daysAhead(0,15);

  const sold=base('demo_crm_17','Márcia Cardoso','15900001017','VW T-Cross Comfortline',0,'sale',daysAgo(12,10),'showroom','hot','Venda concluída com troca.');
  sold.closedAt=daysAgo(10,17);sold.archivedAt=sold.closedAt;sold.archiveReason='Venda concluída';sold.lastContactOutcome='sale';
  const lost=base('demo_crm_18','Vinícius Ramos','15900001018','Jeep Renegade Longitude',1,'no_deal',daysAgo(14,11),'web','warm','Cliente comprou em outra loja.');
  lost.closedAt=daysAgo(11,16);lost.lostReason='Comprou em outro lugar';lost.futureContactAt=daysAhead(365,10);lost.futureContactReason='Próxima troca';lost.futureContactNote='Comprou SUV em 2026. Retomar em 12 meses.';lost.futureContactStatus='scheduled';lost.hibernatedAt=lost.closedAt;
  const future=base('demo_crm_19','Aline Batista','15900001019','Hyundai Creta Limited',2,'sale',daysAgo(30,12),'showroom','hot','Cliente comprou conosco.');
  future.closedAt=daysAgo(28,17);future.archivedAt=future.closedAt;future.archiveReason='Venda concluída';future.futureContactAt=daysAhead(540,10);future.futureContactReason='Troca programada';future.futureContactNote='Retomar para próxima troca em aproximadamente 18 meses.';future.futureContactStatus='scheduled';future.hibernatedAt=future.closedAt;
  return[...rows,sold,lost,future];
};

const seedQueueAndCrm=async()=>{
  const queue:ShowroomQueueState={
    id:`${DEMO_COMPANY_ID}_${DEMO_STORE_ID}`,companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,
    sellers:demoUsers.filter(user=>user.role==='seller').map(user=>({id:user.id,email:user.email,name:user.name,available:true})),
    nextIndex:0,
    turnOrder:['bruno.lima@demo.motyq','carla.mendes@demo.motyq','ana.costa@demo.motyq','diego.rocha@demo.motyq'],
    pausedSellers:[{email:'diego.rocha@demo.motyq',name:'Diego Rocha',reason:'lunch',pausedAt:daysAgo(0,12,5),pausedBy:'mariana.lopes@demo.motyq',pausedByName:'Mariana Lopes'}],
    excludedSellerEmails:[],
    auditLog:[{id:'demo_queue_audit_1',action:'pause',sellerEmail:'diego.rocha@demo.motyq',sellerName:'Diego Rocha',reason:'lunch',at:daysAgo(0,12,5),byEmail:'mariana.lopes@demo.motyq',byName:'Mariana Lopes'}],
    updatedAt:new Date().toISOString(),
  };
  await setDoc(doc(db,'showroom_queue',queue.id),queue,{merge:false});
  await Promise.all(crmRows().map(item=>setDoc(doc(db,'showroom_passages',item.id),item,{merge:false})));
};

const seedMarketPresence=async()=>{
  const stock=demoStockRows();
  const batchId=`demo-stock-${localDate()}`;
  const rows:MarketPresenceItem[]=stock.slice(0,-1).map((item,index)=>{
    const missing=[0,4].includes(index);
    const insufficient=[1,6].includes(index);
    const priceMismatch=[2,5,9].includes(index);
    return{
      id:safeId(`${DEMO_COMPANY_ID}_${DEMO_STORE_ID}_${localDate()}_${item.plate}`),
      referenceDate:localDate(),plate:item.plate,vehicle:item.vehicle,
      adStatus:missing?'missing':'active',
      photoStatus:missing?'missing':insufficient?'insufficient':'ok',
      photoCount:missing?0:insufficient?5:18+(index%6),
      ...(!missing?{sitePrice:item.askingPrice+(priceMismatch?2000:0),siteKm:15000+index*3200}:{}),
      alert:missing?'Sem anúncio ativo':insufficient?'Poucas fotos':priceMismatch?'Preço do site divergente':'',
      url:missing?'':`https://demo.motyq.com.br/veiculo/${item.plate.toLowerCase()}`,
      auditedAt:new Date().toISOString(),companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,
      ...({stockBatchId:batchId} as any),
    };
  });
  await Promise.all(rows.map(item=>setDoc(doc(db,'market_presence',item.id),item,{merge:true})));
  await setDoc(doc(db,'operational_meta',`market_presence_current_${safeId(DEMO_STORE_ID)}`),{
    companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,latestMarketPresenceDate:localDate(),stockBatchId:batchId,rows:rows.length,updatedAt:new Date().toISOString(),
  },{merge:true});
};

const seedPrepTrack=async()=>{
  const orders:PrepOrder[]=[
    {id:'demo_prep_1',plate:'DMT6R16',vehicle:'BYD Dolphin GS 2024',openedAt:daysAgo(2),updatedAt:daysAgo(0,9),status:'preparing',sold:false,destination:'showroom',services:[{id:'srv_1',type:'Higienização',provider:'CleanCar Demo',status:'in_service',estimatedCost:420,finalCost:0,sentAt:daysAgo(1),dueAt:daysAhead(0,17),notes:'Finalizar antes das 17h.'}],notes:'Entrada recente, priorizar fotos após higienização.',createdBy:'mariana.lopes@demo.motyq',storeId:DEMO_STORE_ID,companyId:DEMO_COMPANY_ID},
    {id:'demo_prep_2',plate:'DMT3N13',vehicle:'Fiat Fastback Audace 2024',openedAt:daysAgo(4),updatedAt:daysAgo(0,8),status:'waiting_part',sold:false,destination:'showroom',services:[{id:'srv_2',type:'Lanterna traseira',provider:'AutoPeças Demo',status:'waiting_part',estimatedCost:780,finalCost:0,sentAt:daysAgo(3),dueAt:daysAhead(2),notes:'Peça encomendada.'}],notes:'Aguardando peça.',createdBy:'mariana.lopes@demo.motyq',storeId:DEMO_STORE_ID,companyId:DEMO_COMPANY_ID},
    {id:'demo_prep_3',plate:'DMT8T18',vehicle:'VW Virtus Highline 2024',openedAt:daysAgo(1),updatedAt:daysAgo(0,10),status:'ready',sold:false,destination:'showroom',services:[{id:'srv_3',type:'Polimento técnico',provider:'Estética Prime Demo',status:'done',estimatedCost:650,finalCost:620,sentAt:daysAgo(1),returnedAt:daysAgo(0,10),notes:'Concluído.'}],notes:'Pronto para showroom e fotos.',createdBy:'mariana.lopes@demo.motyq',storeId:DEMO_STORE_ID,companyId:DEMO_COMPANY_ID},
    {id:'demo_prep_4',plate:'VDM0007',vehicle:'Hyundai Creta 2023',openedAt:daysAgo(3),updatedAt:daysAgo(0,11),status:'delivery',sold:true,destination:'delivery',services:[{id:'srv_4',type:'Revisão entrega',provider:'Oficina Demo',status:'done',estimatedCost:350,finalCost:340,sentAt:daysAgo(2),returnedAt:daysAgo(1),notes:'Checklist concluído.'}],notes:'Venda faturada. Agendada entrega amanhã.',createdBy:'mariana.lopes@demo.motyq',storeId:DEMO_STORE_ID,companyId:DEMO_COMPANY_ID},
  ];
  await Promise.all(orders.map(order=>setDoc(doc(db,'prep_orders',order.id),order,{merge:false})));
};

const seedDeals=async()=>{
  const rows=[
    ['demo_deal_1','Ana Costa','ana.costa@demo.motyq','DMT1A01','open',109900,101500,6900,6.3],
    ['demo_deal_2','Bruno Lima','bruno.lima@demo.motyq','DMT5E05','open',82900,78500,5200,6.3],
    ['demo_deal_3','Carla Mendes','carla.mendes@demo.motyq','DMT0K10','open',103900,96800,7900,7.6],
    ['demo_deal_4','Diego Rocha','diego.rocha@demo.motyq','DMT4P14','open',106900,99900,4900,4.6],
    ['demo_deal_5','Ana Costa','ana.costa@demo.motyq','VDM0003','closed',118900,106000,11200,9.4],
    ['demo_deal_6','Carla Mendes','carla.mendes@demo.motyq','VDM0011','closed',99900,89000,8800,8.8],
    ['demo_deal_7','Bruno Lima','bruno.lima@demo.motyq','VDM0018','closed',89900,82000,7100,7.9],
    ['demo_deal_8','Diego Rocha','diego.rocha@demo.motyq','VDM0024','closed',82900,77500,5700,6.9],
  ] as const;
  await Promise.all(rows.map(([id,userName,userId,plate,status,invoiceValue,vehicleCost,profit,marginPercent],index)=>{
    const data={licensePlate:plate,fipeValue:invoiceValue+6000,stockDays:index<4?demoStockRows().find(item=>item.plate===plate)?.stockDays||30:22,
      invoiceValue,vehicleCost,bankReturn:index%2?1800:0,payments:{entry:invoiceValue*.25,financing:invoiceValue*.55,tradeIn:invoiceValue*.20},
      costs:{documentation:850,accessories:index%3?0:1200,payoff:0,debts:0,others:Math.max(invoiceValue-vehicleCost-profit-850-(index%3?0:1200),0)},
      dealStatus:status,closingType:index%2?'banking' as const:'standard' as const};
    return setDoc(doc(db,'deals',id),{id,timestamp:daysAgo(index+1,16),data,bankType:'volks',summary:{profit,marginPercent},userId,userName,companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,createdAt:daysAgo(index+1),updatedAt:daysAgo(index)}, {merge:true});
  }));
};

const seedTasks=async(currentUser:User)=>{
  const today=localDate();
  const tasks=[
    {id:'demo_action_goal',assignedToEmail:'bruno.lima@demo.motyq',assignedToName:'Bruno Lima',status:'in_progress',title:'Fechar 2 vendas para bater a meta',evidence:'Bruno está em 13/15 vendas e possui 5 negócios ativos.',recommendedAction:'Priorizar propostas quentes e clientes com veículo já avaliado.',result:'2 propostas priorizadas.',metricKey:'projection',baselineValue:13,targetValue:15,dueDate:today,tone:'warning'},
    {id:'demo_action_capture',assignedToEmail:'ana.costa@demo.motyq',assignedToName:'Ana Costa',status:'done',title:'Sustentar captura acima de 60%',evidence:'Ana atingiu 68,8% de captura no mês.',recommendedAction:'Manter avaliação de troca em todos os clientes elegíveis.',result:'Meta superada e rotina mantida.',metricKey:'capture',baselineValue:55,targetValue:60,dueDate:monthDate(Math.max(1,new Date().getDate()-1)),tone:'info'},
    {id:'demo_action_margin',assignedToEmail:'diego.rocha@demo.motyq',assignedToName:'Diego Rocha',status:'open',title:'Recuperar margem das próximas propostas',evidence:'Margem média de Diego está em 6,9%, abaixo da meta de 8%.',recommendedAction:'Revisar descontos, preparação e retorno bancário antes de nova proposta.',result:'',metricKey:'margin',baselineValue:6.9,targetValue:8,dueDate:daysAhead(1).slice(0,10),tone:'critical'},
    {id:'demo_action_stock',assignedToEmail:'carla.mendes@demo.motyq',assignedToName:'Carla Mendes',status:'open',title:'Atacar Nivus com 178 dias',evidence:'DMT1A01 é o veículo mais velho do estoque e concentra alto custo de capital.',recommendedAction:'Reativar leads de Nivus/T-Cross e montar oferta de giro hoje.',result:'',metricKey:'criticalStock',baselineValue:178,targetValue:150,dueDate:today,tone:'critical'},
    {id:'demo_action_site',assignedToEmail:'mariana.lopes@demo.motyq',assignedToName:'Mariana Lopes',status:'in_progress',title:'Corrigir presença digital crítica',evidence:'Dois veículos estão sem anúncio e outros possuem fotos insuficientes.',recommendedAction:'Publicar anúncios faltantes e completar fotos antes do fim do dia.',result:'Equipe de mídia acionada.',metricKey:'sellerFocus',baselineValue:4,targetValue:0,dueDate:today,tone:'warning'},
  ];
  await Promise.all(tasks.map(task=>setDoc(doc(db,'operational_meta',task.id),{
    ...task,kind:'action_task',companyId:DEMO_COMPANY_ID,storeId:DEMO_STORE_ID,storeName:DEMO_STORE.name,
    sourceActionId:task.id,sourceDate:today,scope:'Motyq Demo Motors · Matriz',metric:task.metricKey,
    createdByEmail:currentUser.email,createdByName:currentUser.name,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
    ...(task.status==='done'?{completedAt:serverTimestamp()}:{}),
  },{merge:true})));
};

const scopedCollections=[
  'operational_stock','operational_sales','market_presence','prep_orders','showroom_passages',
  'showroom_queue','evaluation_requests','deals','operational_imports','operational_meta',
] as const;

const clearDemoData=async()=>{
  for(const collectionName of scopedCollections){
    let snap;
    try{
      snap=await getDocs(query(collection(db,collectionName),where('companyId','==',DEMO_COMPANY_ID)));
    }catch{continue;}
    const docs=snap.docs.filter(item=>{
      const data=item.data() as any;
      return !data.storeId||data.storeId===DEMO_STORE_ID;
    });
    for(let start=0;start<docs.length;start+=400){
      const batch=writeBatch(db);
      docs.slice(start,start+400).forEach(item=>batch.delete(item.ref));
      await batch.commit();
    }
  }
  try{
    const users=await getDocs(query(collection(db,'users'),where('companyId','==',DEMO_COMPANY_ID)));
    for(let start=0;start<users.docs.length;start+=400){
      const batch=writeBatch(db);
      users.docs.slice(start,start+400).forEach(item=>batch.delete(item.ref));
      await batch.commit();
    }
  }catch{}
  await deleteDoc(doc(db,'config',`group_stock_${safeId(DEMO_COMPANY_ID)}`)).catch(()=>undefined);
};

export const demoSeedService={
  resetAndSeed:async(currentUser:User)=>{
    if(currentUser.role!=='admin')throw new Error('Somente o administrador pode reiniciar o ambiente demo.');
    await clearDemoData();
    await demoSeedService.seed(currentUser);
  },

  seed:async(currentUser:User)=>{
    if(currentUser.role!=='admin')throw new Error('Somente o administrador pode preparar o ambiente demo.');
    await seedCompaniesStoresUsers();
    await Promise.all([seedStock(),seedPerformance(),seedSales()]);
    await Promise.all([seedQueueAndCrm(),seedDeals(),seedPrepTrack()]);
    await Promise.all([seedMarketPresence(),seedTasks(currentUser)]);

    companyScopeService.set(DEMO_COMPANY_ID);
    storeScopeService.set(DEMO_STORE_ID);
    window.dispatchEvent(new Event('dealmaster:company-entitlements-updated'));
    window.dispatchEvent(new Event('dealmaster:operational-data-updated'));
    window.dispatchEvent(new Event('motyq:operational-data-updated'));
    window.dispatchEvent(new Event('motyq:group-stock-updated'));
  },

  isDemoCompany:(companyId?:string)=>companyId===DEMO_COMPANY_ID,
};
