export type BankType = 'volks' | 'others';
export type UserRole = 'admin' | 'manager' | 'director' | 'seller' | 'user' | 'reception' | 'evaluator';
export type DmsAccessProfile = 'management' | 'preparation' | 'finance';
export type DmsPermissionKey =
  | 'crmView'
  | 'evaluationsView'
  | 'proposalsView'
  | 'purchasesView'
  | 'salesView'
  | 'stockView'
  | 'stockWrite'
  | 'prepView'
  | 'prepRequest'
  | 'prepApprove'
  | 'financeView'
  | 'financeCreate'
  | 'financeSettle'
  | 'documentsView'
  | 'afterSalesView'
  | 'assetsView'
  | 'reportsView'
  | 'diagnostics'
  | 'usersManage';
export type UserStatus = 'active' | 'inactive';
export type CompanyPlan = 'starter' | 'pro' | 'enterprise';
export type CompanyStatus = 'trial' | 'active' | 'suspended';
export type CompanyBilling = {
  enabled:boolean;
  dueDay:number;
  nextDueAt:string;
  graceDays:number;
  manualGraceUntil?:string;
  manualBlocked?:boolean;
  lastPaidAt?:string;
  updatedAt?:string;
};
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

export interface Company { id:string; slug:string; name:string; plan:CompanyPlan; status:CompanyStatus; createdAt?:string; trialEndsAt?:string; billing?:CompanyBilling; moduleOverrides?:Partial<Record<DealMasterModule,boolean>>; }
export interface Store { id:string; code:string; name:string; active:boolean; companyId?:string; }
export interface SellerGoals { monthly:number; firstHalf:number; capture:number; margin:number; }
export interface User { id:string; email:string; role:UserRole; name:string; status:UserStatus; createdAt?:string; goals?:SellerGoals; storeId?:string; storeIds?:string[]; companyId?:string; companyName?:string; dmsAccessProfile?:DmsAccessProfile; dmsPermissionOverrides?:Partial<Record<DmsPermissionKey,boolean>>; companyPlan?:CompanyPlan; companyStatus?:CompanyStatus; companyBilling?:CompanyBilling; companyModuleOverrides?:Partial<Record<DealMasterModule,boolean>>; }

export type CustomerConsentStatus='unknown'|'granted'|'revoked';
export interface DmsDataRetentionPolicy {
  id:string;
  kind:'data_retention_policy';
  companyId:string;
  storeId:string;
  crmInactivityMonths:number;
  auditRetentionYears:number;
  financialRetentionYears:number;
  allowCustomerAnonymization:boolean;
  updatedAt:string;
  updatedBy?:string;
  updatedByName?:string;
}

export interface CustomerMaster {
  id:string;
  kind:'customer_master';
  customerId:string;
  companyId:string;
  storeId:string;
  name:string;
  phone:string;
  email?:string;
  document?:string;
  address?:string;
  city?:string;
  state?:string;
  zipCode?:string;
  active?:boolean;
  mergedIntoCustomerId?:string;
  consentStatus?:CustomerConsentStatus;
  consentAt?:string;
  consentSource?:string;
  consentPurposes?:string[];
  consentUpdatedBy?:string;
  consentUpdatedByName?:string;
  consentUpdatedAt?:string;
  anonymizedAt?:string;
  anonymizedBy?:string;
  anonymizedByName?:string;
  createdAt:string;
  updatedAt:string;
}
export interface SupplierMaster {
  id:string;
  kind:'supplier_master';
  supplierId:string;
  companyId:string;
  storeId:string;
  name:string;
  document?:string;
  phone?:string;
  email?:string;
  pixKey?:string;
  bankInfo?:string;
  active:boolean;
  createdAt:string;
  updatedAt:string;
}

