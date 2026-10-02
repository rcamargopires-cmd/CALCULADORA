import type { DmsAccessProfile, DmsPermissionKey, User } from '../types';

export type DmsPermissions={
  profile:DmsAccessProfile|'admin'|'director'|'seller'|'reception'|'evaluator'|'legacy_manager';
  management:boolean;
  stockView:boolean;
  stockWrite:boolean;
  prepView:boolean;
  prepRequest:boolean;
  prepApprove:boolean;
  financeView:boolean;
  financeCreate:boolean;
  financeSettle:boolean;
  diagnostics:boolean;
  usersManage:boolean;
};

export const DMS_PERMISSION_OPTIONS:Array<{key:DmsPermissionKey;label:string;group:string;description:string}>=[
  {key:'stockView',label:'Ver estoque',group:'Estoque',description:'Consulta o estoque e os dados básicos dos veículos.'},
  {key:'stockWrite',label:'Alterar estoque',group:'Estoque',description:'Inclui, edita e dá saída em veículos.'},
  {key:'prepView',label:'Ver PrepTrack',group:'Preparação',description:'Acessa as ordens e o histórico de preparação.'},
  {key:'prepRequest',label:'Lançar preparação',group:'Preparação',description:'Solicita serviços, prestadores, valores e prazos.'},
  {key:'prepApprove',label:'Aprovar preparação',group:'Preparação',description:'Aprova serviços e gera o compromisso financeiro.'},
  {key:'financeView',label:'Ver financeiro',group:'Financeiro',description:'Consulta contas a pagar, receber e fluxo de caixa.'},
  {key:'financeCreate',label:'Criar lançamentos',group:'Financeiro',description:'Cria contas a pagar e a receber manualmente.'},
  {key:'financeSettle',label:'Baixar pagamentos/recebimentos',group:'Financeiro',description:'Marca contas como pagas ou recebidas.'},
  {key:'diagnostics',label:'Diagnóstico DMS',group:'Governança',description:'Executa o pente-fino de integridade entre módulos.'},
  {key:'usersManage',label:'Gerenciar usuários',group:'Governança',description:'Cria, edita e administra acessos da equipe.'},
];

const baseForProfile=(profile:DmsAccessProfile):DmsPermissions=>{
  if(profile==='preparation')return{
    profile,management:false,stockView:true,stockWrite:false,
    prepView:true,prepRequest:true,prepApprove:false,
    financeView:false,financeCreate:false,financeSettle:false,
    diagnostics:false,usersManage:false,
  };
  if(profile==='finance')return{
    profile,management:false,stockView:false,stockWrite:false,
    prepView:false,prepRequest:false,prepApprove:false,
    financeView:true,financeCreate:true,financeSettle:true,
    diagnostics:false,usersManage:false,
  };
  return{
    profile:'management',management:true,stockView:true,stockWrite:true,
    prepView:true,prepRequest:true,prepApprove:true,
    financeView:true,financeCreate:false,financeSettle:false,
    diagnostics:true,usersManage:true,
  };
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
  if(role==='admin')return{
    profile:'admin',management:true,stockView:true,stockWrite:true,
    prepView:true,prepRequest:true,prepApprove:true,
    financeView:true,financeCreate:true,financeSettle:true,
    diagnostics:true,usersManage:true,
  };
  if(role==='director'){
    return applyOverrides({
      profile:'director',management:false,stockView:true,stockWrite:false,
      prepView:true,prepRequest:false,prepApprove:false,
      financeView:true,financeCreate:false,financeSettle:false,
      diagnostics:true,usersManage:false,
    },user);
  }
  if(role==='manager'){
    const profile=user?.dmsAccessProfile;
    if(profile==='management'||profile==='preparation'||profile==='finance'){
      return applyOverrides(baseForProfile(profile),user);
    }
    return applyOverrides({
      profile:'legacy_manager',management:true,stockView:true,stockWrite:true,
      prepView:true,prepRequest:true,prepApprove:true,
      financeView:true,financeCreate:true,financeSettle:true,
      diagnostics:true,usersManage:true,
    },user);
  }
  if(role==='seller'||role==='user')return applyOverrides({
    profile:'seller',management:false,stockView:false,stockWrite:false,
    prepView:false,prepRequest:false,prepApprove:false,
    financeView:false,financeCreate:false,financeSettle:false,
    diagnostics:false,usersManage:false,
  },user);
  if(role==='reception')return applyOverrides({
    profile:'reception',management:false,stockView:false,stockWrite:false,
    prepView:false,prepRequest:false,prepApprove:false,
    financeView:false,financeCreate:false,financeSettle:false,
    diagnostics:false,usersManage:false,
  },user);
  return applyOverrides({
    profile:'evaluator',management:false,stockView:false,stockWrite:false,
    prepView:false,prepRequest:false,prepApprove:false,
    financeView:false,financeCreate:false,financeSettle:false,
    diagnostics:false,usersManage:false,
  },user);
};

export const dmsPermissionOverridesFor=(user:Partial<User>,values:Partial<Record<DmsPermissionKey,boolean>>)=>{
  const role=user.role||'manager';
  const profile=user.dmsAccessProfile||'management';
  const base=dmsPermissions({...user,dmsPermissionOverrides:undefined,role, dmsAccessProfile:profile});
  const overrides:Partial<Record<DmsPermissionKey,boolean>>={};
  for(const option of DMS_PERMISSION_OPTIONS){
    const value=values[option.key];
    if(typeof value==='boolean'&&value!==(base as any)[option.key])overrides[option.key]=value;
  }
  return overrides;
};
