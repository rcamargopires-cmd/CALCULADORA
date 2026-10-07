import { GoogleGenAI } from '@google/genai';
import { motyqFirestore } from '../server/motyqFirestore.js';

const FIREBASE_API_KEY = 'AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q';

const verifyFirebaseToken = async (idToken: string) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return null;
  const data = await response.json() as any;
  return data?.users?.[0] || null;
};

const firestoreFieldsToObject=(fields:any):any=>{
  const fromValue=(value:any):any=>{
    if(!value||typeof value!=='object')return null;
    if('nullValue' in value)return null;
    if('stringValue' in value)return String(value.stringValue);
    if('booleanValue' in value)return Boolean(value.booleanValue);
    if('integerValue' in value)return Number(value.integerValue);
    if('doubleValue' in value)return Number(value.doubleValue);
    if('timestampValue' in value)return String(value.timestampValue);
    if('arrayValue' in value)return (value.arrayValue?.values||[]).map(fromValue);
    if('mapValue' in value)return firestoreFieldsToObject(value.mapValue?.fields||{});
    return null;
  };
  return Object.fromEntries(Object.entries(fields||{}).map(([key,value])=>[key,fromValue(value)]));
};

const currentUserProfileWithIdToken=async(idToken:string,email:string)=>{
  const projectId='gen-lang-client-0531247430';
  const databaseId='ai-studio-447676b4-da38-4e69-b22f-6aa10f85367b';
  const url=`https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${encodeURIComponent(email)}`;
  const response=await fetch(url,{headers:{authorization:`Bearer ${idToken}`}});
  if(response.status===404)return null;
  const body:any=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`current_user_firestore_${response.status}`);
  return {id:email,...firestoreFieldsToObject(body?.fields||{})};
};

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const pct = (value: number) => `${(Number(value) || 0).toFixed(2).replace('.', ',')}%`;

const OWNER_ADMIN = 'r.camargo.pires@gmail.com';
const MANAGER_ALLOWED_ROLES = new Set(['manager','seller','user','reception','evaluator']);
const DMS_ACCESS_PROFILES = new Set(['management','preparation','finance']);
const DMS_PERMISSION_KEYS = new Set([
  'crmView','evaluationsView','proposalsView','purchasesView','salesView',
  'stockView','stockWrite','prepView','prepRequest','prepApprove',
  'financeView','financeCreate','financeSettle','documentsView','afterSalesView','workshopView',
  'assetsView','reportsView','diagnostics','usersManage'
]);
const cleanDmsPermissionOverrides=(raw:any)=>{
  const out:any={};
  if(!raw||typeof raw!=='object')return out;
  for(const [key,value] of Object.entries(raw)){
    if(DMS_PERMISSION_KEYS.has(key)&&typeof value==='boolean')out[key]=value;
  }
  return out;
};
const emailOf=(value:any)=>String(value||'').trim().toLowerCase();
const companyOf=(value:any)=>String(value?.companyId||'abrao-reze').trim()||'abrao-reze';
const roleOf=(value:any)=>String(value?.role||'').trim();
const cleanManagedUser=(raw:any)=>{
  const requestedRole=String(raw?.role||'seller').trim();
  const pricingDeskOnly=requestedRole==='pricing'||raw?.pricingDeskOnly===true;
  const role=pricingDeskOnly?'manager':requestedRole;
  const overrides=pricingDeskOnly?{}:cleanDmsPermissionOverrides(raw?.dmsPermissionOverrides);
  return {
    id:emailOf(raw?.email||raw?.id),
    email:emailOf(raw?.email||raw?.id),
    name:String(raw?.name||'').trim(),
    role,
    status:raw?.status==='inactive'?'inactive':'active',
    createdAt:String(raw?.createdAt||new Date().toISOString()),
    companyId:String(raw?.companyId||'abrao-reze').trim()||'abrao-reze',
    storeId:String(raw?.storeId||'').trim(),
    storeIds:Array.from(new Set([
      ...(Array.isArray(raw?.storeIds)?raw.storeIds:[]),
      raw?.storeId,
    ].map((value:any)=>String(value||'').trim()).filter(Boolean))),
    ...(role==='manager'&&DMS_ACCESS_PROFILES.has(String(raw?.dmsAccessProfile||''))?{dmsAccessProfile:String(raw.dmsAccessProfile)}:{}),
    ...(pricingDeskOnly?{pricingDeskOnly:true}:{}),
    ...(!pricingDeskOnly&&Object.keys(overrides).length?{dmsPermissionOverrides:overrides}:{}),
    ...(raw?.goals?{goals:raw.goals}:{}),
    ...(raw?.companyPlan?{companyPlan:raw.companyPlan}:{}),
    ...(raw?.companyStatus?{companyStatus:raw.companyStatus}:{}),
    ...(raw?.companyBilling?{companyBilling:raw.companyBilling}:{}),
    ...(raw?.companyFiscal?{companyFiscal:raw.companyFiscal}:{}),
    ...(raw?.companyModuleOverrides?{companyModuleOverrides:raw.companyModuleOverrides}:{}),
  };
};

