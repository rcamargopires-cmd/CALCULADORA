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

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const pct = (value: number) => `${(Number(value) || 0).toFixed(2).replace('.', ',')}%`;

const OWNER_ADMIN = 'r.camargo.pires@gmail.com';
const MANAGER_ALLOWED_ROLES = new Set(['manager','seller','user','reception','evaluator']);
const emailOf=(value:any)=>String(value||'').trim().toLowerCase();
const companyOf=(value:any)=>String(value?.companyId||'abrao-reze').trim()||'abrao-reze';
const roleOf=(value:any)=>String(value?.role||'').trim();
const cleanManagedUser=(raw:any)=>({
  id:emailOf(raw?.email||raw?.id),
  email:emailOf(raw?.email||raw?.id),
  name:String(raw?.name||'').trim(),
  role:String(raw?.role||'seller').trim(),
  status:raw?.status==='inactive'?'inactive':'active',
  createdAt:String(raw?.createdAt||new Date().toISOString()),
  companyId:String(raw?.companyId||'abrao-reze').trim()||'abrao-reze',
  storeId:String(raw?.storeId||'').trim(),
  ...(raw?.goals?{goals:raw.goals}:{}),
  ...(raw?.companyPlan?{companyPlan:raw.companyPlan}:{}),
  ...(raw?.companyStatus?{companyStatus:raw.companyStatus}:{}),
  ...(raw?.companyModuleOverrides?{companyModuleOverrides:raw.companyModuleOverrides}:{}),
});

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
        if(existing){
          if(companyOf(existing)!==companyId)return res.status(403).json({error:'cross_company_forbidden'});
          if(!MANAGER_ALLOWED_ROLES.has(roleOf(existing)))return res.status(403).json({error:'protected_user'});
        }
      }
      const saved=await motyqFirestore.patch('users',input.email,input);
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
    return res.status(200).json({ok:true});
  }catch(error:any){
    const status=Number(error?.status)||500;
    console.error('User management failed',error?.message||error);
    return res.status(status).json({error:String(error?.message||'user_management_failed')});
  }
};

export default async function handler(req: any, res: any) {
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
