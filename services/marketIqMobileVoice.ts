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
/** Merge isolated spoken letters into a Mercosul/old plate without touching model names. */
export function mobileSpeechToSearch(raw:unknown):string{
 const transcript=typeof raw==='string'?raw.trim().replace(/\s+/g,' '):'';
 if(!transcript)return '';
 const normalized=transcript.toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalized)){
  const separated=transcript.split(' ');
  // Avoid accidentally converting an ordinary sentence into an apparent plate.
  if(separated.length<=7&&!/\b(?:MODELO|ANO|BUSCAR|CARRO|QUERO|PLACA)\b/i.test(transcript))return normalized;
 }
 return transcript;
}