const managementActor=async(req:any)=>{
  const authHeader=String(req.headers?.authorization||'');
  const token=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
  if(!token)return null;
  const firebaseUser=await verifyFirebaseToken(token);
  const email=emailOf(firebaseUser?.email);
  if(!email)return null;
  if(email===OWNER_ADMIN){
    const profile=await motyqFirestore.get('users',email).catch(()=>null);
    return profile?{...profile,email,role:'admin',status:'active'}:{email,id:email,name:'Admin',role:'admin',status:'active',companyId:'abrao-reze',storeId:'outlet-sorocaba'};
  }
  const profile:any=await motyqFirestore.get('users',email);
  if(!profile||profile.status!=='active')return null;
  return {...profile,email};
};

const ensureManagementScope=(actor:any,targetCompany:string)=>{
  const role=roleOf(actor);
  if(role!=='admin'&&role!=='manager')throw Object.assign(new Error('forbidden'),{status:403});
  if(role==='manager'&&targetCompany!==companyOf(actor))throw Object.assign(new Error('cross_company_forbidden'),{status:403});
};

const safeDocId=(value:any)=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,120);
const managerPermission=(actor:any,key:string,managementDefault:boolean)=>{
  if(roleOf(actor)==='admin')return true;
  if(roleOf(actor)!=='manager')return false;
  if(actor?.pricingDeskOnly===true)return false;
  const overrides=actor?.dmsPermissionOverrides&&typeof actor.dmsPermissionOverrides==='object'?actor.dmsPermissionOverrides:{};
  if(typeof overrides?.[key]==='boolean')return overrides[key]===true;
  const profile=String(actor?.dmsAccessProfile||'');
  if(!profile)return true; // gestor legado
  if(profile==='management')return managementDefault;
  return false;
};
const userAudit=async(actor:any,target:any,action:string,label:string,details='')=>{
  const companyId=companyOf(target)||companyOf(actor);
  const storeId=String(target?.storeId||actor?.storeId||'outlet-sorocaba');
  const at=new Date().toISOString();
  const id=safeDocId(`audit_user_${companyId}_${emailOf(target?.email||target?.id)}_${Date.now()}`);
  await motyqFirestore.patch('operational_meta',id,{
    id,kind:'audit_event',companyId,storeId,entityType:'user',
    entityId:emailOf(target?.email||target?.id),action,label,details,at,
    actorEmail:emailOf(actor?.email),actorName:String(actor?.name||actor?.email||''),
  }).catch(()=>undefined);
};
const sellerKeyOf=(value:any)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const uniqueEmails=(items:any[])=>Array.from(new Set(items.map(item=>emailOf(item)).filter(Boolean)));
const zeroPerformanceSeller=(name:string)=>({
  seller:name,
  sellerKey:sellerKeyOf(name),
  passages:0,
  orders:0,
  flowTotal:0,
  orderPercent:0,
  workInPeriod:0,
  avgContactsPerDay:0,
  evaluations:0,
  evaluationRate:0,
  closing:0,
  syonetSales:0,
  closingPercent:0,
  marginPerCar:0,
  marginTotal:0,
  marginPercent:0,
  captureQty:0,
  capturePercent:0,
  pipeline:0,
  projection:0,
  additionalPurchase:0,
});

