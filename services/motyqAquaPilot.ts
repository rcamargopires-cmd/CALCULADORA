/** Motyq AQUA v0: private, single-browser testing sandbox.
 * NOT a public auction or authenticated multi-user bidding backend.
 * Never store or expose vehicle plate, client info, internal valuation or FIPE in an AQUA lot.
 */
export type AquaMode='open'|'sealed';
export type AquaLotState='open'|'reserved'|'closed'|'cancelled';
export type AquaBuyNowRequest={id:string;buyerId:string;buyerShop:string;amount:number;requestedAt:string;status:'pending'|'approved'|'rejected';resolvedAt?:string;source:'simulation'};
export type AquaLotVehicle={brand:string;model:string;year:string;km:string;vehicleType:'car'|'motorcycle';notes:string};
export type AquaBid={id:string;buyerId:string;buyerShop:string;amount:number;createdAt:string;source:'simulation'};
export type AquaLot={
 id:string;vehicle:AquaLotVehicle;mode:AquaMode;state:AquaLotState;
 visibleBuyerIds:string[];createdAt:string;endsAt:string;minimumIncrement:number;
 bids:AquaBid[];version:number;closedAt?:string;buyNowPrice?:number;buyNowRequest?:AquaBuyNowRequest;cloudLotId?:string;
};
const id=()=>typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID():
 Math.random().toString(36).slice(2)+Date.now().toString(36);
