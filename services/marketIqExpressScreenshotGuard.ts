/** Prevent evaluating a screenshot of Motyq's own Mesa as if it were
 * the AutoAvaliar source. A misleading screenshot can contain the model
 * already displayed in an input while lacking plate/year/KM altogether.
 *
 * Require at least two independent UI markers to avoid rejecting a genuine
 * AutoAvaliar print merely because a note mentions Motyq.
 */
export function isMotyqInterfaceScreenshot(ocrText:string):boolean{
 const t=String(ocrText||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toUpperCase().replace(/\s+/g,' ').trim();
 if(!t)return false;
 const markers=[
  /\b(?:MOTYQ|M\s*\.?\s*O\s*\.?\s*T\s*\.?\s*Y\s*\.?\s*Q)\b/,
  /\bNOVA PRECIFICACAO\b/,
  /\bPREVIA POR PRINT\b/,
  /\bBUSCAR POR VOZ\b/,
  /\bINTELIGENCIA DE COMPRA\b/,
  /\bCLIQUE AQUI E PRESSIONE CTRL\s*\+?\s*V\b/,
  /\bUSAR DADOS CONFERIDOS NA MESA\b/,
  /\bCOLAR AVALIACAO\b/,
 ];
 return markers.filter(marker=>marker.test(t)).length>=2;
}