const reconcileOperationalSellers=async(companyId:string,users:any[],stores:any[])=>{
  const activeSellers=users.filter((user:any)=>
    user?.status==='active' &&
    (user?.role==='seller'||user?.role==='user') &&
    emailOf(user?.email)
  );
  if(!activeSellers.length)return;

  for(const store of stores){
    const storeId=String(store?.id||'').trim();
    if(!storeId)continue;
    const storeSellers=activeSellers.filter((user:any)=>String(user?.storeId||'').trim()===storeId);
    if(!storeSellers.length)continue;

    const queueDocId=safeDocId(`${companyId}_${storeId}`);
    const queue:any=await motyqFirestore.get('showroom_queue',queueDocId).catch(()=>null);
    const excluded=new Set((Array.isArray(queue?.excludedSellerEmails)?queue.excludedSellerEmails:[]).map(emailOf));
    const existingSellers=Array.isArray(queue?.sellers)?queue.sellers:[];
    const existingEmails=new Set(existingSellers.map((item:any)=>emailOf(item?.email)));
    const additions=storeSellers
      .filter((user:any)=>!existingEmails.has(emailOf(user.email))&&!excluded.has(emailOf(user.email)))
      .map((user:any)=>({id:user.id||user.email,email:emailOf(user.email),name:String(user.name||user.email),available:true}));
    if(additions.length){
      const sellers=[...existingSellers,...additions];
      const turnOrder=uniqueEmails([
        ...(Array.isArray(queue?.turnOrder)?queue.turnOrder:[]),
        ...sellers.map((item:any)=>item.email),
      ]);
      await motyqFirestore.patch('showroom_queue',queueDocId,{
        id:queueDocId,
        companyId,
        storeId,
        sellers,
        nextIndex:Number(queue?.nextIndex||0),
        turnOrder,
        pausedSellers:Array.isArray(queue?.pausedSellers)?queue.pausedSellers:[],
        excludedSellerEmails:Array.isArray(queue?.excludedSellerEmails)?queue.excludedSellerEmails:[],
        auditLog:Array.isArray(queue?.auditLog)?queue.auditLog:[],
        updatedAt:new Date().toISOString(),
      });
    }
  }

  const current:any=await motyqFirestore.get('operational_meta','current').catch(()=>null);
  const latestDate=String(current?.latestPerformanceDate||'').trim();
  if(!latestDate)return;
  const performanceId=`performance_${safeDocId(latestDate)}`;
  const snapshot:any=await motyqFirestore.get('operational_meta',performanceId).catch(()=>null);
  if(!snapshot||!Array.isArray(snapshot?.sellers))return;

  const snapshotCompany=String(snapshot?.companyId||'').trim();
  if(snapshotCompany&&snapshotCompany!==companyId)return;
  const snapshotStore=String(snapshot?.storeId||'').trim();
  const relevantSellers=activeSellers.filter((user:any)=>!snapshotStore||String(user?.storeId||'').trim()===snapshotStore);
  const firstNameCounts=new Map<string,number>();
  relevantSellers.forEach((user:any)=>{
    const first=sellerKeyOf(user?.name).split(' ')[0]||'';
    if(first)firstNameCounts.set(first,(firstNameCounts.get(first)||0)+1);
  });
  const matchesUser=(sellerName:any,userName:any)=>{
    const seller=sellerKeyOf(sellerName);
    const user=sellerKeyOf(userName);
    if(!seller||!user)return false;
    if(seller===user)return true;
    const sellerParts=seller.split(' ').filter(Boolean);
    const userParts=user.split(' ').filter(Boolean);
    return sellerParts.length===1&&sellerParts[0]===userParts[0]&&firstNameCounts.get(sellerParts[0])===1;
  };
  const hasPerformanceData=(row:any)=>
    Number(row?.closing||0)!==0||
    Number(row?.flowTotal||0)!==0||
    Number(row?.marginPercent||0)!==0||
    Number(row?.capturePercent||0)!==0||
    Number(row?.projection||0)!==0;

  const cleanedSellers=snapshot.sellers.filter((row:any)=>{
    const user=relevantSellers.find((candidate:any)=>matchesUser(row?.seller,candidate?.name));
    if(!user)return true;
    const siblings=snapshot.sellers.filter((candidate:any)=>matchesUser(candidate?.seller,user?.name));
    if(siblings.length<2)return true;
    const dataRow=siblings.find((candidate:any)=>hasPerformanceData(candidate));
    return !(dataRow&&dataRow!==row&&!hasPerformanceData(row));
  });

  const missing=relevantSellers
    .filter((user:any)=>!cleanedSellers.some((row:any)=>matchesUser(row?.seller,user?.name)))
    .map((user:any)=>zeroPerformanceSeller(String(user.name||user.email)));
  const nextSellers=[...cleanedSellers,...missing];
  const changed=nextSellers.length!==snapshot.sellers.length||missing.length>0;
  if(changed){
    await motyqFirestore.patch('operational_meta',performanceId,{
      sellers:nextSellers,
      updatedAt:new Date().toISOString(),
    });
  }
};

