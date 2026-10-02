export const normalizeEmail=value=>String(value||'').trim().toLowerCase();

export const canApproveOwn=({createdBy,actorEmail,actorRole})=>{
  if(String(actorRole||'')==='admin')return true;
  const creator=normalizeEmail(createdBy);
  const actor=normalizeEmail(actorEmail);
  if(!creator||!actor)return true;
  return creator!==actor;
};

export const proposalExpired=(value,nowMs=Date.now())=>{
  if(!value)return false;
  const time=new Date(value).getTime();
  return Number.isFinite(time)&&time<=nowMs;
};

export const canCancelSale=status=>!['delivered','cancelled'].includes(String(status||''));

export const canReverseFinance=status=>['paid','received'].includes(String(status||''));

export const stockStatusForProposalEvent=event=>{
  if(event==='sent')return'Reservado';
  if(event==='rejected'||event==='expired'||event==='cancelled')return'Disponível';
  return'';
};

export const proposalStatusTransitionAllowed=(from,to)=>{
  const key=`${String(from||'')}>${String(to||'')}`;
  return new Set([
    'draft>sent',
    'sent>accepted',
    'sent>rejected',
    'sent>expired',
    'expired>draft',
    'rejected>draft',
  ]).has(key);
};

export const purchaseStatusTransitionAllowed=(from,to)=>{
  const key=`${String(from||'')}>${String(to||'')}`;
  return new Set([
    'draft>approved',
    'approved>payment_pending',
    'approved>documents_pending',
    'payment_pending>documents_pending',
    'documents_pending>ready_for_stock',
    'ready_for_stock>stocked',
    'draft>cancelled',
    'approved>cancelled',
    'payment_pending>cancelled',
    'documents_pending>cancelled',
    'ready_for_stock>cancelled',
  ]).has(key);
};

export const saleStatusTransitionAllowed=(from,to)=>{
  const key=`${String(from||'')}>${String(to||'')}`;
  return new Set([
    'draft>approved',
    'approved>financing',
    'approved>invoiced',
    'financing>approved',
    'financing>invoiced',
    'invoiced>delivered',
    'draft>cancelled',
    'approved>cancelled',
    'financing>cancelled',
    'invoiced>cancelled',
  ]).has(key);
};