export type DmsVehicleStage='evaluated'|'purchased'|'documents'|'preparation'|'available'|'reserved'|'sold'|'invoiced'|'delivered'|'after_sales'|'exited';
export interface VehicleMaster {
  id:string;
  kind:'vehicle_master';
  vehicleId:string;
  companyId:string;
  storeId:string;
  plate:string;
  brand?:string;
  model:string;
  year?:string;
  km?:number;
  stage:DmsVehicleStage;
  purchaseCost?:number;
  prepCost?:number;
  currentCost?:number;
  fipe?:number;
  askingPrice?:number;
  entryDate?:string;
  source?:'import'|'manual'|'evaluation'|'trade_in'|'purchase'|'consignment'|'repasse';
  createdAt:string;
  updatedAt:string;
}
export type DmsDiagnosticSeverity='critical'|'warning'|'info';
export interface DmsDiagnosticIssue {
  id:string;
  severity:DmsDiagnosticSeverity;
  domain:'stock'|'vehicle'|'prep'|'finance'|'supplier'|'customer'|'permissions'|'system';
  title:string;
  detail:string;
  plate?:string;
  vehicleId?:string;
  entityId?:string;
}
export interface DmsDiagnosticReport {
  generatedAt:string;
  companyId:string;
  storeId:string;
  stockCount:number;
  vehicleMasterCount:number;
  prepOrderCount:number;
  purchaseCount:number;
  salesOrderCount:number;
  financeEntryCount:number;
  supplierCount:number;
  customerCount:number;
  criticalCount:number;
  warningCount:number;
  infoCount:number;
  issues:DmsDiagnosticIssue[];
}

export interface DmsAuditEvent {
  id:string;
  kind:'audit_event';
  companyId:string;
  storeId:string;
  entityType:'vehicle'|'customer'|'supplier'|'proposal'|'sale'|'finance'|'prep'|'document'|'user'|'system';
  entityId:string;
  action:string;
  label:string;
  details?:string;
  amount?:number;
  plate?:string;
  vehicleId?:string;
  at:string;
  actorEmail?:string;
  actorName?:string;
}
export type StockSource='import'|'manual'|'purchase'|'trade_in'|'consignment';
export type StockMovementType='entry'|'update'|'status'|'cost'|'transfer'|'exit';
export interface StockMovement {
  id:string; kind:'stock_movement'; movementType:StockMovementType; vehicleId?:string; plate:string; vehicle:string;
  fromStatus?:string; toStatus?:string; fromStoreId?:string; toStoreId?:string; amount?:number; details?:string;
  companyId:string; storeId:string; at:string; actorEmail?:string; actorName?:string;
}
export interface OperationalStockItem { id:string; vehicleId?:string; snapshotDate:string; plate:string; vehicle:string; model?:string; stockDays:number; cost:number; fipe:number; askingPrice:number; purchaseCost?:number; prepCost?:number; brand?:string; year?:string; km?:number; entryDate?:string; source?:StockSource; currentRecord?:boolean; manualActive?:boolean; updatedAt?:string; manualExitAt?:string; location?:string; status?:string; storeId?:string; companyId?:string; }
export interface OperationalSaleItem { id:string; saleDate:string; plate:string; vehicle:string; seller:string; invoiceValue:number; marginValue:number; marginPercent:number; hasTradeIn?:boolean; storeId?:string; companyId?:string; }
export interface MarketPresenceItem { id:string; referenceDate:string; plate:string; vehicle:string; adStatus:'active'|'missing'; photoStatus:'ok'|'insufficient'|'not_validated'|'missing'; photoCount?:number; sitePrice?:number; siteKm?:number; alert?:string; url?:string; auditedAt?:string; storeId?:string; companyId?:string; }

export type PrepServiceStatus='pending'|'approved'|'in_service'|'waiting_part'|'done'|'cancelled';
export type PrepOrderStatus='triage'|'preparing'|'waiting_approval'|'waiting_part'|'ready'|'showroom'|'delivery'|'delivered';
export type PrepDestination='showroom'|'delivery';
export type DmsAttachmentCategory='budget'|'invoice'|'proof'|'before'|'after'|'document'|'xml'|'other';
export interface DmsAttachment {
  id:string;
  kind:'dms_attachment';
  companyId:string;
  storeId:string;
  entityType:'prep_service'|'finance_entry'|'vehicle_document'|'sales_order'|'purchase'|'after_sales';
  entityId:string;
  vehicleId?:string;
  plate?:string;
  category:DmsAttachmentCategory;
  name:string;
  contentType:string;
  size:number;
  storagePath:string;
  url:string;
  createdAt:string;
  createdBy:string;
  createdByName:string;
}

