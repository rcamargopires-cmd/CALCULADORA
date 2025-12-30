import React, { useState } from 'react';
import { Lock, User as UserIcon, LogIn, AlertCircle } from 'lucide-react';
import { userService } from '../services/userService';
import { User } from '../types';

interface LoginScreenProps {
  onLogin: (user: User) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const user = userService.authenticate(username, password);
    
    if (user) {
      onLogin(user);
    } else {
      setError('Usuário ou senha inválidos, ou conta inativa.');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-amber-400 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-amber-400/20">
            <Lock className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-2xl font-black text-white uppercase tracking-wide">DealMaster</h1>
          <p className="text-zinc-500 text-sm mt-1">A inteligência por trás de cada venda</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className="bg-red-900/30 border border-red-800 text-red-200 p-3 rounded flex items-center gap-2 text-sm animate-fade-in">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Usuário</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-3 text-zinc-500" size={18} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-amber-400 transition-colors"
                placeholder="Ex: admin"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Senha</label>
            <div className="relative">
            
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-amber-400 transition-colors"
                placeholder="••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-amber-400 hover:bg-amber-500 text-black font-bold py-3 rounded transition-colors flex items-center justify-center gap-2"
          >
            <LogIn size={20} />
            ENTRAR NO SISTEMA
          </button>
        </form>
        
        <div className="mt-6 text-center text-xs text-zinc-600">
          <p>copyright ©:</p>
          <p>Reinaldo Ribas 15 l 98102-2055</p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