const managementContext=async(actor:any,companyId:string)=>{
  ensureManagementScope(actor,companyId);
  const actorRole=roleOf(actor);
  let users:any[]=[];
  if(actorRole==='admin'){
    const allUsers=await motyqFirestore.query('users',[],500);
    users=allUsers.filter((user:any)=>{
      const rawCompany=String(user?.companyId||'').trim();
      return rawCompany===companyId || !rawCompany;
    });
  }else{
    users=await motyqFirestore.query('users',[{field:'companyId',value:companyId}],250);
  }
  const scope:any=await motyqFirestore.get('director_scope',companyId).catch(()=>null);
  let stores=Array.isArray(scope?.stores)?scope.stores.filter((item:any)=>String(item?.companyId||companyId)===companyId&&item?.active!==false):[];
  if(!stores.length){
    const multistore:any=await motyqFirestore.get('config','multistore').catch(()=>null);
    stores=Array.isArray(multistore?.stores)
      ? multistore.stores.filter((item:any)=>String(item?.companyId||'abrao-reze')===companyId&&item?.active!==false)
      : [];
  }
  if(!stores.length && companyId==='abrao-reze'){
    stores=[{
      id:'outlet-sorocaba',
      code:'OUTLET',
      name:'Outlet Sorocaba',
      active:true,
      companyId:'abrao-reze',
    }];
  }
  if(!stores.length && actor?.storeId){
    stores=[{
      id:String(actor.storeId),
      code:'ATUAL',
      name:String(actor.storeName||actor.unitName||'Unidade atual'),
      active:true,
      companyId,
    }];
  }
  if(actorRole==='manager'){
    const authorized=new Set(
      (Array.isArray(actor?.storeIds)&&actor.storeIds.length?actor.storeIds:[actor?.storeId])
        .map((value:any)=>String(value||'').trim()).filter(Boolean)
    );
    if(authorized.size)stores=stores.filter((store:any)=>authorized.has(String(store?.id||'')));
  }
  await reconcileOperationalSellers(companyId,users,stores);
  return {companyId,users,stores};
};