export type FinanceEntryType='payable'|'receivable';
export type FinanceEntryStatus='pending'|'paid'|'received'|'cancelled';
export type FinanceNature='revenue'|'expense'|'asset'|'liability';
export interface FinanceChartAccount {
  id:string;
  kind:'finance_chart_account';
  chartAccountId:string;
  code:string;
  name:string;
  nature:FinanceNature;
  active:boolean;
  companyId:string;
  storeId:string;
  createdAt:string;
  updatedAt:string;
}
export interface FinanceCostCenter {
  id:string;
  kind:'finance_cost_center';
  costCenterId:string;
  code:string;
  name:string;
  active:boolean;
  companyId:string;
  storeId:string;
  createdAt:string;
  updatedAt:string;
}

export type FinanceAccountType='bank'|'cash';
export interface FinanceAccount {
  id:string;
  kind:'finance_account';
  accountId:string;
  accountType:FinanceAccountType;
  name:string;
  bankName?:string;
  agency?:string;
  accountNumber?:string;
  pixKey?:string;
  openingBalance:number;
  active:boolean;
  companyId:string;
  storeId:string;
  createdAt:string;
  updatedAt:string;
}
export type FinanceOrigin='prep'|'purchase'|'manual'|'sale'|'commission'|'other';
export interface FinanceEntry {
  id:string;
  kind:'finance_entry';
  entryType:FinanceEntryType;
  status:FinanceEntryStatus;
  category:string;
  description:string;
  party:string;
  partyId?:string;
  amount:number;
  dueDate?:string;
  competenceDate?:string;
  settledAt?:string;
  paymentMethod?:string;
  paymentReference?:string;
  financeAccountId?:string;
  chartAccountId?:string;
  costCenterId?:string;
  plate?:string;
  vehicle?:string;
  vehicleId?:string;
  origin:FinanceOrigin;
  originId?:string;
  installmentGroupId?:string;
  installmentNumber?:number;
  installmentCount?:number;
  companyId:string;
  storeId:string;
  createdAt:string;
  updatedAt:string;
  createdBy?:string;
  createdByName?:string;
  approvedBy?:string;
  approvedByName?:string;
  approvedAt?:string;
  reversedAt?:string;
  reversedBy?:string;
  reversedByName?:string;
  reversalReason?:string;
  lastSettledAt?:string;
  reconciliationId?:string;
  reconciledAt?:string;
  attachmentIds?:string[];
}
export type FinanceReconciliationStatus='balanced'|'difference';
export interface FinanceReconciliation {
  id:string;
  kind:'finance_reconciliation';
  companyId:string;
  storeId:string;
  financeAccountId:string;
  startDate:string;
  endDate:string;
  systemBalance:number;
  statementBalance:number;
  difference:number;
  status:FinanceReconciliationStatus;
  financeEntryIds:string[];
  createdAt:string;
  createdBy:string;
  createdByName:string;
}
export type FinanceClosingPeriod='daily'|'monthly';
export interface FinanceClosing {
  id:string;
  kind:'finance_closing';
  companyId:string;
  storeId:string;
  financeAccountId:string;
  periodType:FinanceClosingPeriod;
  referenceDate:string;
  systemBalance:number;
  declaredBalance:number;
  difference:number;
  notes?:string;
  closedAt:string;
  closedBy:string;
  closedByName:string;
}

