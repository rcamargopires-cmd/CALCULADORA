import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { User } from '../types';
import { userService } from '../services/userService';
import OperationalDataPanel from './OperationalDataPanel';
import AIManagerV2 from './AIManagerV2';
import HierarchyPanel from './HierarchyPanel';

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
  const isManager = user.role === 'admin' || user.role === 'manager';

  return <>
    {isManager && <OperationalDataPanel currentUser={user}/>} 
    {isManager && <AIManagerV2/>}
    {user.role === 'admin' && <HierarchyPanel currentUser={user}/>} 
  </>;
};

export default OperationalTools;
