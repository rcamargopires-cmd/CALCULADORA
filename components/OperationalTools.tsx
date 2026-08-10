import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { User } from '../types';
import { userService } from '../services/userService';
import OperationalDataPanel from './OperationalDataPanel';
import AIManagerV2 from './AIManagerV2';

const OperationalTools: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => onAuthStateChanged(auth, async firebaseUser => {
    if (!firebaseUser?.email) { setUser(null); return; }
    try {
      const profile = await userService.getUser(firebaseUser.email);
      setUser(profile?.status === 'active' ? profile : null);
    } catch {
      setUser(null);
    }
  }), []);

  if (!user) return null;
  return <>
    <OperationalDataPanel currentUser={user}/>
    <AIManagerV2/>
  </>;
};

export default OperationalTools;
