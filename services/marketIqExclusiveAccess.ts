import type {User} from '../types';

export const EVANDRO_IQ_ONLY_EMAIL='evandro.bergara@abraoreze.com.br';

/** UI-safe projection while the authenticated server synchronizes this
 * account's permanent pricingDeskOnly flag. Never elevates a non-manager role. */
export const iqExclusiveUser=(profile:User|null|undefined):User|null=>{
 if(!profile)return null;
 const email=String(profile.email||'').trim().toLowerCase();
 if(email!==EVANDRO_IQ_ONLY_EMAIL||profile.status!=='active'||
    !['manager','pricing'].includes(String(profile.role))||
    (profile.companyId||'abrao-reze')!=='abrao-reze')return profile;
 return {...profile,role:'manager',pricingDeskOnly:true};
};