const handleUserManagement=async(req:any,res:any)=>{
  if(!['GET','POST','DELETE'].includes(req.method))return res.status(405).json({error:'method_not_allowed'});
  if(!motyqFirestore.configured())return res.status(503).json({error:'server_firestore_not_configured'});
  try{
    const actor:any=await managementActor(req);
    if(!actor)return res.status(401).json({error:'not_authenticated'});
    const actorRole=roleOf(actor);
    if(actorRole!=='admin'&&actorRole!=='manager')return res.status(403).json({error:'forbidden'});
    if(actorRole==='manager'&&!managerPermission(actor,'usersManage',true))return res.status(403).json({error:'permission_forbidden'});

    if(req.method==='GET'){
      const requested=String(req.query?.companyId||'').trim();
      const companyId=actorRole==='admin'?(requested||companyOf(actor)):companyOf(actor);
      return res.status(200).json(await managementContext(actor,companyId));
    }

    if(req.method==='POST'){
      const input:any=cleanManagedUser(req.body?.user||{});
      if(!input.email||!input.name||!input.storeId)return res.status(400).json({error:'invalid_user'});
      const companyId=actorRole==='admin'?input.companyId:companyOf(actor);
      ensureManagementScope(actor,companyId);
      input.companyId=companyId;
      const existing:any=await motyqFirestore.get('users',input.email).catch(()=>null);
      if(actorRole==='manager'){
        if(!MANAGER_ALLOWED_ROLES.has(input.role))return res.status(403).json({error:'role_forbidden'});
        const managerContext=await managementContext(actor,companyId);
        const allowedStoreIds=new Set((managerContext.stores||[]).map((store:any)=>String(store?.id||'')).filter(Boolean));
        const targetStores=Array.isArray(input.storeIds)&&input.storeIds.length?input.storeIds:[input.storeId];
        if(!targetStores.length||targetStores.some((id:any)=>!allowedStoreIds.has(String(id||''))))return res.status(403).json({error:'store_forbidden'});
        if(existing){
          if(companyOf(existing)!==companyId)return res.status(403).json({error:'cross_company_forbidden'});
          if(!MANAGER_ALLOWED_ROLES.has(roleOf(existing)))return res.status(403).json({error:'protected_user'});
        }
      }
      const saved=await motyqFirestore.patch('users',input.email,input);
      const beforeSummary=existing?JSON.stringify({
        role:existing.role,status:existing.status,storeId:existing.storeId,
        dmsAccessProfile:existing.dmsAccessProfile,dmsPermissionOverrides:existing.dmsPermissionOverrides||{}
      }):'novo usuário';
      const afterSummary=JSON.stringify({
        role:input.role,status:input.status,storeId:input.storeId,
        dmsAccessProfile:input.dmsAccessProfile,dmsPermissionOverrides:input.dmsPermissionOverrides||{}
      });
      await userAudit(actor,input,existing?'user_updated':'user_created',existing?'Usuário e permissões atualizados':'Usuário criado',`${beforeSummary} → ${afterSummary}`);
      if(input.role==='seller'||input.role==='user'){
        const context=await managementContext(actor,companyId);
        await reconcileOperationalSellers(companyId,context.users,context.stores);
      }
      return res.status(200).json({user:saved});
    }

    const targetEmail=emailOf(req.body?.email);
    if(!targetEmail)return res.status(400).json({error:'email_required'});
    if(targetEmail===emailOf(actor.email))return res.status(400).json({error:'cannot_delete_self'});
    const target:any=await motyqFirestore.get('users',targetEmail);
    if(!target)return res.status(404).json({error:'user_not_found'});
    if(actorRole==='manager'){
      if(companyOf(target)!==companyOf(actor))return res.status(403).json({error:'cross_company_forbidden'});
      if(!MANAGER_ALLOWED_ROLES.has(roleOf(target)))return res.status(403).json({error:'protected_user'});
    }
    await motyqFirestore.delete('users',targetEmail);
    await userAudit(actor,target,'user_deleted','Usuário removido',JSON.stringify({role:target.role,storeId:target.storeId,status:target.status}));
    return res.status(200).json({ok:true});
  }catch(error:any){
    const status=Number(error?.status)||500;
    console.error('User management failed',error?.message||error);
    return res.status(status).json({error:String(error?.message||'user_management_failed')});
  }
};