export type FinanceReversalStatus='pending'|'approved'|'rejected';
export interface FinanceReversalRequest {
  id:string;
  kind:'finance_reversal_request';
  companyId:string;
  storeId:string;
  financeEntryId:string;
  entryType:FinanceEntryType;
  amount:number;
  description:string;
  party:string;
  reason:string;
  status:FinanceReversalStatus;
  requestedAt:string;
  requestedBy:string;
  requestedByName:string;
  decidedAt?:string;
  decidedBy?:string;
  decidedByName?:string;
  decisionNote?:string;
}

export type PrepPayableStatus='pending'|'paid'|'cancelled';
export type VehicleHistoryEventType='prep_requested'|'prep_approved'|'prep_rejected'|'prep_paid'|'prep_completed'|'prep_cancelled';
export interface PrepService {
  id:string; type:string; provider:string; supplierId?:string; quoteGroupId?:string; status:PrepServiceStatus; estimatedCost:number; finalCost:number;
  sentAt?:string; dueAt?:string; returnedAt?:string; notes?:string;
  requestedAt?:string; requestedBy?:string; requestedByName?:string;
  approvedAt?:string; approvedBy?:string; approvedByName?:string;
  rejectedAt?:string; rejectedBy?:string; rejectedByName?:string; rejectionReason?:string;
  payableId?:string;
  attachmentIds?:string[];
  warrantyUntil?:string;
  reworkOfServiceId?:string;
  reworkReason?:string;
}
export interface PrepOrder { id:string; vehicleId?:string; plate:string; vehicle:string; openedAt:string; updatedAt:string; completedAt?:string; status:PrepOrderStatus; sold:boolean; destination:PrepDestination; services:PrepService[]; notes?:string; createdBy?:string; storeId:string; companyId:string; }
export interface PrepPayable extends FinanceEntry {
  entryType:'payable';
  status:PrepPayableStatus;
  origin:'prep';
  orderId:string;
  serviceId:string;
  serviceType:string;
  provider:string;
  dueAt?:string;
  requestedBy?:string;
  requestedByName?:string;
  approvedAt:string;
  paidAt?:string;
  paidBy?:string;
  paidByName?:string;
}
export interface VehicleHistoryEvent {
  id:string; kind:'vehicle_history'; vehicleId?:string; plate:string; vehicle:string; type:VehicleHistoryEventType; label:string; details?:string;
  amount?:number; provider?:string; at:string; byEmail?:string; byName?:string;
  orderId?:string; serviceId?:string; payableId?:string; companyId:string; storeId:string;
}

export type SalesOrderStatus='draft'|'approved'|'credit_pending'|'ready_to_invoice'|'invoiced'|'delivered'|'cancelled';
export type CreditStatus='not_required'|'pending'|'approved'|'rejected';
export interface SalesDeliveryChecklist {
  financialReleased:boolean;
  documentsReady:boolean;
  vehicleReady:boolean;
  customerConfirmed:boolean;
}
export interface SalesOrder {
  id:string;
  kind:'sales_order';
  salesOrderId:string;
  companyId:string;
  storeId:string;
  leadId:string;
  proposalId:string;
  proposalVersion:number;
  customerId?:string;
  customerName:string;
  customerPhone:string;
  sellerId?:string;
  sellerEmail?:string;
  sellerName?:string;
  vehicleId?:string;
  plate:string;
  vehicle:string;
  year?:string;
  salePrice:number;
  discount:number;
  netSalePrice:number;
  cashEntry:number;
  financedAmount:number;
  installments:number;
  estimatedInstallment:number;
  bankName?:string;
  creditStatus:CreditStatus;
  creditReference?:string;
  creditDecisionAt?:string;
  creditApprovedAt?:string;
  financingReturn?:number;
  tradeInPlate?:string;
  tradeInValue:number;
  tradeInDebt:number;
  tradeInPurchaseId?:string;
  status:SalesOrderStatus;
  receivableIds?:string[];
  commissionPayableId?:string;
  commissionAmount?:number;
  invoiceNumber?:string;
  invoiceDate?:string;
  deliveryDate?:string;
  deliveryChecklist:SalesDeliveryChecklist;
  deliveredBy?:string;
  deliveredByName?:string;
  notes?:string;
  approvedAt?:string;
  approvedBy?:string;
  approvedByName?:string;
  invoicedAt?:string;
  deliveredAt?:string;
  cancelledAt?:string;
  cancelledBy?:string;
  cancelledByName?:string;
  cancellationReason?:string;
  reversedFinanceIds?:string[];
  createdAt:string;
  updatedAt:string;
  createdBy?:string;
  createdByName?:string;
}

