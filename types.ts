export type BankType = 'volks' | 'others';
export type UserRole = 'admin' | 'manager' | 'seller' | 'user' | 'reception';
export type UserStatus = 'active' | 'inactive';
export type CompanyPlan = 'starter' | 'pro' | 'enterprise';
export type CompanyStatus = 'trial' | 'active' | 'suspended';
export type DealMasterModule =
  | 'dealGuard'
  | 'goalTrack'
  | 'myPerformance'
  | 'commandCenter'
  | 'stockIntelligence'
  | 'trends'
  | 'smartAlerts'
  | 'executiveInsights'
  | 'aiManager'
  | 'assetGuard'
  | 'multiStore'
  | 'groupOverview'
  | 'dmsConnect';

export interface Company { id:string; slug:string; name:string; plan:CompanyPlan; status:CompanyStatus; createdAt?:string; trialEndsAt?:string; moduleOverrides?:Partial<Record<DealMasterModule,boolean>>; }
export interface Store { id:string; code:string; name:string; active:boolean; companyId?:string; }
export interface SellerGoals { monthly:number; firstHalf:number; capture:number; margin:number; }
export interface User { id:string; email:string; role:UserRole; name:string; status:UserStatus; createdAt?:string; goals?:SellerGoals; storeId?:string; companyId?:string; companyPlan?:CompanyPlan; companyStatus?:CompanyStatus; companyModuleOverrides?:Partial<Record<DealMasterModule,boolean>>; }

export interface OperationalStockItem { id:string; snapshotDate:string; plate:string; vehicle:string; stockDays:number; cost:number; fipe:number; askingPrice:number; location?:string; status?:string; storeId?:string; companyId?:string; }
export interface OperationalSaleItem { id:string; saleDate:string; plate:string; vehicle:string; seller:string; invoiceValue:number; marginValue:number; marginPercent:number; hasTradeIn?:boolean; storeId?:string; companyId?:string; }
export interface MarketPresenceItem { id:string; referenceDate:string; plate:string; vehicle:string; adStatus:'active'|'missing'; photoStatus:'ok'|'insufficient'|'not_validated'|'missing'; photoCount?:number; sitePrice?:number; siteKm?:number; alert?:string; url?:string; auditedAt?:string; storeId?:string; companyId?:string; }

export type PrepServiceStatus='pending'|'approved'|'in_service'|'waiting_part'|'done'|'cancelled';
export type PrepOrderStatus='triage'|'preparing'|'waiting_approval'|'waiting_part'|'ready'|'showroom'|'delivery'|'delivered';
export type PrepDestination='showroom'|'delivery';
export interface PrepService { id:string; type:string; provider:string; status:PrepServiceStatus; estimatedCost:number; finalCost:number; sentAt?:string; dueAt?:string; returnedAt?:string; notes?:string; }
export interface PrepOrder { id:string; plate:string; vehicle:string; openedAt:string; updatedAt:string; completedAt?:string; status:PrepOrderStatus; sold:boolean; destination:PrepDestination; services:PrepService[]; notes?:string; createdBy?:string; storeId:string; companyId:string; }

export type ShowroomPassageStatus='waiting'|'in_service'|'evaluation'|'proposal'|'follow_up'|'sale'|'no_deal';
export interface ShowroomPassage {
  id:string;
  customerName:string;
  phone:string;
  interestModel:string;
  assignedSellerId:string;
  assignedSellerEmail:string;
  assignedSellerName:string;
  status:ShowroomPassageStatus;
  createdAt:string;
  updatedAt:string;
  assumedAt?:string;
  closedAt?:string;
  notes?:string;
  createdBy?:string;
  createdByName?:string;
  companyId:string;
  storeId:string;
}
export interface ShowroomQueueSeller { id:string; email:string; name:string; available:boolean; }
export type ShowroomQueueReason='busy'|'lunch'|'away'|'other';
export interface ShowroomQueuePause { email:string; name:string; reason:ShowroomQueueReason; pausedAt:string; pausedBy?:string; pausedByName?:string; }
export interface ShowroomQueueAudit { id:string; action:'skip_once'|'pause'|'resume'; sellerEmail:string; sellerName:string; reason?:ShowroomQueueReason; at:string; byEmail?:string; byName?:string; }
export interface ShowroomQueueState { id:string; companyId:string; storeId:string; sellers:ShowroomQueueSeller[]; nextIndex:number; pausedSellers:ShowroomQueuePause[]; auditLog:ShowroomQueueAudit[]; updatedAt:string; }

export interface OperationalPerformanceSeller { seller:string; sellerKey:string; passages:number; orders:number; flowTotal:number; orderPercent:number; workInPeriod:number; avgContactsPerDay:number; evaluations:number; evaluationRate:number; closing:number; syonetSales:number; closingPercent:number; marginPerCar:number; marginTotal:number; marginPercent:number; captureQty:number; capturePercent:number; pipeline:number; projection:number; additionalPurchase:number; }
export interface OperationalPerformanceSnapshot { referenceDate:string; sheetName:string; sellers:OperationalPerformanceSeller[]; total?:OperationalPerformanceSeller; storeMetrics:Record<string,number|string>; sourceFile?:string; importedBy?:string; storeId?:string; companyId?:string; }
export interface OperationalImportLog { id:string; type:'stock'|'sales'|'performance'|'market_presence'; importedAt:string; referenceDate:string; rows:number; fileName:string; importedBy?:string; storeId?:string; companyId?:string; }

export interface FieldVisibility { licensePlate:boolean; stockDays:boolean; invoiceValue:boolean; vehicleCost:boolean; entry:boolean; financing:boolean; tradeIn:boolean; documentation:boolean; accessories:boolean; payoff:boolean; debts:boolean; others:boolean; }
export type CommissionType='fixed'|'percent'|'mixed';
export interface CommissionConfig { enabled:boolean; type:CommissionType; fixedValue:number; percentage:number; minProfitThreshold:number; invoicePercentage:number; financingPercentage:number; stockPrizeConfig:{enabled:boolean;thresholds:{days:number;value:number;valueWithTradeIn?:number;}[]}; docPrizeConfig:{enabled:boolean;thresholds:{min:number;max?:number;value:number;}[]}; }
export interface BankRates { volks:number; others:number; }
export interface PaymentMethods { entry:number; financing:number; tradeIn:number; }
export interface AdditionalCosts { documentation:number; accessories:number; payoff:number; debts:number; others:number; }
export interface DealData { licensePlate:string; fipeValue:number; stockDays:number; invoiceValue:number; vehicleCost:number; bankReturn:number; payments:PaymentMethods; costs:AdditionalCosts; dealStatus?:'open'|'closed'; closingType:'standard'|'banking'; isWebLead?:boolean; splitWithUserId?:string; splitWithUserName?:string; }
export interface CalculationResult { totalPayment:number; totalCosts:number; netRevenue:number; profit:number; marginPercent:number; profitWithBank:number; marginPercentWithBank:number; }
export interface SavedCalculation { id:string; timestamp:string; data:DealData; bankType:BankType; summary:{profit:number;marginPercent:number}; userId?:string; userName?:string; companyId?:string; storeId?:string; }