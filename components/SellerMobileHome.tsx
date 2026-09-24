import React from 'react';
import { House } from 'lucide-react';

/**
 * Persistent mobile escape hatch. The MOTYQ shell currently hosts independent
 * module overlays; a clean same-origin reload resets those overlays and
 * returns to App's default dashboard without calling Firebase signOut().
 */
const SellerMobileHome:React.FC=()=> {
  const goHome=()=>{
    // Returning from a module must not accidentally preserve a shared catalog hash.
    window.location.assign(window.location.pathname + window.location.search);
  };
  return <button type="button" onClick={goHome} title="Voltar ao início do MOTYQ"
    aria-label="Voltar ao início do MOTYQ"
    className="motyq-mobile-home fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-3 z-[990] flex min-h-12 items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-3 text-xs font-bold text-emerald-800 shadow-xl sm:hidden">
    <House size={17}/> INÍCIO
  </button>;
};
export default SellerMobileHome;
