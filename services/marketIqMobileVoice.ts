/** Motyq IQ Mobile speech feedback.
 * Browser Web Speech is optional; no microphone audio is sent to Motyq by this module.
 * When unavailable, Android keyboard voice dictation can still fill the search input.
 */
export type VoiceFeedback={message:string;useKeyboard:boolean};
export function speechErrorFeedback(error:unknown):VoiceFeedback{
 switch(String(error||'')){
  case 'not-allowed':
  case 'service-not-allowed':
   return {message:'O navegador bloqueou o microfone ou o reconhecimento de voz. No Chrome, confira as permissões do site ou use o microfone do teclado.',useKeyboard:true};
  case 'audio-capture':
   return {message:'O microfone está indisponível ou em uso por outro aplicativo. Confira o acesso ao microfone e tente o teclado.',useKeyboard:true};
  case 'network':
   return {message:'O reconhecimento de voz do navegador falhou na conexão. Você pode usar o microfone do teclado ou digitar.',useKeyboard:true};
  case 'language-not-supported':
   return {message:'O navegador não aceita ditado em português nessa modalidade. Use o microfone do teclado.',useKeyboard:true};
  case 'no-speech':
   return {message:'Não consegui ouvir sua fala. Tente novamente ou use o microfone do teclado.',useKeyboard:true};
  case 'aborted':
   return {message:'Busca por voz interrompida. Tente novamente.',useKeyboard:false};
  default:
   return {message:'Não foi possível reconhecer a fala neste navegador. Tente pelo Chrome ou use o microfone do teclado.',useKeyboard:true};
 }
}
/**
 * Android speech services occasionally transcribe the year in Portuguese words.
 * Normalize unambiguous 2001–2029 years only, without guessing a model or FIPE code.
 */
export function mobileSpokenYear(text:string):string{
 const suffixes:Record<string,number>={
  um:1,dois:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,
  dez:10,onze:11,doze:12,treze:13,quatorze:14,quinze:15,dezesseis:16,
  dezessete:17,dezoito:18,dezenove:19,vinte:20
 };
 const unit='(?:um|dois|tr[eê]s|quatro|cinco|seis|sete|oito|nove)';
 const pattern=new RegExp(
  '\\bdois\\s+mil(?:\\s+e)?\\s+(?:vinte(?:\\s+e)?\\s+'+unit+
  '|vinte|dezenove|dezoito|dezessete|dezesseis|quinze|quatorze|treze|doze|onze|dez|'+unit+')\\b','gi');
 return text.replace(pattern,phrase=>{
  const normalized=phrase.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
   .replace(/^dois\s+mil(?:\s+e)?\s+/,'').replace(/\s+e\s+/g,' ').trim();
  if(normalized.startsWith('vinte ')){
   const unitWord=normalized.slice(6);
   return String(2020+(suffixes[unitWord]||0));
  }
  const yearSuffix=suffixes[normalized];
  return yearSuffix?String(2000+yearSuffix):phrase;
 });
}

/** Merge isolated spoken letters into a Mercosul/old plate without touching model names. */
export function mobileSpeechToSearch(raw:unknown):string{
 const transcript=typeof raw==='string'?mobileSpokenYear(raw.trim().replace(/\s+/g,' ')):'';
 if(!transcript)return '';
 const normalized=transcript.toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalized)){
  const separated=transcript.split(' ');
  // Avoid accidentally converting an ordinary sentence into an apparent plate.
  if(separated.length<=7&&!/\b(?:MODELO|ANO|BUSCAR|CARRO|QUERO|PLACA)\b/i.test(transcript))return normalized;
 }
 return transcript;
}