export type VehiclePurchaseOrigin='purchase'|'trade_in'|'repasse'|'consignment';
export type VehiclePurchaseStatus='draft'|'approved'|'payment_pending'|'documents'|'entered'|'cancelled';
export interface VehiclePurchaseDocuments {
  atpv:boolean;
  crlv:boolean;
  ownerDocument:boolean;
  debtsChecked:boolean;
  lienChecked:boolean;
  spareKey:boolean;
  manual:boolean;
}
export interface VehiclePurchase {
  id:string;
  kind:'vehicle_purchase';
  purchaseId:string;
  companyId:string;
  storeId:string;
  evaluationRequestId?:string;
  vehicleId?:string;
  plate:string;
  vehicle:string;
  brand?:string;
  year?:string;
  km?:number;
  fipe?:number;
  origin:VehiclePurchaseOrigin;
  status:VehiclePurchaseStatus;
  ownerName:string;
  ownerDocument?:string;
  ownerPhone?:string;
  ownerEmail?:string;
  ownerPix?:string;
  supplierId?:string;
  purchasePrice:number;
  payoffAmount:number;
  debtsAmount:number;
  acquisitionCosts:number;
  totalAcquisitionCost:number;
  paymentMethod?:string;
  paymentDueDate?:string;
  consignmentExpiresAt?:string;
  payableId?:string;
  payableIds?:string[];
  documents:VehiclePurchaseDocuments;
  notes?:string;
  approvedAt?:string;
  approvedBy?:string;
  approvedByName?:string;
  enteredAt?:string;
  createdAt:string;
  updatedAt:string;
  createdBy?:string;
  createdByName?:string;
}

export type AfterSalesCaseType='warranty'|'complaint'|'documentation'|'return'|'other';
export type AfterSalesCaseStatus='open'|'in_progress'|'waiting_supplier'|'resolved'|'closed';
export interface AfterSalesCase {
  id:string;
  kind:'after_sales_case';
  companyId:string;
  storeId:string;
  salesOrderId?:string;
  customerId?:string;
  customerName:string;
  customerPhone?:string;
  vehicleId?:string;
  plate:string;
  vehicle:string;
  type:AfterSalesCaseType;
  status:AfterSalesCaseStatus;
  title:string;
  description:string;
  supplierName?:string;
  supplierId?:string;
  cost:number;
  financeEntryId?:string;
  openedAt:string;
  openedBy:string;
  openedByName:string;
  updatedAt:string;
  resolvedAt?:string;
  closedAt?:string;
  satisfactionScore?:number;
  satisfactionNotes?:string;
}

export type DocumentProcessStatus='pending'|'ok'|'not_required'|'blocked';
export type AtpvProcessStatus='pending'|'ready'|'signed'|'submitted'|'completed';
export interface VehicleDocumentCase {
  id:string;
  kind:'vehicle_document_case';
  companyId:string;
  storeId:string;
  vehicleId:string;
  plate:string;
  vehicle:string;
  atpvStatus:AtpvProcessStatus;
  crlvStatus:DocumentProcessStatus;
  lienStatus:DocumentProcessStatus;
  debtsStatus:DocumentProcessStatus;
  finesAmount:number;
  debtsAmount:number;
  dispatcherName?:string;
  dispatcherCost:number;
  dispatcherFinanceEntryId?:string;
  transferDueDate?:string;
  transferCompletedAt?:string;
  notes?:string;
  createdAt:string;
  updatedAt:string;
  updatedBy?:string;
  updatedByName?:string;
  attachmentIds?:string[];
}

