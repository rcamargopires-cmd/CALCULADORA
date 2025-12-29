import { User } from '../types';

const USERS_STORAGE_KEY = 'app_users';

const DEFAULT_USERS: User[] = [
  {
    id: '1',
    name: 'Administrador',
    username: 'admin',
    password: '123', // Senha padrão simples
    role: 'admin',
    status: 'active'
  },
  {
    id: '2',
    name: 'Vendedor Padrão',
    username: 'vendedor',
    password: '123',
    role: 'user',
    status: 'active'
  }
];

export const userService = {
  // Inicializa o banco de usuários se estiver vazio
  initialize: () => {
    const stored = localStorage.getItem(USERS_STORAGE_KEY);
    if (!stored) {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
    }
  },

  // Busca todos os usuários
  getAll: (): User[] => {
    const stored = localStorage.getItem(USERS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  },

  // Salva ou Atualiza usuário
  save: (user: User) => {
    const users = userService.getAll();
    const existingIndex = users.findIndex(u => u.id === user.id);

    if (existingIndex >= 0) {
      // Atualizar
      users[existingIndex] = user;
    } else {
      // Criar novo
      users.push(user);
    }
    
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  },

  // Remove usuário
  delete: (id: string) => {
    const users = userService.getAll();
    const filtered = users.filter(u => u.id !== id);
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(filtered));
  },

  // Autenticação
  authenticate: (username: string, password: string): User | null => {
    const users = userService.getAll();
    // Busca usuário ativo que combine username e password
    const user = users.find(u => 
      u.username.toLowerCase() === username.toLowerCase() && 
      u.password === password &&
      u.status === 'active'
    );
    return user || null;
  }
};