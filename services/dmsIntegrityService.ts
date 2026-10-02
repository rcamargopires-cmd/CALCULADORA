import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { DmsDiagnosticIssue, DmsDiagnosticReport, FinanceEntry, PrepOrder, User } from '../types';
import { currentStockService } from './currentStockService';
import { dmsVehicleService } from './dmsVehicleService';
import { prepTrackService } from './prepTrackService';
import { financeService } from './financeService';
import { dmsSupplierService } from './dmsSupplierService';
import { dmsCustomerService } from './dmsCustomerService';
import { userService } from './userService';
import { vehiclePurchaseService } from './vehiclePurchaseService';
import { salesOrderService } from './salesOrderService';

const cleanPlate=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const norm=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const moneyForIssue=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);

const issue=(
  severity:DmsDiagnosticIssue['severity'],
  domain:DmsDiagnosticIssue['domain'],
  id:string,
  title:string,
  detail:string,
  extra:Partial<DmsDiagnosticIssue>={},
):DmsDiagnosticIssue=>({id,severity,domain,title,detail,...extra});

export const dmsIntegrityService={
  run:async(companyId:string,storeId:string,currentUser?:User|null):Promise<DmsDiagnosticReport>=>{
    const [stock,masters,orders,purchases,sales,finance,suppliers,customers,users]=await Promise.all([
      currentStockService.getCurrent(companyId,storeId),
      dmsVehicleService.list(companyId,storeId),
      prepTrackService.getOrders(companyId,storeId),
      vehiclePurchaseService.list(companyId,storeId),
      salesOrderService.list(companyId,storeId),
      financeService.getAll(companyId,storeId),
      dmsSupplierService.list(companyId,storeId),
      dmsCustomerService.list(companyId,storeId),
      currentUser?userService.getAll(companyId,storeId).catch(()=>[]):Promise.resolve([]),
    ]);

    const issues:DmsDiagnosticIssue[]=[];
    const mastersById=new Map(masters.map(item=>[item.vehicleId,item]));
    const stockByPlate=new Map(stock.map(item=>[cleanPlate(item.plate),item]));
    const ordersByVehicle=new Map<string,PrepOrder>();
    orders.forEach(order=>{
      if(order.vehicleId)ordersByVehicle.set(order.vehicleId,order);
    });

    for(const item of stock){
      const plate=cleanPlate(item.plate);
      if(!item.vehicleId){
        issues.push(issue('critical','stock',`stock-no-vehicle-${plate}`,'Veículo em estoque sem identidade DMS',`${plate} · ${item.vehicle} não possui vehicleId.`,{plate,entityId:item.id}));
        continue;
      }
      const master=mastersById.get(item.vehicleId);
      if(!master){
        issues.push(issue('critical','vehicle',`stock-master-missing-${item.vehicleId}`,'Cadastro mestre do veículo não encontrado',`${plate} aponta para ${item.vehicleId}, mas o mestre não existe.`,{plate,vehicleId:item.vehicleId,entityId:item.id}));
        continue;
      }
      if(cleanPlate(master.plate)!==plate){
        issues.push(issue('warning','vehicle',`plate-mismatch-${item.vehicleId}`,'Placa divergente entre estoque e veículo mestre',`Estoque: ${plate}. Mestre: ${cleanPlate(master.plate)}.`,{plate,vehicleId:item.vehicleId}));
      }
    }

    const activeMasters=masters.filter(item=>item.stage!=='exited');
    const plateGroups=new Map<string,typeof activeMasters>();
    activeMasters.forEach(item=>{
      const plate=cleanPlate(item.plate);
      if(!plate)return;
      const group=plateGroups.get(plate)||[];
      group.push(item);
      plateGroups.set(plate,group);
    });
    plateGroups.forEach((group,plate)=>{
      if(group.length>1){
        issues.push(issue('critical','vehicle',`duplicate-master-${plate}`,'Placa duplicada no cadastro mestre',`${plate} possui ${group.length} cadastros mestres ativos.`,{plate}));
      }
    });

    for(const order of orders){
      const plate=cleanPlate(order.plate);
      if(!order.vehicleId){
        issues.push(issue('warning','prep',`prep-no-vehicle-${order.id}`,'PrepTrack sem vínculo com veículo mestre',`${plate} · ${order.vehicle} ainda está vinculado apenas pela placa.`,{plate,entityId:order.id}));
      }else if(!mastersById.has(order.vehicleId)){
        issues.push(issue('critical','prep',`prep-master-missing-${order.id}`,'Preparação aponta para veículo inexistente',`${plate} usa vehicleId ${order.vehicleId}, mas o cadastro mestre não foi encontrado.`,{plate,vehicleId:order.vehicleId,entityId:order.id}));
      }

      const pending=(order.services||[]).filter(service=>service.status==='pending');
      if(pending.length&&order.status!=='waiting_approval'){
        issues.push(issue('warning','prep',`prep-status-${order.id}`,'Ordem com aprovação pendente fora da etapa correta',`${plate} tem ${pending.length} serviço(s) aguardando gerente, mas a ordem está em ${order.status}.`,{plate,vehicleId:order.vehicleId,entityId:order.id}));
      }

      for(const service of order.services||[]){
        if(['approved','in_service','waiting_part','done'].includes(service.status)){
          if(!service.payableId){
            issues.push(issue('warning','finance',`approved-no-payable-${order.id}-${service.id}`,'Serviço aprovado sem conta a pagar vinculada',`${plate} · ${service.type} · ${service.provider||'sem fornecedor'}.`,{plate,vehicleId:order.vehicleId,entityId:order.id}));
          }
          if(service.provider&&!service.supplierId){
            issues.push(issue('warning','supplier',`approved-no-supplier-${order.id}-${service.id}`,'Serviço aprovado sem fornecedor mestre',`${plate} · ${service.provider} ainda não possui supplierId.`,{plate,vehicleId:order.vehicleId,entityId:order.id}));
          }
        }
      }

      const stockItem=order.vehicleId
        ? stock.find(item=>item.vehicleId===order.vehicleId)
        : stockByPlate.get(plate);
      const approvedServices=(order.services||[]).filter(service=>['approved','in_service','waiting_part','done'].includes(service.status));
      if(stockItem&&approvedServices.length){
        const expected=approvedServices.reduce((sum,service)=>sum+(Number(service.finalCost)||Number(service.estimatedCost)||0),0);
        const actual=Number(stockItem.prepCost)||0;
        if(Math.abs(expected-actual)>1){
          issues.push(issue('warning','stock',`prep-cost-mismatch-${order.id}`,'Custo de preparação divergente no estoque',`${plate}: PrepTrack soma R$ ${expected.toFixed(2)}, estoque registra R$ ${actual.toFixed(2)}.`,{plate,vehicleId:stockItem.vehicleId,entityId:order.id}));
        }
      }
    }

    for(const purchase of purchases){
      const plate=cleanPlate(purchase.plate);
      const stockItem=stock.find(item=>(purchase.vehicleId&&item.vehicleId===purchase.vehicleId)||cleanPlate(item.plate)===plate);
      if(purchase.status!=='cancelled'&&!purchase.vehicleId){
        issues.push(issue('warning','vehicle',`purchase-no-vehicle-${purchase.id}`,'Compra sem vínculo com veículo mestre',`${plate} · ${purchase.vehicle}.`,{plate,entityId:purchase.id}));
      }
      if(purchase.status==='entered'&&!stockItem){
        issues.push(issue('critical','stock',`purchase-entered-no-stock-${purchase.id}`,'Compra marcada como entrada, mas veículo não está no estoque atual',`${plate} · ${purchase.vehicle}.`,{plate,vehicleId:purchase.vehicleId,entityId:purchase.id}));
      }
      if(['approved','payment_pending','documents','entered'].includes(purchase.status)&&purchase.origin!=='consignment'&&!(purchase.payableIds||[]).length){
        issues.push(issue('warning','finance',`purchase-no-payables-${purchase.id}`,'Compra aprovada sem obrigações financeiras',`${plate} · ${purchase.ownerName||'proprietário não informado'}.`,{plate,vehicleId:purchase.vehicleId,entityId:purchase.id}));
      }
    }

    for(const sale of sales){
      const plate=cleanPlate(sale.plate);
      const stockItem=stock.find(item=>(sale.vehicleId&&item.vehicleId===sale.vehicleId)||cleanPlate(item.plate)===plate);
      if(sale.status!=='cancelled'&&!sale.vehicleId){
        issues.push(issue('critical','vehicle',`sale-no-vehicle-${sale.id}`,'Pedido de Venda sem veículo mestre',`${plate} · ${sale.customerName}.`,{plate,entityId:sale.id}));
      }
      if(['draft','approved','credit_pending','ready_to_invoice','invoiced'].includes(sale.status)&&!stockItem){
        issues.push(issue('critical','stock',`sale-no-stock-${sale.id}`,'Venda ativa sem veículo no estoque atual',`${plate} · status ${sale.status}.`,{plate,vehicleId:sale.vehicleId,entityId:sale.id}));
      }
      if(sale.status==='invoiced'&&!(sale.receivableIds||[]).length){
        issues.push(issue('critical','finance',`sale-invoiced-no-receivable-${sale.id}`,'Venda faturada sem contas a receber',`${plate} · ${sale.customerName}.`,{plate,vehicleId:sale.vehicleId,entityId:sale.id}));
      }
      if(['invoiced','delivered'].includes(sale.status)&&sale.fiscalProvider==='focus_nfe'&&sale.fiscalStatus!=='authorized'){
        issues.push(issue('critical','fiscal',`sale-fiscal-not-authorized-${sale.id}`,'Venda integrada faturada sem NF-e autorizada',`${plate} · status fiscal ${sale.fiscalStatus||'não informado'}.`,{plate,vehicleId:sale.vehicleId,entityId:sale.id}));
      }
      if(sale.fiscalStatus==='rejected'||sale.fiscalStatus==='error'){
        issues.push(issue('warning','fiscal',`sale-fiscal-error-${sale.id}`,'NF-e com rejeição/erro',`${plate} · pedido ${sale.salesOrderId} precisa de correção fiscal.`,{plate,vehicleId:sale.vehicleId,entityId:sale.id}));
      }
      if(sale.fiscalStatus==='cancelled'&&['invoiced','delivered'].includes(sale.status)){
        issues.push(issue('critical','fiscal',`sale-fiscal-cancelled-active-${sale.id}`,'Venda faturada com NF-e cancelada',`${plate} · pedido ${sale.salesOrderId} precisa de regularização.`,{plate,vehicleId:sale.vehicleId,entityId:sale.id}));
      }
      if(sale.status==='delivered'&&stockItem){
        issues.push(issue('critical','stock',`sale-delivered-in-stock-${sale.id}`,'Veículo entregue ainda aparece no estoque atual',`${plate} · ${sale.customerName}.`,{plate,vehicleId:sale.vehicleId,entityId:sale.id}));
      }
      if(sale.tradeInPlate&&sale.tradeInValue>0&&!sale.tradeInPurchaseId){
        issues.push(issue('warning','vehicle',`sale-trade-no-purchase-${sale.id}`,'Troca da venda sem processo de compra vinculado',`${sale.tradeInPlate} · ${moneyForIssue(sale.tradeInValue)}.`,{plate:sale.tradeInPlate,entityId:sale.id}));
      }
    }

    for(const entry of finance as FinanceEntry[]){
      if(entry.status==='cancelled')continue;
      if(Number(entry.amount)<=0){
        issues.push(issue('critical','finance',`finance-zero-${entry.id}`,'Lançamento financeiro sem valor válido',`${entry.description} · ${entry.party}.`,{plate:entry.plate,vehicleId:entry.vehicleId,entityId:entry.id}));
      }
      if(entry.origin==='prep'){
        if(!entry.vehicleId){
          issues.push(issue('warning','finance',`prep-finance-no-vehicle-${entry.id}`,'Conta de preparação sem vehicleId',`${entry.description} · ${entry.party} não está ligada ao veículo mestre.`,{plate:entry.plate,entityId:entry.id}));
        }
        if(entry.entryType==='payable'&&!entry.partyId){
          issues.push(issue('warning','supplier',`prep-finance-no-supplier-${entry.id}`,'Conta de preparação sem fornecedor mestre',`${entry.party} ainda está apenas como texto no financeiro.`,{plate:entry.plate,vehicleId:entry.vehicleId,entityId:entry.id}));
        }
      }
      if((entry.status==='paid'||entry.status==='received')&&!entry.settledAt){
        issues.push(issue('warning','finance',`settled-no-date-${entry.id}`,'Baixa financeira sem data de liquidação',`${entry.description} está como ${entry.status}, mas settledAt está vazio.`,{plate:entry.plate,vehicleId:entry.vehicleId,entityId:entry.id}));
      }
      if(entry.status==='pending'&&!entry.dueDate){
        issues.push(issue('info','finance',`finance-no-due-${entry.id}`,'Lançamento pendente sem vencimento',`${entry.description} · ${entry.party}.`,{plate:entry.plate,vehicleId:entry.vehicleId,entityId:entry.id}));
      }
    }

    const supplierGroups=new Map<string,typeof suppliers>();
    suppliers.filter(item=>item.active!==false).forEach(item=>{
      const key=norm(item.document)||norm(item.name);
      if(!key)return;
      const group=supplierGroups.get(key)||[];
      group.push(item);
      supplierGroups.set(key,group);
    });
    supplierGroups.forEach((group,key)=>{
      if(group.length>1)issues.push(issue('warning','supplier',`supplier-duplicate-${key}`,'Fornecedor possivelmente duplicado',group.map(item=>item.name).join(' · ')));
    });

    const customerPhoneGroups=new Map<string,typeof customers>();
    customers.forEach(item=>{
      const key=String(item.phone||'').replace(/\D/g,'');
      if(!key)return;
      const group=customerPhoneGroups.get(key)||[];
      group.push(item);
      customerPhoneGroups.set(key,group);
    });
    customerPhoneGroups.forEach((group,key)=>{
      if(group.length>1)issues.push(issue('warning','customer',`customer-duplicate-${key}`,'Cliente possivelmente duplicado pelo telefone',group.map(item=>item.name).join(' · ')));
    });

    users.filter(user=>user.status==='active'&&user.role==='manager'&&!user.dmsAccessProfile).forEach(user=>{
      issues.push(issue('info','permissions',`legacy-manager-${user.email}`,'Gestor ainda usa acesso legado completo',`${user.name} ainda não foi classificado como Gestor, Preparação ou Financeiro/Caixa.`,{entityId:user.email}));
    });

    issues.sort((a,b)=>{
      const weight={critical:0,warning:1,info:2};
      return weight[a.severity]-weight[b.severity]||a.domain.localeCompare(b.domain);
    });

    return{
      generatedAt:new Date().toISOString(),
      companyId,
      storeId,
      stockCount:stock.length,
      vehicleMasterCount:masters.length,
      prepOrderCount:orders.length,
      purchaseCount:purchases.length,
      salesOrderCount:sales.length,
      financeEntryCount:finance.length,
      supplierCount:suppliers.length,
      customerCount:customers.length,
      criticalCount:issues.filter(item=>item.severity==='critical').length,
      warningCount:issues.filter(item=>item.severity==='warning').length,
      infoCount:issues.filter(item=>item.severity==='info').length,
      issues,
    };
  },
  runAndStore:async(companyId:string,storeId:string,currentUser?:User|null):Promise<DmsDiagnosticReport>=>{
    const report=await dmsIntegrityService.run(companyId,storeId,currentUser);
    const day=report.generatedAt.slice(0,10);
    const id=`dms_integrity_report_${companyId}_${storeId}_${day}`.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,190);
    await setDoc(doc(db,'operational_meta',id),{
      id,kind:'dms_integrity_report',companyId,storeId,
      generatedAt:report.generatedAt,
      stockCount:report.stockCount,vehicleMasterCount:report.vehicleMasterCount,
      prepOrderCount:report.prepOrderCount,purchaseCount:report.purchaseCount||0,salesOrderCount:report.salesOrderCount||0,
      financeEntryCount:report.financeEntryCount,supplierCount:report.supplierCount,customerCount:report.customerCount,
      criticalCount:report.criticalCount,warningCount:report.warningCount,infoCount:report.infoCount,
      issues:report.issues.slice(0,250),
      generatedBy:currentUser?.email||'system',generatedByName:currentUser?.name||'Motyq',
      updatedAt:report.generatedAt,
    },{merge:true});
    return report;
  },

};
