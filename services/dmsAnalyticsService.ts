import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { FinanceEntry, SalesOrder, ShowroomPassage } from '../types';
import { currentStockService } from './currentStockService';
import { dmsVehicleService } from './dmsVehicleService';
import { vehiclePurchaseService } from './vehiclePurchaseService';
import { salesOrderService } from './salesOrderService';
import { financeService } from './financeService';
import { prepTrackService } from './prepTrackService';
import { afterSalesService } from './afterSalesService';
import { dmsIntegrityService } from './dmsIntegrityService';

const monthKey=(value?:string)=>String(value||'').slice(0,7);
const nowMonth=()=>new Date().toISOString().slice(0,7);
const settled=(entry:FinanceEntry)=>entry.status==='paid'||entry.status==='received';

export interface DmsAnalyticsVehicleRow {
  salesOrderId:string;plate:string;vehicle:string;seller:string;
  saleValue:number;vehicleCost:number;financingReturn:number;afterSalesCost:number;profit:number;marginPercent:number;
}
export interface DmsAnalyticsSellerRow {
  seller:string;sales:number;revenue:number;profit:number;marginPercent:number;
}
export interface DmsAnalyticsSupplierRow {supplier:string;services:number;amount:number;}
export interface DmsAnalyticsUnitRow {
  storeId:string;storeName:string;stockCount:number;stockValue:number;sales:number;revenue:number;profit:number;marginPercent:number;
  realizedResult:number;payableOpen:number;receivableOpen:number;integrityCritical:number;
}
export interface DmsAnalyticsReport {
  generatedAt:string;
  stock:{count:number;value:number;aged90:number;aged90Value:number};
  purchases:{enteredMonth:number;valueMonth:number;open:number};
  sales:{month:number;revenue:number;profit:number;marginPercent:number;delivered:number;invoiced:number};
  finance:{payableOpen:number;receivableOpen:number;realizedIn:number;realizedOut:number;realizedResult:number};
  prep:{activeOrders:number;approvedCost:number;pendingApproval:number};
  funnel:{leads:number;proposals:number;accepted:number;salesOrders:number;delivered:number};
  afterSales:{open:number;cost:number};
  integrity:{critical:number;warning:number;info:number};
  vehicles:DmsAnalyticsVehicleRow[];
  sellers:DmsAnalyticsSellerRow[];
  suppliers:DmsAnalyticsSupplierRow[];
}

