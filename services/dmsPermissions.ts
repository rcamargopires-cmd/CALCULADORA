import type { DmsAccessProfile, DmsPermissionKey, User } from '../types';

export type DmsPermissions={
  profile:DmsAccessProfile|'admin'|'director'|'seller'|'reception'|'evaluator'|'legacy_manager';
  management:boolean;
  crmView:boolean;
  evaluationsView:boolean;
  proposalsView:boolean;
  purchasesView:boolean;
  salesView:boolean;
  stockView:boolean;
  stockWrite:boolean;
  prepView:boolean;
  prepRequest:boolean;
  prepApprove:boolean;
  financeView:boolean;
  financeCreate:boolean;
  financeSettle:boolean;
  documentsView:boolean;
  afterSalesView:boolean;
  assetsView:boolean;
  reportsView:boolean;
  diagnostics:boolean;
  usersManage:boolean;
};

export const DMS_PERMISSION_OPTIONS:Array<{key:DmsPermissionKey;label:string;group:string;description:string}>=[
  {key:'crmView',label:'CRM / showroom',group:'Comercial',description:'Acessa clientes, atendimentos e acompanhamento comercial.'},
  {key:'evaluationsView',label:'Avaliações / MarketIQ',group:'Comercial',description:'Consulta e acompanha avaliações de veículos.'},
  {key:'proposalsView',label:'Propostas comerciais',group:'Comercial',description:'Consulta o fluxo de propostas e negociações.'},
  {key:'salesView',label:'Pedidos de venda',group:'Comercial',description:'Acessa pedidos, crédito, faturamento e entrega.'},
  {key:'purchasesView',label:'Compras / entradas',group:'Compras',description:'Acessa avaliação aprovada, compra e entrada de veículos.'},
  {key:'stockView',label:'Ver estoque',group:'Estoque',description:'Consulta o estoque e os dados básicos dos veículos.'},
  {key:'stockWrite',label:'Alterar estoque',group:'Estoque',description:'Inclui, edita, transfere e dá saída em veículos.'},
  {key:'prepView',label:'Ver PrepTrack',group:'Preparação',description:'Acessa as ordens e o histórico de preparação.'},
  {key:'prepRequest',label:'Lançar preparação',group:'Preparação',description:'Solicita serviços, prestadores, valores e prazos.'},
  {key:'prepApprove',label:'Aprovar preparação',group:'Preparação',description:'Aprova serviços e gera o compromisso financeiro.'},
  {key:'financeView',label:'Ver financeiro',group:'Financeiro',description:'Consulta contas a pagar, receber, caixa e DRE.'},
  {key:'financeCreate',label:'Criar lançamentos',group:'Financeiro',description:'Cria contas a pagar e a receber manualmente.'},
  {key:'financeSettle',label:'Baixar pagamentos/recebimentos',group:'Financeiro',description:'Baixa, concilia e fecha contas financeiras.'},
  {key:'documentsView',label:'Documentação',group:'Operação',description:'Acessa ATPV-e, CRLV, gravame, débitos e despachante.'},
  {key:'afterSalesView',label:'Pós-venda / garantia',group:'Operação',description:'Acessa garantias, retornos e ocorrências pós-venda.'},
  {key:'assetsView',label:'Ativos / chaves / manuais',group:'Operação',description:'Acessa o AssetGuard e controles físicos.'},
  {key:'reportsView',label:'Relatórios e BI',group:'Gestão',description:'Acessa relatórios, indicadores, alertas e visão executiva.'},
  {key:'diagnostics',label:'Diagnóstico DMS',group:'Governança',description:'Executa o pente-fino de integridade entre módulos.'},
  {key:'usersManage',label:'Gerenciar usuários',group:'Governança',description:'Cria, edita e administra acessos da equipe.'},
];

const fullManagement=(profile:DmsPermissions['profile']):DmsPermissions=>({
  profile,management:true,
  crmView:true,evaluationsView:true,proposalsView:true,purchasesView:true,salesView:true,
  stockView:true,stockWrite:true,
  prepView:true,prepRequest:true,prepApprove:true,
  financeView:true,financeCreate:false,financeSettle:false,
  documentsView:true,afterSalesView:true,assetsView:true,reportsView:true,
  diagnostics:true,usersManage:true,
});

const baseForProfile=(profile:DmsAccessProfile):DmsPermissions=>{
  if(profile==='preparation')return{
    profile,management:false,
    crmView:false,evaluationsView:false,proposalsView:false,purchasesView:false,salesView:false,
    stockView:true,stockWrite:false,
    prepView:true,prepRequest:true,prepApprove:false,
    financeView:false,financeCreate:false,financeSettle:false,
    documentsView:false,afterSalesView:false,assetsView:false,reportsView:false,
    diagnostics:false,usersManage:false,
  };
  if(profile==='finance')return{
    profile,management:false,
    crmView:false,evaluationsView:false,proposalsView:false,purchasesView:false,salesView:false,
    stockView:false,stockWrite:false,
    prepView:false,prepRequest:false,prepApprove:false,
    financeView:true,financeCreate:true,financeSettle:true,
    documentsView:false,afterSalesView:false,assetsView:false,reportsView:false,
    diagnostics:false,usersManage:false,
  };
  return fullManagement('management');
};