export const aquaStorageKey=(scope:string)=>'motyq-aqua-preview-v1-'+encodeURIComponent(scope.trim().toLowerCase());
export const publicAquaVehicle=(v:Omit<AquaLotVehicle,'notes'>,notes=''):AquaLotVehicle=>({
 brand:String(v.brand||'').trim().slice(0,80),
 model:String(v.model||'').trim().slice(0,140),
 year:String(v.year||'').trim().slice(0,32),
 km:String(v.km||'').trim().slice(0,16),
 vehicleType:v.vehicleType==='motorcycle'?'motorcycle':'car',
 notes:String(notes||'').trim().slice(0,500)
});
export function createAquaLot(input:{vehicle:AquaLotVehicle;mode:AquaMode;endsAt:string;visibleBuyerIds:string[];minimumIncrement?:number;buyNowPrice?:number},now=new Date().toISOString()):AquaLot{
 if(!input.vehicle.brand||!input.vehicle.model||!input.vehicle.year)throw Error('Informe marca, modelo e ano.');
 const end=Date.parse(input.endsAt);
 if(!Number.isFinite(end)||end<=Date.parse(now)||end>Date.parse(now)+30*86400000)
  throw Error('Defina um encerramento futuro, dentro de 30 dias.');
 const invited=[...new Set(input.visibleBuyerIds.filter(Boolean))];
 if(!invited.length||invited.length>250)throw Error('Selecione pelo menos um lojista autorizado.');
 if(input.mode!=='open'&&input.mode!=='sealed')throw Error('Modo inválido.');
 const buyNowPrice=input.buyNowPrice;
 if(buyNowPrice!==undefined&&(!Number.isSafeInteger(buyNowPrice)||buyNowPrice<1000||buyNowPrice>10000000))
  throw Error('Valor de arremate inválido.');
 const increment=input.minimumIncrement??500;
 if(!Number.isFinite(increment)||increment<100||increment>100000)throw Error('Incremento inválido.');
 return {id:id(),vehicle:publicAquaVehicle(input.vehicle,input.vehicle.notes),mode:input.mode,
  state:'open',visibleBuyerIds:invited,createdAt:now,endsAt:new Date(end).toISOString(),
  minimumIncrement:increment,buyNowPrice,bids:[],version:1};
}
export function highestAquaBid(lot:AquaLot):AquaBid|null{
 return [...lot.bids].sort((a,b)=>b.amount-a.amount||a.createdAt.localeCompare(b.createdAt))[0]||null;
}
export function visibleAquaBidSummary(lot:AquaLot,buyerId:string){
 if(!lot.visibleBuyerIds.includes(buyerId))return null;
 const own=lot.bids.filter(b=>b.buyerId===buyerId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 // Never disclose amounts or identities of competitors when offers are sealed.
 return lot.mode==='sealed'?{mode:lot.mode,ownBids:own,highest:null,bidCount:null}:
  {mode:lot.mode,ownBids:own,highest:highestAquaBid(lot)?.amount??null,bidCount:lot.bids.length};
}
export function simulateAquaBid(lot:AquaLot,buyer:{id:string;shop:string},amount:number,now=new Date().toISOString()):AquaLot{
 if(lot.state!=='open'||Date.parse(now)>=Date.parse(lot.endsAt))throw Error('Rodada encerrada ou reservada.');
 if(!lot.visibleBuyerIds.includes(buyer.id))throw Error('Lojista não convidado.');
 if(!buyer.shop.trim())throw Error('Lojista inválido.');
 if(!Number.isSafeInteger(amount)||amount<1000||amount>10000000)throw Error('Lance inválido.');
 const current=highestAquaBid(lot)?.amount??0;
 if(lot.mode==='open'&&current>0&&amount<current+lot.minimumIncrement)
  throw Error('Lance inferior ao incremento mínimo da disputa.');
 // Sealed proposals may be lower than other proposals without disclosing them.
 return {...lot,version:lot.version+1,bids:[...lot.bids,
  {id:id(),buyerId:buyer.id,buyerShop:buyer.shop,amount,createdAt:now,source:'simulation'}]};
}
/** A buy-now request is only a reservation in this local laboratory, NOT a sale. */
export function requestAquaBuyNow(lot:AquaLot,buyer:{id:string;shop:string},now=new Date().toISOString()):AquaLot{
 if(lot.state!=='open'||Date.parse(now)>=Date.parse(lot.endsAt))throw Error('Oportunidade encerrada ou reservada.');
 if(!lot.visibleBuyerIds.includes(buyer.id)||!buyer.shop.trim())throw Error('Lojista não autorizado.');
 if(!lot.buyNowPrice||!Number.isSafeInteger(lot.buyNowPrice))throw Error('Arremate imediato indisponível.');
 if(lot.buyNowRequest?.status==='pending'||lot.buyNowRequest?.status==='approved')throw Error('O veículo já tem solicitação de arremate.');
 return {...lot,state:'reserved',version:lot.version+1,buyNowRequest:{
  id:id(),buyerId:buyer.id,buyerShop:buyer.shop,amount:lot.buyNowPrice,
  requestedAt:now,status:'pending',source:'simulation'
 }};
}
/** Only a Mesa operator resolves the request in the test; approval closes the round.
 * Rejection reopens only if the previously configured deadline has not elapsed.
 */
export function resolveAquaBuyNow(lot:AquaLot,decision:'approved'|'rejected',now=new Date().toISOString()):AquaLot{
 if(lot.state!=='reserved'||lot.buyNowRequest?.status!=='pending')throw Error('Nenhuma solicitação pendente.');
 if(decision!=='approved'&&decision!=='rejected')throw Error('Decisão inválida.');
 return {...lot,version:lot.version+1,buyNowRequest:{...lot.buyNowRequest,status:decision,resolvedAt:now},
  state:decision==='approved'||Date.parse(now)>=Date.parse(lot.endsAt)?'closed':'open',
  closedAt:decision==='approved'||Date.parse(now)>=Date.parse(lot.endsAt)?now:undefined};
}
export function closeAquaLot(lot:AquaLot,now=new Date().toISOString()):AquaLot{
 if(lot.state!=='open')throw Error('Rodada já encerrada.');
 return {...lot,state:'closed',closedAt:now,version:lot.version+1};
}
export function cancelAquaLot(lot:AquaLot):AquaLot{
 if(lot.state!=='open')throw Error('Rodada já encerrada.');
 return {...lot,state:'cancelled',version:lot.version+1};
}
export function loadAquaLots(scope:string):AquaLot[]{
 try{const stored=JSON.parse(localStorage.getItem(aquaStorageKey(scope))||'[]');
  return Array.isArray(stored)?stored.filter(l=>l&&typeof l.id==='string'&&Array.isArray(l.bids)&&Array.isArray(l.visibleBuyerIds)).slice(0,100):[];
 }catch{return [];}
}
export function saveAquaLots(scope:string,lots:AquaLot[]):void{
 if(lots.length>100)throw Error('Limite de 100 rodadas de teste.');
 localStorage.setItem(aquaStorageKey(scope),JSON.stringify(lots));
}