export const dmsAnalyticsService={
  run:async(companyId:string,storeId:string):Promise<DmsAnalyticsReport>=>{
    const passageSnapPromise=getDocs(query(
      collection(db,'showroom_passages'),
      where('companyId','==',companyId),
      where('storeId','==',storeId),
    )).catch(()=>null);

    const [stock,masters,purchases,sales,finance,prep,afterSales,passageSnap,integrity]=await Promise.all([
      currentStockService.getCurrent(companyId,storeId),
      dmsVehicleService.list(companyId,storeId),
      vehiclePurchaseService.list(companyId,storeId),
      salesOrderService.list(companyId,storeId),
      financeService.getAll(companyId,storeId),
      prepTrackService.getOrders(companyId,storeId),
      afterSalesService.list(companyId,storeId),
      passageSnapPromise,
      dmsIntegrityService.run(companyId,storeId,null).catch(()=>null),
    ]);

    const month=nowMonth();
    const masterById=new Map(masters.map(item=>[item.vehicleId,item]));
    const afterSalesByVehicle=new Map<string,number>();
    afterSales.forEach(item=>{
      if(!item.vehicleId)return;
      afterSalesByVehicle.set(item.vehicleId,(afterSalesByVehicle.get(item.vehicleId)||0)+(Number(item.cost)||0));
    });

    const salesMonth=sales.filter(item=>monthKey(item.invoicedAt||item.deliveredAt||item.updatedAt)===month&&item.status!=='cancelled');
    const vehicleRows:DmsAnalyticsVehicleRow[]=salesMonth.map(order=>{
      const master=order.vehicleId?masterById.get(order.vehicleId):undefined;
      const vehicleCost=Number(master?.currentCost)||Number(master?.purchaseCost)||0;
      const saleValue=Number(order.netSalePrice)||0;
      const financingReturn=Number(order.financingReturn)||0;
      const afterSalesCost=order.vehicleId?(afterSalesByVehicle.get(order.vehicleId)||0):0;
      const profit=saleValue+financingReturn-vehicleCost-afterSalesCost;
      return{
        salesOrderId:order.salesOrderId,plate:order.plate,vehicle:order.vehicle,seller:order.sellerName||order.createdByName||'Não informado',
        saleValue,vehicleCost,financingReturn,afterSalesCost,profit,
        marginPercent:saleValue>0?profit/saleValue*100:0,
      };
    }).sort((a,b)=>b.profit-a.profit);

    const sellersMap=new Map<string,DmsAnalyticsSellerRow>();
    vehicleRows.forEach(row=>{
      const key=row.seller||'Não informado';
      const current=sellersMap.get(key)||{seller:key,sales:0,revenue:0,profit:0,marginPercent:0};
      current.sales+=1;current.revenue+=row.saleValue;current.profit+=row.profit;
      current.marginPercent=current.revenue>0?current.profit/current.revenue*100:0;
      sellersMap.set(key,current);
    });

    const supplierMap=new Map<string,DmsAnalyticsSupplierRow>();
    finance.filter(item=>item.origin==='prep'&&item.status!=='cancelled').forEach(item=>{
      const supplier=item.party||'Sem fornecedor';
      const current=supplierMap.get(supplier)||{supplier,services:0,amount:0};
      current.services+=1;current.amount+=Number(item.amount)||0;supplierMap.set(supplier,current);
    });

    const passages=(passageSnap?.docs||[]).map(item=>item.data() as ShowroomPassage).filter(item=>monthKey(item.createdAt)===month);
    let proposals=0,accepted=0;
    passages.forEach(lead=>{
      const all=Array.isArray(lead.crmProposals)?lead.crmProposals:[];
      const latest=new Map<string,any>();
      all.forEach(row=>{const prior=latest.get(row.id);if(!prior||Number(prior.version)<Number(row.version))latest.set(row.id,row);});
      proposals+=latest.size;
      accepted+=[...latest.values()].filter(row=>row.status==='accepted').length;
    });

    const financeMonth=finance.filter(item=>settled(item)&&monthKey(item.settledAt)===month);
    const realizedIn=financeMonth.filter(item=>item.entryType==='receivable'&&item.status==='received').reduce((sum,item)=>sum+(Number(item.amount)||0),0);
    const realizedOut=financeMonth.filter(item=>item.entryType==='payable'&&item.status==='paid').reduce((sum,item)=>sum+(Number(item.amount)||0),0);
    const stockValue=stock.reduce((sum,item)=>sum+(Number(item.cost)||0),0);
    const aged90=stock.filter(item=>Number(item.stockDays)>90);
    const saleRevenue=vehicleRows.reduce((sum,item)=>sum+item.saleValue,0);
    const saleProfit=vehicleRows.reduce((sum,item)=>sum+item.profit,0);
    const trackedPrep=prep.filter(order=>!(!(order.services||[]).length&&!order.sold&&order.status==='triage'&&order.destination==='showroom'&&!order.vehicleId&&!String(order.createdBy||'').trim()));
    const activePrep=trackedPrep.filter(order=>!['showroom','delivery','delivered'].includes(order.status));
    const prepApproved=activePrep.flatMap(order=>order.services||[]).filter(service=>['approved','in_service','waiting_part','done'].includes(service.status));
    const pendingApproval=trackedPrep.flatMap(order=>order.services||[]).filter(service=>service.status==='pending').length;

    return{
      generatedAt:new Date().toISOString(),
      stock:{count:stock.length,value:stockValue,aged90:aged90.length,aged90Value:aged90.reduce((sum,item)=>sum+(Number(item.cost)||0),0)},
      purchases:{
        enteredMonth:purchases.filter(item=>item.status==='entered'&&monthKey(item.enteredAt||item.updatedAt)===month).length,
        valueMonth:purchases.filter(item=>item.status==='entered'&&monthKey(item.enteredAt||item.updatedAt)===month).reduce((sum,item)=>sum+(Number(item.totalAcquisitionCost)||0),0),
        open:purchases.filter(item=>!['entered','cancelled'].includes(item.status)).length,
      },
      sales:{
        month:vehicleRows.length,revenue:saleRevenue,profit:saleProfit,marginPercent:saleRevenue>0?saleProfit/saleRevenue*100:0,
        delivered:salesMonth.filter(item=>item.status==='delivered').length,
        invoiced:salesMonth.filter(item=>item.status==='invoiced').length,
      },
      finance:{
        payableOpen:finance.filter(item=>item.entryType==='payable'&&item.status==='pending').reduce((sum,item)=>sum+(Number(item.amount)||0),0),
        receivableOpen:finance.filter(item=>item.entryType==='receivable'&&item.status==='pending').reduce((sum,item)=>sum+(Number(item.amount)||0),0),
        realizedIn,realizedOut,realizedResult:realizedIn-realizedOut,
      },
      prep:{
        activeOrders:activePrep.length,
        approvedCost:prepApproved.reduce((sum,item)=>sum+(Number(item.finalCost)||Number(item.estimatedCost)||0),0),
        pendingApproval,
      },
      funnel:{leads:passages.length,proposals,accepted,salesOrders:salesMonth.length,delivered:salesMonth.filter(item=>item.status==='delivered').length},
      afterSales:{open:afterSales.filter(item=>!['resolved','closed'].includes(item.status)).length,cost:afterSales.reduce((sum,item)=>sum+(Number(item.cost)||0),0)},
      integrity:{critical:integrity?.criticalCount||0,warning:integrity?.warningCount||0,info:integrity?.infoCount||0},
      vehicles:vehicleRows,
      sellers:[...sellersMap.values()].sort((a,b)=>b.profit-a.profit),
      suppliers:[...supplierMap.values()].sort((a,b)=>b.amount-a.amount),
    };
  },
  runUnits:async(companyId:string,stores:Array<{id:string;name:string}>):Promise<DmsAnalyticsUnitRow[]>=>{
    const reports=await Promise.all(stores.map(async store=>{
      const report=await dmsAnalyticsService.run(companyId,store.id);
      return{
        storeId:store.id,storeName:store.name,
        stockCount:report.stock.count,stockValue:report.stock.value,
        sales:report.sales.month,revenue:report.sales.revenue,profit:report.sales.profit,marginPercent:report.sales.marginPercent,
        realizedResult:report.finance.realizedResult,payableOpen:report.finance.payableOpen,receivableOpen:report.finance.receivableOpen,
        integrityCritical:report.integrity.critical,
      } satisfies DmsAnalyticsUnitRow;
    }));
    return reports.sort((a,b)=>b.profit-a.profit);
  },
};
