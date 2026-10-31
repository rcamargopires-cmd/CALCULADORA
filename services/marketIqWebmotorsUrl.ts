/** URLs de pesquisas públicas da Webmotors. Não realiza coleta de anúncios. */
export type WebmotorsFilters = { brand: string; model: string; year: number; state?: string; versionSlug?: string };

const slug = (value: string) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

/** Retorna uma busca por marca/modelo/ano. A versão só entra com slug confirmado. */
export const buildWebmotorsSearchUrl = ({brand,model,year,state='sp',versionSlug}:WebmotorsFilters):string => {
  if (!Number.isInteger(year)||year<1990||year>2100) return '';
  const make = slug(brand.replace(/^gm\s+-?\s*/i,'').replace(/^vw\s+-?\s*/i,''));
  const fullModel = slug(model);
  const modelPart = fullModel.split('-').filter(Boolean)[0] || '';
  const uf = slug(state);
  if (!make || !modelPart || !/^[a-z]{2}$/.test(uf)) return '';
  const version = versionSlug && /^[a-z0-9-]+$/.test(versionSlug) ? '/'+versionSlug : '';
  const url = new URL('https://www.webmotors.com.br/carros/'+uf+'/'+make+'/'+modelPart+version+'/de.'+year+'/ate.'+year);
  url.searchParams.set('tipoveiculo','carros');
  url.searchParams.set('marca1',make);
  url.searchParams.set('modelo1',modelPart);
  url.searchParams.set('anode',String(year));
  url.searchParams.set('anoate',String(year));
  url.searchParams.set('page','1');
  // O parametro de ordenacao depende do portal e nao deve ser assumido como preco ascendente.
  return url.toString();
};

/** Restringe a URL a buscas oficiais, prevenindo acesso a enderecos externos. */
export const validateWebmotorsSearchUrl = (value:string):{valid:boolean;url:string;reason:string} => {
  try {
    const candidate = new URL(String(value || '').trim());
    const validHost = candidate.hostname==='webmotors.com.br'||candidate.hostname==='www.webmotors.com.br';
    if (candidate.protocol!=='https:'||!validHost||candidate.port||candidate.username||candidate.password)
      return {valid:false,url:'',reason:'Use somente um link HTTPS oficial da Webmotors.'};
    const path = candidate.pathname.toLowerCase();
    if (!/^\/(?:carros|carros-usados)\/[a-z]{2}\/[a-z0-9-]+\/[a-z0-9-]+(?:\/[a-z0-9-]+)?(?:\/de\.\d{4}(?:\/ate\.\d{4})?|\/ate\.\d{4})?\/?$/.test(path))
      return {valid:false,url:'',reason:'A URL precisa ser uma pesquisa por marca e modelo na Webmotors.'};
    return {valid:true,url:candidate.toString(),reason:''};
  } catch {
    return {valid:false,url:'',reason:'A URL informada nao e valida.'};
  }
};
