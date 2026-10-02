import type { DmsAccessProfile, User } from '../types';

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
    return{
      profile:'admin',management:true,stockView:true,stockWrite:true,
      prepView:true,prepRequest:true,prepApprove:true,
      financeView:true,financeCreate:true,financeSettle:true,
      diagnostics:true,usersManage:true,
    };
  }
  if(role==='director'){
    return{
      profile:'director',management:false,stockView:true,stockWrite:false,
      prepView:true,prepRequest:false,prepApprove:false,
      financeView:true,financeCreate:false,financeSettle:false,
      diagnostics:true,usersManage:false,
    };
  }
  if(role==='manager'){
    const profile=user?.dmsAccessProfile;
    if(profile==='preparation'){
      return{
        profile,management:false,stockView:true,stockWrite:false,
        prepView:true,prepRequest:true,prepApprove:false,
        financeView:false,financeCreate:false,financeSettle:false,
        diagnostics:false,usersManage:false,
      };
    }
    if(profile==='finance'){
      return{
        profile,management:false,stockView:false,stockWrite:false,
        prepView:false,prepRequest:false,prepApprove:false,
        financeView:true,financeCreate:true,financeSettle:true,
        diagnostics:false,usersManage:false,
      };
    }
    if(profile==='management'){
      return{
        profile,management:true,stockView:true,stockWrite:true,
        prepView:true,prepRequest:true,prepApprove:true,
        financeView:true,financeCreate:false,financeSettle:false,
        diagnostics:true,usersManage:true,
      };
    }
    // Compatibilidade: gestores antigos continuam completos até serem editados.
    return{
      profile:'legacy_manager',management:true,stockView:true,stockWrite:true,
      prepView:true,prepRequest:true,prepApprove:true,
      financeView:true,financeCreate:true,financeSettle:true,
      diagnostics:true,usersManage:true,
    };
  }
  if(role==='seller'||role==='user'){
    return{
      profile:'seller',management:false,stockView:false,stockWrite:false,
      prepView:false,prepRequest:false,prepApprove:false,
      financeView:false,financeCreate:false,financeSettle:false,
      diagnostics:false,usersManage:false,
    };
  }
  if(role==='reception'){
    return{
      profile:'reception',management:false,stockView:false,stockWrite:false,
      prepView:false,prepRequest:false,prepApprove:false,
      financeView:false,financeCreate:false,financeSettle:false,
      diagnostics:false,usersManage:false,
    };
  }
  return{
    profile:'evaluator',management:false,stockView:false,stockWrite:false,
    prepView:false,prepRequest:false,prepApprove:false,
    financeView:false,financeCreate:false,financeSettle:false,
    diagnostics:false,usersManage:false,
  };
};