export type ShowroomPassageStatus='waiting'|'in_service'|'evaluation'|'proposal'|'follow_up'|'sale'|'no_deal';
export type ShowroomPassageOrigin='walk_in'|'requested';
export type CrmLeadSource='showroom'|'whatsapp'|'web'|'instagram'|'manual'|'other';
export type CrmLeadTemperature='hot'|'warm'|'cold';
export type ShowroomPassageActivityType='created'|'assumed'|'status'|'note'|'follow_up'|'future_contact'|'correction'|'contact'|'closed';
export type CrmProposalStatus='draft'|'sent'|'accepted'|'rejected'|'expired';
export interface CrmProposalSnapshot {
  id:string;
  version:number;
  status:CrmProposalStatus;
  vehicle:string;
  vehicleId?:string;
  plate:string;
  year:string;
  km:number;
  location:string;
  stockPriceAtCreation:number;
  salePrice:number;
  discount:number;
  tradeInPlate:string;
  tradeInValue:number;
  tradeInDebt:number;
  cashEntry:number;
  financedAmount:number;
  installments:number;
  estimatedInstallment:number;
  notes:string;
  validUntil?:string;
  reservationExpiresAt?:string;
  acceptedAt?:string;
  acceptedCustomerName?:string;
  acceptedCustomerDocument?:string;
  acceptanceMethod?:'assisted_digital';
  createdAt:string;
  createdByEmail:string;
  createdByName:string;
  updatedAt:string;
  updatedByEmail:string;
  updatedByName:string;
}
export interface ShowroomPassageActivity { id:string; type:ShowroomPassageActivityType; at:string; label:string; details?:string; status?:ShowroomPassageStatus; byEmail?:string; byName?:string; }
export interface ShowroomPassage {
  id:string;
  customerId?:string;
  customerName:string;
  phone:string;
  interestModel:string;
  origin:ShowroomPassageOrigin;
  assignedSellerId:string;
  assignedSellerEmail:string;
  assignedSellerName:string;
  status:ShowroomPassageStatus;
  createdAt:string;
  updatedAt:string;
  assumedAt?:string;
  closedAt?:string;
  notes?:string;
  leadSource?:CrmLeadSource;
  sourceLabel?:string;
  leadTemperature?:CrmLeadTemperature;
  nextFollowUpAt?:string;
  lastContactAt?:string;
  lastContactAttemptAt?:string;
  lastContactOutcome?:string;
  tradeInPlate?:string;
  desiredVehicle?:string;
  customerEmail?:string;
  purchaseTimeline?:string;
  preferredContact?:'whatsapp'|'phone'|'email';
  desiredEntry?:number;
  desiredPayment?:number;
  lostReason?:string;
  futureContactAt?:string;
  futureContactReason?:string;
  futureContactNote?:string;
  futureContactStatus?:'scheduled'|'reactivated'|'cancelled';
  hibernatedAt?:string;
  reactivatedAt?:string;
  archivedAt?:string;
  archiveReason?:string;
  crmProposals?:CrmProposalSnapshot[];
  whatsappThreadId?:string;
  activityHistory?:ShowroomPassageActivity[];
  createdBy?:string;
  createdByName?:string;
  companyId:string;
  storeId:string;
}
export interface ShowroomQueueSeller { id:string; email:string; name:string; available:boolean; }
export type ShowroomQueueReason='busy'|'lunch'|'away'|'other';
export interface ShowroomQueuePause { email:string; name:string; reason:ShowroomQueueReason; pausedAt:string; pausedBy?:string; pausedByName?:string; }
export interface ShowroomQueueAudit { id:string; action:'skip_once'|'pause'|'resume'|'remove'; sellerEmail:string; sellerName:string; reason?:ShowroomQueueReason; at:string; byEmail?:string; byName?:string; }
export interface ShowroomQueueState { id:string; companyId:string; storeId:string; sellers:ShowroomQueueSeller[]; nextIndex:number; turnOrder:string[]; pausedSellers:ShowroomQueuePause[]; excludedSellerEmails:string[]; auditLog:ShowroomQueueAudit[]; updatedAt:string; }

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