const applyOverrides=(base:DmsPermissions,user?:Partial<User>|null):DmsPermissions=>{
  if(!user?.dmsPermissionOverrides)return base;
  const next={...base};
  for(const option of DMS_PERMISSION_OPTIONS){
    const value=user.dmsPermissionOverrides[option.key];
    if(typeof value==='boolean')(next as any)[option.key]=value;
  }
  if(next.stockWrite)next.stockView=true;
  if(next.prepRequest||next.prepApprove)next.prepView=true;
  if(next.financeCreate||next.financeSettle)next.financeView=true;
  return next;
};

export const dmsAccessLabel=(user?:Partial<User>|null)=>{
  if(!user)return'';
  if(user.role==='admin')return'Administrador master';
  if(user.role==='director')return'Diretoria';
  if(user.role==='seller'||user.role==='user')return'Vendas';
  if(user.role==='reception')return'Recepção';
  if(user.role==='evaluator')return'Avaliador MarketIQ';
  if(user.role==='manager'){
    if(user.dmsAccessProfile==='preparation')return'Preparação';
    if(user.dmsAccessProfile==='finance')return'Financeiro / Caixa';
    if(user.dmsAccessProfile==='management')return'Gestor';
    return'Gestor · acesso legado';
  }
  return String(user.role||'');
};

export const dmsPermissions=(user?:Partial<User>|null):DmsPermissions=>{
  const role=String(user?.role||'');
  if(role==='admin'){
    const admin=fullManagement('admin');
    return{...admin,financeCreate:true,financeSettle:true};
  }
  if(role==='director'){
    return applyOverrides({
      profile:'director',management:false,
      crmView:false,evaluationsView:false,proposalsView:false,purchasesView:false,salesView:false,
      stockView:true,stockWrite:false,
      prepView:true,prepRequest:false,prepApprove:false,
      financeView:true,financeCreate:false,financeSettle:false,
      documentsView:true,afterSalesView:true,assetsView:true,reportsView:true,
      diagnostics:true,usersManage:false,
    },user);
  }
  if(role==='manager'){
    const profile=user?.dmsAccessProfile;
    if(profile==='management'||profile==='preparation'||profile==='finance')return applyOverrides(baseForProfile(profile),user);
    return applyOverrides({...fullManagement('legacy_manager'),financeCreate:true,financeSettle:true},user);
  }
  if(role==='seller'||role==='user')return applyOverrides({
    profile:'seller',management:false,
    crmView:true,evaluationsView:true,proposalsView:true,purchasesView:false,salesView:false,
    stockView:false,stockWrite:false,
    prepView:false,prepRequest:false,prepApprove:false,
    financeView:false,financeCreate:false,financeSettle:false,
    documentsView:false,afterSalesView:false,assetsView:false,reportsView:false,
    diagnostics:false,usersManage:false,
  },user);
  if(role==='reception')return applyOverrides({
    profile:'reception',management:false,
    crmView:true,evaluationsView:false,proposalsView:false,purchasesView:false,salesView:false,
    stockView:false,stockWrite:false,
    prepView:false,prepRequest:false,prepApprove:false,
    financeView:false,financeCreate:false,financeSettle:false,
    documentsView:false,afterSalesView:false,assetsView:false,reportsView:false,
    diagnostics:false,usersManage:false,
  },user);
  return applyOverrides({
    profile:'evaluator',management:false,
    crmView:false,evaluationsView:true,proposalsView:false,purchasesView:false,salesView:false,
    stockView:false,stockWrite:false,
    prepView:false,prepRequest:false,prepApprove:false,
    financeView:false,financeCreate:false,financeSettle:false,
    documentsView:false,afterSalesView:false,assetsView:false,reportsView:false,
    diagnostics:false,usersManage:false,
  },user);
};

export const dmsPermissionOverridesFor=(user:Partial<User>,values:Partial<Record<DmsPermissionKey,boolean>>)=>{
  const role=user.role||'manager';
  const profile=user.dmsAccessProfile||'management';
  const base=dmsPermissions({...user,dmsPermissionOverrides:undefined,role,dmsAccessProfile:profile});
  const overrides:Partial<Record<DmsPermissionKey,boolean>>={};
  for(const option of DMS_PERMISSION_OPTIONS){
    const value=values[option.key];
    if(typeof value==='boolean'&&value!==(base as any)[option.key])overrides[option.key]=value;
  }
  return overrides;
};