export default async function handler(req: any, res: any) {
  if (String(req.query?.action || '') === 'current-user') {
    try {
      const authHeader=String(req.headers?.authorization||'');
      const token=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
      if(!token)return res.status(401).json({error:'not_authenticated'});
      const firebaseUser=await verifyFirebaseToken(token);
      const email=emailOf(firebaseUser?.email);
      if(!email)return res.status(401).json({error:'not_authenticated'});
      if(email===OWNER_ADMIN){
        const profile=await currentUserProfileWithIdToken(token,email).catch(()=>null);
        return res.status(200).json({user:profile?{...profile,email,role:'admin',status:'active'}:{email,id:email,name:'Admin',role:'admin',status:'active',companyId:'abrao-reze',storeId:'outlet-sorocaba'}});
      }
      const profile:any=await currentUserProfileWithIdToken(token,email);
      if(!profile||profile.status!=='active')return res.status(403).json({error:'inactive_or_missing_user'});
      return res.status(200).json({user:{...profile,email}});
    } catch (error:any) {
      console.error('Current-user lookup failed',error?.message||error);
      return res.status(401).json({ error: String(error?.message || 'not_authenticated') });
    }
  }

  if (String(req.query?.action || '') === 'user-management-health') {
    if (!motyqFirestore.configured()) return res.status(503).json({ configured: false, firestore: 'not_configured' });
    try {
      await motyqFirestore.get('config','companies');
      return res.status(200).json({ configured: true, firestore: 'ok' });
    } catch (error:any) {
      return res.status(500).json({ configured: true, firestore: 'error', code: String(error?.message || 'unknown').slice(0,120) });
    }
  }

  if (String(req.query?.action || '') === 'user-management') {
    return handleUserManagement(req, res);
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const authHeader = String(req.headers?.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sessão do Motyq não encontrada.' });

    const firebaseUser = await verifyFirebaseToken(token);
    if (!firebaseUser?.email) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'A inteligência do Motyq ainda não está configurada no servidor.' });

    const data = req.body?.data || {};
    const results = req.body?.results || {};
    const vehicleInfo = data.licensePlate ? `Veículo Placa: ${data.licensePlate}` : 'Veículo sem placa informada';

    let stockAlert = '';
    const days = Number(data.stockDays) || 0;
    if (days >= 120) stockAlert = `CRÍTICO: Veículo "SUPER VELHO" (${days} dias). Prioridade TOTAL é LIQUIDEZ. Aceite qualquer proposta que não dê prejuízo absurdo.`;
    else if (days >= 90) stockAlert = `ALERTA VERMELHO: Veículo "VELHO" (${days} dias). Margem é secundária, o foco é girar o estoque urgentemente.`;
    else if (days >= 61) stockAlert = `ATENÇÃO: Veículo "ENVELHECIDO" (${days} dias). Comece a flexibilizar a negociação para evitar que vire um carro de 90 dias.`;
    else if (days >= 31) stockAlert = `ALERTA AMARELO: Veículo "MÉDIO" (${days} dias). Monitore. Ainda saudável, mas não deixe a venda esfriar por detalhes pequenos.`;
    else stockAlert = `Estoque Saudável (Recente): ${days} dias. Busque a margem cheia e maximize o lucro.`;

    const prompt = `
Atue como um Gerente Financeiro de Concessionária Volkswagen Sênior. Analise os dados desta venda de veículo (${vehicleInfo}) e forneça um parecer curto e estratégico (máximo 3 parágrafos).

CONTEXTO IMPORTANTE: Nesta operação, o "Retorno Bancário" (BV) é considerado parte fundamental da receita (Inside Profit). É comum que o Lucro Operacional do carro seja baixo ou negativo, sendo compensado pelo ganho financeiro.

CONTEXTO DE ESTOQUE: ${stockAlert}

Dados da Negociação:
- Valor da Nota Fiscal: ${money(data.invoiceValue)}
- Custo do Veículo: ${money(data.vehicleCost)}
- Total Recebido (Entrada + Financiamento + Troca): ${money(results.totalPayment)}
- Custos Operacionais (Doc, Acessórios, etc): ${money(results.totalCosts)}

COMPOSIÇÃO DO RESULTADO:
1. Lucro Operacional (Lataria): ${money(results.profit)} (${pct(results.marginPercent)})
2. Retorno Bancário (BV): ${money(data.bankReturn)}

>>> RESULTADO FINAL (INDICADOR CHAVE DE SUCESSO) <<<
- Lucro Líquido Total (Soma): ${money(results.profitWithBank)}
- Margem Total sobre NF: ${pct(results.marginPercentWithBank)}

Diretrizes da Análise:
1. FOCO NA MARGEM TOTAL: Ignore prejuízo operacional se a Margem Total for saudável. O sucesso da venda depende do resultado COM O BANCO.
2. FATOR IDADE DE ESTOQUE: Aja estritamente de acordo com o nível de alerta informado acima.
3. Se a Margem Total estiver abaixo de 4%, alerte risco (exceto se for carro velho de estoque). Entre 4% e 8% é aceitável. Acima de 8% é excelente.
4. Valide se o retorno bancário está ajudando a salvar a operação.

Responda em Português do Brasil. Use Markdown. Seja direto, profissional e focado no resultado final combinado.`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
    return res.status(200).json({ text: response.text || 'Não foi possível gerar a análise no momento.' });
  } catch (error: any) {
    console.error('Motyq analyze-deal error:', error?.message || error);
    return res.status(500).json({ error: 'Não foi possível gerar a análise agora. Tente novamente.' });
  }
}
