import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { currentStockService } from './currentStockService';
import { dmsVehicleService } from './dmsVehicleService';
import { vehiclePurchaseService } from './vehiclePurchaseService';
import { prepTrackService } from './prepTrackService';
import { financeService } from './financeService';
import { salesOrderService } from './salesOrderService';
import { stockMovementService } from './stockMovementService';
import { dmsAuditService } from './dmsAuditService';

const clean=(v:unknown)=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);

export const vehicleDossierService={
  listVehicles:(companyId:string,storeId:string)=>dmsVehicleService.list(companyId,storeId),
  get:async(companyId:string,storeId:string,key:string)=>{
    const masters=await dmsVehicleService.list(companyId,storeId);
    const plate=clean(key);
    const master=masters.find(item=>item.vehicleId===key||clean(item.plate)===plate);
    if(!master)throw new Error('Veículo não encontrado no cadastro mestre.');
    const [stock,purchases,prepOrders,finance,sales,movements,audit,ledger]=await Promise.all([
      currentStockService.getCurrent(companyId,storeId),
      vehiclePurchaseService.list(companyId,storeId),
      prepTrackService.getOrders(companyId,storeId),
      financeService.getAll(companyId,storeId),
      salesOrderService.list(companyId,storeId),
      stockMovementService.listForVehicle(companyId,storeId,master.vehicleId),
      dmsAuditService.listForEntity(companyId,storeId,'vehicle',master.vehicleId),
      getDocs(query(collection(db,'operational_meta'),where('companyId','==',companyId),where('storeId','==',storeId))),
    ]);
    const same=(item:any)=>item.vehicleId===master.vehicleId||clean(item.plate)===clean(master.plate);
    const history=ledger.docs.map(item=>item.data() as any).filter(item=>item.kind==='vehicle_history'&&same(item)).sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
    return{
      master,
      stock:stock.find(same)||null,
      purchases:purchases.filter(same),
      prepOrders:prepOrders.filter(same),
      finance:finance.filter(same),
      sales:sales.filter(same),
      movements,audit,history,
    };
  },
};