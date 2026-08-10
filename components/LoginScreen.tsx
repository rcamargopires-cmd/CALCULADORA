import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

type Mode = 'login' | 'first-access';

const friendlyError = (code?: string) => {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou senha incorretos.';
    case 'auth/email-already-in-use':
      return 'Este e-mail já possui senha cadastrada. Use Entrar ou Esqueci minha senha.';
    case 'auth/weak-password':
      return 'Crie uma senha com pelo menos 6 caracteres.';
    case 'auth/invalid-email':
      return 'Digite um e-mail válido.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
    case 'auth/operation-not-allowed':
      return 'Login por e-mail ainda não foi habilitado no Firebase.';
    case 'auth/popup-closed-by-user':
      return 'Login com Google cancelado.';
    default:
      return 'Não foi possível concluir o acesso. Tente novamente.';
  }
};

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const resetFeedback = () => {
    setError('');
    setMessage('');
  };

  const handleEmailLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    resetFeedback();
    if (!email.trim() || !password) {
      setError('Informe seu e-mail e senha.');
      return;
    }
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      onLoginSuccess();
    } catch (err: any) {
      setError(friendlyError(err?.code));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFirstAccess = async (event: React.FormEvent) => {
    event.preventDefault();
    resetFeedback();
    if (!email.trim() || !password) {
      setError('Informe o e-mail cadastrado e crie uma senha.');
      return;
    }
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não são iguais.');
      return;
    }
    setIsLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      // App.tsx valida em seguida se o e-mail está autorizado na coleção users.
      // Quem não estiver previamente cadastrado é automaticamente desconectado.
      onLoginSuccess();
    } catch (err: any) {
      setError(friendlyError(err?.code));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    resetFeedback();
    if (!email.trim()) {
      setError('Digite seu e-mail acima para receber a recuperação de senha.');
      return;
    }
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      setMessage('Se o e-mail estiver cadastrado, você receberá as instruções para criar uma nova senha.');
    } catch (err: any) {
      setError(friendlyError(err?.code));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    resetFeedback();
    setIsLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onLoginSuccess();
    } catch (err: any) {
      setError(friendlyError(err?.code));
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (next: Mode) => {
    resetFeedback();
    setMode(next);
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md overflow-hidden rounded-[32px] border border-white/10 bg-zinc-900 shadow-2xl">
        <div className="p-7 md:p-8">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 grid h-16 w-16 place-items-center rounded-[22px] bg-white text-black shadow-xl">
              <Lock className="h-7 w-7" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">DealMaster</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              {mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua senha'}
            </h1>
            <p className="mt-2 max-w-xs text-sm leading-5 text-zinc-500">
              {mode === 'login'
                ? 'Entre com o e-mail cadastrado pela sua empresa.'
                : 'Use exatamente o e-mail que o administrador cadastrou no DealMaster.'}
            </p>
          </div>

          {(error || message) && (
            <div className={`mb-5 flex items-start gap-2 rounded-2xl border p-3 text-sm ${error ? 'border-red-500/20 bg-red-500/10 text-red-200' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'}`}>
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error || message}</span>
            </div>
          )}

          <form onSubmit={mode === 'login' ? handleEmailLogin : handleFirstAccess} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold text-zinc-500">E-mail</label>
              <div className="relative">
                <Mail size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="voce@empresa.com.br"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-black/20 pl-11 pr-4 text-sm text-white outline-none transition focus:border-white/25"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-zinc-500">
                {mode === 'login' ? 'Senha' : 'Crie uma senha'}
              </label>
              <div className="relative">
                <Lock size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-black/20 pl-11 pr-12 text-sm text-white outline-none transition focus:border-white/25"
                />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300" aria-label="Mostrar ou ocultar senha">
                  {showPassword ? <EyeOff size={17}/> : <Eye size={17}/>} 
                </button>
              </div>
            </div>

            {mode === 'first-access' && (
              <div>
                <label className="mb-2 block text-xs font-semibold text-zinc-500">Repita a senha</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-white/25"
                />
              </div>
            )}

            {mode === 'login' && (
              <div className="flex justify-end">
                <button type="button" onClick={handlePasswordReset} disabled={isLoading} className="text-xs font-medium text-zinc-500 hover:text-white disabled:opacity-50">
                  Esqueci minha senha
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="h-12 w-full rounded-2xl bg-white text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-50"
            >
              {isLoading ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar senha e entrar'}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3"><div className="h-px flex-1 bg-white/10"/><span className="text-[10px] uppercase tracking-[0.14em] text-zinc-700">ou</span><div className="h-px flex-1 bg-white/10"/></div>

          <button onClick={handleGoogleLogin} disabled={isLoading} className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50">
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuar com Google
          </button>

          <div className="mt-6 rounded-2xl bg-black/20 p-4 text-center">
            {mode === 'login' ? (
              <p className="text-xs text-zinc-500">Primeira vez aqui? <button onClick={() => switchMode('first-access')} className="font-semibold text-white hover:underline">Criar minha senha</button></p>
            ) : (
              <p className="text-xs text-zinc-500">Já criou a senha? <button onClick={() => switchMode('login')} className="font-semibold text-white hover:underline">Voltar para entrar</button></p>
            )}
          </div>
        </div>

        <div className="border-t border-white/10 bg-black/20 px-7 py-4 text-center text-[11px] leading-5 text-zinc-600">
          O acesso continua restrito aos usuários cadastrados pelo administrador do DealMaster.
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
