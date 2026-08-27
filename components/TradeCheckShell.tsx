import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { User } from '../types';
import { userService } from '../services/userService';
import TradeCheckPanel from './TradeCheckPanel';

const sellerRoles = new Set(['seller', 'user']);

const TradeCheckShell: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => onAuthStateChanged(auth, async firebaseUser => {
    if (!firebaseUser?.email) {
      setUser(null);
      return;
    }
    try {
      const profile = await userService.getUser(firebaseUser.email);
      if (profile?.status === 'active' && sellerRoles.has(String(profile.role))) setUser(profile);
      else setUser(null);
    } catch {
      setUser(null);
    }
  }), []);

  if (!user) return null;
  return <TradeCheckPanel currentUser={user}/>;
};

export default TradeCheckShell;
