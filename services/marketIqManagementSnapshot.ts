/** Only aggregated, de-identified October 2026 management indicators.
 * Detailed evaluation rows are never committed: import them privately in browser.
 */
export const OCT2026_SNAPSHOT = {
  title:'Outubro de 2026',
  period:'2026-10',
  origin:'AutoAvaliar · exportação 01–29/10/2026',
  evaluations:2252,purchaseCount:223,quoteCount:1901,totalPaid:16302193,
  preparation:426200,medianPaid:71500,medianPaidFipe:0.7703467582091992,
  missingWeb:56,noPreparation:43,
  status:[
    {name:'COMPRA',value:223},{name:'COTACAO',value:1901},
    {name:'REPASSE PENDENTE',value:87},{name:'REVISAR',value:1},{name:'OUTROS',value:40}
  ],
  units:[
    {name:'ABRAO REZE - VW',evaluations:282,purchases:27,quotes:246,totalPaid:1511400},
    {name:'CVR CHERY - SOROCABA',evaluations:170,purchases:25,quotes:142,totalPaid:1986000},
    {name:'ABRAO AV SAO PAULO',evaluations:170,purchases:22,quotes:138,totalPaid:1544898},
    {name:'OMODA - COBEL',evaluations:274,purchases:19,quotes:241,totalPaid:1576900},
    {name:'ABRAO REZE - HMB',evaluations:206,purchases:18,quotes:185,totalPaid:959500},
    {name:'VW Tatuí',evaluations:120,purchases:15,quotes:96,totalPaid:1034000},
    {name:'AR DVU',evaluations:150,purchases:14,quotes:122,totalPaid:1032165},
    {name:'Cobel Novos',evaluations:117,purchases:13,quotes:0,totalPaid:730000},
    {name:'OMODA ITU',evaluations:138,purchases:13,quotes:0,totalPaid:1259830},
    {name:'VW Itapetininga',evaluations:73,purchases:12,quotes:0,totalPaid:862000},
    {name:'ABRAO REZE REPASSE',evaluations:100,purchases:12,quotes:0,totalPaid:742000},
    {name:'COBEL JETOUR SOROCABA',evaluations:115,purchases:7,quotes:0,totalPaid:917000}
  ],
  brands:[
    {name:'VOLKSWAGEN',count:60,value:4508965},
    {name:'HYUNDAI',count:43,value:2644300},
    {name:'CHEVROLET',count:20,value:1036000},
    {name:'FIAT',count:19,value:1274040},
    {name:'JEEP',count:11,value:941500},
    {name:'CHERY',count:11,value:1166990},
    {name:'TOYOTA',count:11,value:938000},
    {name:'NISSAN',count:9,value:718768},
    {name:'HONDA',count:8,value:512000},
    {name:'RENAULT',count:5,value:232300}
  ],
  models:[
    {name:'HYUNDAI HB20',count:19,value:853000},
    {name:'HYUNDAI CRETA',count:15,value:1220500},
    {name:'VOLKSWAGEN T-CROSS',count:13,value:1164100},
    {name:'CHEVROLET ONIX',count:13,value:639500},
    {name:'VOLKSWAGEN POLO',count:11,value:723100},
    {name:'VOLKSWAGEN NIVUS',count:10,value:894600},
    {name:'HYUNDAI HB20S',count:7,value:396800},
    {name:'FIAT TORO',count:6,value:569440},
    {name:'VOLKSWAGEN VIRTUS',count:6,value:550000},
    {name:'NISSAN KICKS',count:5,value:384168}
  ],
  destinations:[
    {name:'SHOWROOM',count:119,medianFipe:.8102},
    {name:'REPASSE',count:99,medianFipe:.7083},
    {name:'NÃO INFORMADO',count:5,medianFipe:0}
  ],
  classes:[
    {name:'A',count:22,medianFipe:.8246},
    {name:'B',count:72,medianFipe:.8041},
    {name:'C',count:72,medianFipe:.7497},
    {name:'D',count:42,medianFipe:.7034},
    {name:'E',count:8,medianFipe:.6449},
    {name:'NÃO INFORMADA',count:7,medianFipe:0}
  ],
  dates:[
    {caption:'01/10',purchases:3,quotes:39},{caption:'02/10',purchases:6,quotes:42},
    {caption:'03/10',purchases:7,quotes:93},{caption:'05/10',purchases:6,quotes:75},
    {caption:'06/10',purchases:11,quotes:54},{caption:'07/10',purchases:11,quotes:60},
    {caption:'08/10',purchases:7,quotes:56},{caption:'09/10',purchases:9,quotes:82},
    {caption:'10/10',purchases:10,quotes:89},{caption:'13/10',purchases:9,quotes:79},
    {caption:'14/10',purchases:18,quotes:83},{caption:'15/10',purchases:14,quotes:75},
    {caption:'16/10',purchases:10,quotes:86},{caption:'17/10',purchases:11,quotes:130},
    {caption:'19/10',purchases:8,quotes:70},{caption:'20/10',purchases:13,quotes:91},
    {caption:'21/10',purchases:7,quotes:84},{caption:'22/10',purchases:11,quotes:79},
    {caption:'23/10',purchases:9,quotes:92},{caption:'24/10',purchases:19,quotes:129},
    {caption:'26/10',purchases:11,quotes:58},{caption:'27/10',purchases:7,quotes:88},
    {caption:'28/10',purchases:4,quotes:103},{caption:'29/10',purchases:2,quotes:64}
  ]
} as const;
