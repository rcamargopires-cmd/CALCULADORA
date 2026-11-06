/**
 * Independent purchase-alignment guardrail.
 * Verified Webmotors and the statistical model remain distinct evidence.
 * A small real-purchase sample may flag an oversized reference, but may not
 * silently replace the Mesa's current pricing formula.
 */
export type AlignmentStatus='no_reference'|'unverified'|'aligned'|'review_required'|'history_capped'|'partial';
export type AlignmentInput={
 verifiedMarketCeiling:number;
 statisticalTarget:number;
 paidCount:number;
 paidMedian:number|null;
 paidAdjustedMedian:number|null;
 incompleteHistory?:boolean;
 historyUnavailable?:boolean;
};
export type AlignmentOutput={
 status:AlignmentStatus;
 reference:number|null;
 suggested:number|null;
 historyAnchor:number|null;
 difference:number|null;
 differencePercent:number|null;
 evidence:'verified_webmotors'|'statistical_model'|'none';
 historyIsFipeAdjusted:boolean;
};
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const money=(n:number)=>Math.round(n*100)/100;

/** Warn above 10%, only with at least two independent purchase records. */
export function alignPurchaseReference(input:AlignmentInput):AlignmentOutput{
 const reference=positive(input.verifiedMarketCeiling)?input.verifiedMarketCeiling:
  positive(input.statisticalTarget)?input.statisticalTarget:null;
 const evidence:AlignmentOutput['evidence']=positive(input.verifiedMarketCeiling)?'verified_webmotors':
  positive(input.statisticalTarget)?'statistical_model':'none';
 const historyIsFipeAdjusted=positive(input.paidAdjustedMedian);
 const historyAnchor=historyIsFipeAdjusted?input.paidAdjustedMedian:
  positive(input.paidMedian)?input.paidMedian:null;
 const enough=(input.paidCount>=2&&!input.historyUnavailable&&!input.incompleteHistory)&&historyAnchor!==null;
 const difference=enough&&reference!==null?money(reference-historyAnchor):null;
 const differencePercent=difference!==null&&historyAnchor!==null?
  money(difference/historyAnchor*100):null;
 const basic={reference,historyAnchor,difference,differencePercent,evidence,historyIsFipeAdjusted};
 if(reference===null)return {...basic,status:'no_reference',suggested:null};
 if(input.historyUnavailable||input.incompleteHistory){
  return {...basic,status:input.historyUnavailable?'unverified':'partial',suggested:null};
 }
 // An unusually high market/model reference is not a safe offer when even
 // a small, correctly matched paid sample points materially lower.
 if(enough&&differencePercent!==null&&differencePercent>10){
  if(input.paidCount<3)return {...basic,status:'review_required',suggested:null};
  return {...basic,status:'history_capped',suggested:money(Math.min(reference,historyAnchor!))};
 }
 // Sample size of 3+ qualifies for a conservative ceiling, but does
 // not raise the market reference if the historical values are higher.
 if(input.paidCount>=3&&historyAnchor!==null)
  return {...basic,status:'history_capped',suggested:money(Math.min(reference,historyAnchor))};
 return {...basic,status:input.paidCount>=2?'aligned':'unverified',suggested:reference};
}
