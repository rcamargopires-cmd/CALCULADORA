
import React, { useState, useEffect, useMemo } from 'react';
import { Shield, Users, Settings, X, CheckCircle, Plus, Edit2, Trash2, Save, LayoutTemplate, Coins, DollarSign, Calculator, ArrowRight } from 'lucide-react';
import SectionHeader from './SectionHeader';
import { User, UserRole, UserStatus, FieldVisibility, CommissionConfig } from '../types';
import { userService } from '../services/userService';
import { configService } from '../services/configService';
import CurrencyInput from './CurrencyInput';
import NumberInput from './NumberInput';
import { formatCurrency } from '../utils/currency';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onConfigUpdate?: () => void; // Callback para avisar o App que mudou algo
}

const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose, currentUser, onConfigUpdate }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'form' | 'commissions'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Field Config State
  const [fieldConfig, setFieldConfig] = useState<FieldVisibility>(configService.getVisibility());
  
  // Commission Config State
  const [commissionConfig, setCommissionConfig] = useState<CommissionConfig>(configService.getCommission());
  
  // Simulation State for Commission Tab
  const [simulatedProfit, setSimulatedProfit] = useState(2000);

  // Form States (Users)
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    role: 'user' as UserRole,
    status: 'active' as UserStatus
  });

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      setFieldConfig(configService.getVisibility());
      setCommissionConfig(configService.getCommission());
    }
  }, [isOpen]);

  const loadUsers = () => {
    setUsers(userService.getAll());
  };

  const resetForm = () => {
    setFormData({
      name: '',
      username: '',
      password: '',
      role: 'user',
      status: 'active'
    });
    setEditingUser(null);
    setIsEditing(false);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      username: user.username,
      password: user.password || '',
      role: user.role,
      status: user.status
    });
    setIsEditing(true);
  };

  const handleDelete = (id: string) => {
    if (id === currentUser.id) {
      alert("Você não pode excluir seu próprio usuário.");
      return;
    }
    if (window.confirm("Tem certeza que deseja remover este usuário?")) {
      userService.delete(id);
      loadUsers();
    }
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.username || (!editingUser && !formData.password)) {
      alert("Preencha todos os campos obrigatórios.");
      return;
    }

    const newUser: User = {
      id: editingUser ? editingUser.id : Date.now().toString(),
      name: formData.name,
      username: formData.username,
      password: formData.password || (editingUser ? editingUser.password : '123456'), 
      role: formData.role,
      status: formData.status
    };

    userService.save(newUser);
    loadUsers();
    resetForm();
    alert("Usuário salvo com sucesso!");
  };

  const handleToggleField = (field: keyof FieldVisibility) => {
    setFieldConfig(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleSaveConfig = () => {
    configService.saveVisibility(fieldConfig);
    if (onConfigUpdate) onConfigUpdate();
    alert("Configuração do formulário atualizada!");
  };

  const handleSaveCommission = () => {
    configService.saveCommission(commissionConfig);
    if (onConfigUpdate) onConfigUpdate();
    alert("Regras de comissão atualizadas!");
  };

  // Cálculo da simulação em tempo real para o admin visualizar a regra
  const simulatedCommissionValue = useMemo(() => {
    if (!commissionConfig.enabled) return 0;
    if (simulatedProfit < commissionConfig.minProfitThreshold) return 0;
    
    let comm = 0;
    if (commissionConfig.type === 'fixed' || commissionConfig.type === 'mixed') {
      comm += commissionConfig.fixedValue;
    }
    if (commissionConfig.type === 'percent' || commissionConfig.type === 'mixed') {
      comm += (simulatedProfit * commissionConfig.percentage) / 100;
    }
    return comm;
  }, [simulatedProfit, commissionConfig]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-5xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-zinc-800 p-4 flex justify-between items-center border-b border-zinc-700">
          <div className="flex items-center gap-2 text-red-400">
            <Shield size={24} />
            <div>
              <h3 className="font-bold text-lg text-white">Painel Administrativo</h3>
              <p className="text-xs text-zinc-400">Gerenciamento do Sistema</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors bg-zinc-700/50 p-2 rounded-full">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-700 bg-zinc-950 overflow-x-auto">
          <button 
            onClick={() => setActiveTab('users')}
            className={`flex-1 min-w-[150px] py-3 text-sm font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${activeTab === 'users' ? 'bg-zinc-800 text-white border-b-2 border-red-500' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Users size={16} /> Usuários
          </button>
          <button 
             onClick={() => setActiveTab('form')}
             className={`flex-1 min-w-[150px] py-3 text-sm font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${activeTab === 'form' ? 'bg-zinc-800 text-white border-b-2 border-red-500' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <LayoutTemplate size={16} /> Formulário
          </button>
           <button 
             onClick={() => setActiveTab('commissions')}
             className={`flex-1 min-w-[150px] py-3 text-sm font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${activeTab === 'commissions' ? 'bg-zinc-800 text-white border-b-2 border-red-500' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Coins size={16} /> Comissões
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          
          {/* TAB: USERS */}
          {activeTab === 'users' && (
            <>
               {/* Dashboard Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-zinc-950 p-4 rounded border border-zinc-800 flex items-center gap-4">
                    <div className="p-3 bg-blue-900/30 rounded-full text-blue-400"><Users size={24}/></div>
                    <div>
                      <div className="text-2xl font-bold text-white">{users.filter(u => u.status === 'active').length}</div>
                      <div className="text-xs text-zinc-500">Usuários Ativos</div>
                    </div>
                </div>
                {/* ... other stats ... */}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* User List Column */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex justify-between items-center">
                    <SectionHeader title="Usuários Cadastrados" />
                    <button 
                      onClick={resetForm} 
                      className="text-xs font-bold text-blue-400 hover:text-white flex items-center gap-1"
                    >
                      <Plus size={14} /> NOVO USUÁRIO
                    </button>
                  </div>
                  
                  <div className="bg-zinc-950 rounded border border-zinc-800 overflow-hidden">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-zinc-800 text-zinc-400 text-xs uppercase">
                          <th className="p-3">Nome</th>
                          <th className="p-3">Usuário</th>
                          <th className="p-3">Permissão</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {users.map(u => (
                          <tr key={u.id} className="hover:bg-zinc-900 transition-colors">
                            <td className="p-3 text-white font-medium text-sm">{u.name}</td>
                            <td className="p-3 text-zinc-400 font-mono text-xs">{u.username}</td>
                            <td className="p-3">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${u.role === 'admin' ? 'bg-red-900/30 text-red-400' : 'bg-blue-900/30 text-blue-400'}`}>
                                {u.role}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${u.status === 'active' ? 'text-green-400 border border-green-900' : 'text-zinc-500 border border-zinc-800'}`}>
                                {u.status === 'active' ? 'Ativo' : 'Inativo'}
                              </span>
                            </td>
                            <td className="p-3 text-right flex justify-end gap-2">
                              <button 
                                onClick={() => handleEdit(u)}
                                className="p-1.5 hover:bg-zinc-800 rounded text-amber-400" title="Editar">
                                <Edit2 size={14} />
                              </button>
                              <button 
                                onClick={() => handleDelete(u.id)}
                                className="p-1.5 hover:bg-zinc-800 rounded text-red-400" title="Excluir">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Form Column */}
                <div className="lg:col-span-1">
                  <SectionHeader title={isEditing ? "Editar Usuário" : "Novo Usuário"} />
                  <div className="bg-zinc-950 p-6 rounded border border-zinc-800">
                    <form onSubmit={handleSaveUser} className="space-y-4">
                        <div>
                          <label className="text-xs font-bold text-zinc-400 uppercase">Nome Completo</label>
                          <input 
                            type="text" 
                            required
                            className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white mt-1 focus:border-amber-400 focus:outline-none"
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-zinc-400 uppercase">Nome de Usuário (Login)</label>
                          <input 
                            type="text" 
                            required
                            className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white mt-1 focus:border-amber-400 focus:outline-none"
                            value={formData.username}
                            onChange={e => setFormData({...formData, username: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-zinc-400 uppercase">Senha {isEditing && '(Deixe em branco p/ manter)'}</label>
                          <input 
                            type="password" 
                            className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white mt-1 focus:border-amber-400 focus:outline-none"
                            value={formData.password}
                            onChange={e => setFormData({...formData, password: e.target.value})}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-zinc-400 uppercase">Permissão</label>
                            <select 
                              className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white mt-1 focus:border-amber-400 focus:outline-none"
                              value={formData.role}
                              onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                            >
                              <option value="user">Vendedor</option>
                              <option value="admin">Administrador</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-zinc-400 uppercase">Status</label>
                            <select 
                              className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white mt-1 focus:border-amber-400 focus:outline-none"
                              value={formData.status}
                              onChange={e => setFormData({...formData, status: e.target.value as UserStatus})}
                            >
                              <option value="active">Ativo</option>
                              <option value="inactive">Inativo</option>
                            </select>
                          </div>
                        </div>

                        <div className="pt-4 flex gap-2">
                          {isEditing && (
                            <button 
                              type="button" 
                              onClick={resetForm}
                              className="flex-1 px-4 py-2 border border-zinc-700 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                            >
                              Cancelar
                            </button>
                          )}
                          <button 
                            type="submit" 
                            className="flex-1 px-4 py-2 bg-amber-400 hover:bg-amber-500 text-black font-bold rounded transition-colors flex items-center justify-center gap-2"
                          >
                            <Save size={16} />
                            {isEditing ? 'Atualizar' : 'Cadastrar'}
                          </button>
                        </div>
                    </form>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB: FORM CONFIG */}
          {activeTab === 'form' && (
            <div className="max-w-4xl mx-auto">
               <div className="mb-6">
                 <SectionHeader title="Visibilidade de Campos" />
                 <p className="text-zinc-400 text-sm mb-4">
                   Marque os campos que devem aparecer no formulário da calculadora para os vendedores.
                 </p>
               </div>

               <div className="bg-zinc-950 p-6 rounded border border-zinc-800 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  
                  {/* Veículo */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-white border-b border-zinc-800 pb-2">Dados do Veículo</h4>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={fieldConfig.licensePlate}
                        onChange={() => handleToggleField('licensePlate')}
                        className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-amber-400 focus:ring-amber-900 focus:ring-offset-0"
                      />
                      <span className="text-zinc-300 group-hover:text-white transition-colors">Placa</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={fieldConfig.stockDays}
                        onChange={() => handleToggleField('stockDays')}
                        className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-amber-400 focus:ring-amber-900 focus:ring-offset-0"
                      />
                      <span className="text-zinc-300 group-hover:text-white transition-colors">Dias de Estoque</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={fieldConfig.invoiceValue}
                        onChange={() => handleToggleField('invoiceValue')}
                        className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-amber-400 focus:ring-amber-900 focus:ring-offset-0"
                      />
                      <span className="text-zinc-300 group-hover:text-white transition-colors">Valor Nota Fiscal</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={fieldConfig.vehicleCost}
                        onChange={() => handleToggleField('vehicleCost')}
                        className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-amber-400 focus:ring-amber-900 focus:ring-offset-0"
                      />
                      <span className="text-zinc-300 group-hover:text-white transition-colors">Custo do Veículo</span>
                    </label>
                  </div>

                  {/* Pagamento */}
                   <div className="space-y-3">
                    <h4 className="font-bold text-white border-b border-zinc-800 pb-2">Forma de Pagamento</h4>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={fieldConfig.entry}
                        onChange={() => handleToggleField('entry')}
                        className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-amber-400 focus:ring-amber-900 focus:ring-offset-0"
                      />
                      <span className="text-zinc-300 group-hover:text-white transition-colors">Entrada</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={fieldConfig.financing}
                        onChange={() => handleToggleField('financing')}
                        className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-amber-400 focus:ring-amber-900 focus:ring-offset-0"
                      />
                      <span className="text-zinc-300 group-hover:text-white transition-colors">Financiamento</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={fieldConfig.tradeIn}
                        onChange={() => handleToggleField('tradeIn')}
                        className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-amber-400 focus:ring-amber-900 focus:ring-offset-0"
                      />
                      <span className="text-zinc-300 group-hover:text-white transition-colors">Carro na Troca</span>
                    </label>
                  </div>

                  {/* Custos */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-white border-b border-zinc-800 pb-2">Custos Operacionais</h4>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={fieldConfig.documentation}
                        onChange={() => handleToggleField('documentation')}
                        className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-amber-400 focus:ring-amber-900 focus:ring-offset-0"
                      />
                      <span className="text-zinc-300 group-hover:text-white transition-colors">Documentação</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={fieldConfig.accessories}
                        onChange={() => handleToggleField('accessories')}
                        className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-amber-400 focus:ring-amber-900 focus:ring-offset-0"
                      />
                      <span className="text-zinc-300 group-hover:text-white transition-colors">Acessórios</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={fieldConfig.payoff}
                        onChange={() => handleToggleField('payoff')}
                        className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-amber-400 focus:ring-amber-900 focus:ring-offset-0"
                      />
                      <span className="text-zinc-300 group-hover:text-white transition-colors">Quitação (Troca)</span>
                    </label>
                     <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={fieldConfig.debts}
                        onChange={() => handleToggleField('debts')}
                        className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-amber-400 focus:ring-amber-900 focus:ring-offset-0"
                      />
                      <span className="text-zinc-300 group-hover:text-white transition-colors">Débitos (Troca)</span>
                    </label>
                     <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={fieldConfig.others}
                        onChange={() => handleToggleField('others')}
                        className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-amber-400 focus:ring-amber-900 focus:ring-offset-0"
                      />
                      <span className="text-zinc-300 group-hover:text-white transition-colors">Outros / Despachante</span>
                    </label>
                  </div>
               </div>
               
               <div className="mt-6 flex justify-end">
                 <button 
                  onClick={handleSaveConfig}
                  className="px-6 py-3 bg-amber-400 hover:bg-amber-500 text-black font-bold rounded shadow-lg transition-transform active:scale-95 flex items-center gap-2"
                 >
                   <Save size={20} />
                   Salvar Configuração de Campos
                 </button>
               </div>
            </div>
          )}

          {/* TAB: COMMISSIONS */}
          {activeTab === 'commissions' && (
            <div className="max-w-4xl mx-auto">
              <div className="mb-6">
                <SectionHeader title="Regras de Comissão" />
                <p className="text-zinc-400 text-sm mb-4">
                  Defina como a comissão dos vendedores será calculada automaticamente pelo sistema.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Config Left Column */}
                <div className="bg-zinc-950 p-6 rounded border border-zinc-800 space-y-6">
                   
                   {/* Enable Toggle */}
                   <div className="flex items-center justify-between p-4 bg-zinc-900 rounded border border-zinc-800">
                     <div className="flex items-center gap-3">
                       <div className={`p-2 rounded-full ${commissionConfig.enabled ? 'bg-green-900/30 text-green-400' : 'bg-zinc-800 text-zinc-500'}`}>
                         <Coins size={24} />
                       </div>
                       <div>
                         <h4 className="font-bold text-white">Ativar Comissão</h4>
                         <p className="text-xs text-zinc-500">Exibir cálculo para o vendedor</p>
                       </div>
                     </div>
                     <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={commissionConfig.enabled}
                          onChange={(e) => setCommissionConfig({...commissionConfig, enabled: e.target.checked})}
                        />
                        <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                     </label>
                   </div>

                   {/* Configuration Form */}
                   <div className={`space-y-6 transition-opacity ${commissionConfig.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                     
                     <div>
                       <label className="text-xs font-bold text-zinc-400 uppercase mb-2 block">Tipo de Comissão</label>
                       <div className="grid grid-cols-3 gap-2">
                         <button 
                           onClick={() => setCommissionConfig({...commissionConfig, type: 'percent'})}
                           className={`p-3 rounded border flex flex-col items-center gap-1 transition-all ${commissionConfig.type === 'percent' ? 'bg-amber-900/20 border-amber-500 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:border-zinc-500'}`}
                         >
                           <div className="font-bold text-lg">%</div>
                           <span className="text-[10px] font-bold uppercase">Porcentagem</span>
                         </button>
                         <button 
                           onClick={() => setCommissionConfig({...commissionConfig, type: 'fixed'})}
                           className={`p-3 rounded border flex flex-col items-center gap-1 transition-all ${commissionConfig.type === 'fixed' ? 'bg-amber-900/20 border-amber-500 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:border-zinc-500'}`}
                         >
                           <div className="font-bold text-lg">R$</div>
                           <span className="text-[10px] font-bold uppercase">Fixo</span>
                         </button>
                         <button 
                           onClick={() => setCommissionConfig({...commissionConfig, type: 'mixed'})}
                           className={`p-3 rounded border flex flex-col items-center gap-1 transition-all ${commissionConfig.type === 'mixed' ? 'bg-amber-900/20 border-amber-500 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:border-zinc-500'}`}
                         >
                           <div className="font-bold text-lg">%+R$</div>
                           <span className="text-[10px] font-bold uppercase">Misto</span>
                         </button>
                       </div>
                     </div>

                     <div className="space-y-4">
                        {(commissionConfig.type === 'percent' || commissionConfig.type === 'mixed') && (
                          <div>
                            <label className="text-xs font-bold text-zinc-400 uppercase mb-1 block">Porcentagem sobre o Lucro (%)</label>
                            <input 
                              type="number"
                              step="0.1"
                              value={commissionConfig.percentage}
                              onChange={(e) => setCommissionConfig({...commissionConfig, percentage: parseFloat(e.target.value) || 0})}
                              className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white font-mono focus:border-amber-400 focus:outline-none"
                            />
                          </div>
                        )}

                        {(commissionConfig.type === 'fixed' || commissionConfig.type === 'mixed') && (
                          <CurrencyInput 
                            label="Valor Fixo (R$)"
                            value={commissionConfig.fixedValue}
                            onChange={(v) => setCommissionConfig({...commissionConfig, fixedValue: v})}
                          />
                        )}
                     </div>

                     <div className="bg-red-900/10 border border-red-900/30 p-4 rounded">
                       <CurrencyInput 
                          label="Limite Mínimo de Lucro"
                          value={commissionConfig.minProfitThreshold}
                          onChange={(v) => setCommissionConfig({...commissionConfig, minProfitThreshold: v})}
                          className="mb-0"
                          placeholder="R$ 0,00"
                          textColor="text-red-200"
                        />
                        <p className="text-xs text-red-400 mt-2">
                          Se o Lucro Operacional (Lataria) for menor que este valor, a comissão será <strong>ZERO</strong>.
                        </p>
                     </div>
                   </div>
                </div>

                {/* Simulation Right Column */}
                <div className="flex flex-col">
                  <div className="bg-zinc-900 p-6 rounded border border-zinc-700 flex-1 flex flex-col relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-zinc-800 text-zinc-400 text-[10px] font-bold px-2 py-1 rounded-bl border-b border-l border-zinc-700">
                        TESTAR REGRA ATUAL
                      </div>
                      
                      <div className="mb-6">
                        <h4 className="font-bold text-white flex items-center gap-2 mb-4">
                          <Calculator size={18} className="text-amber-400" />
                          Simulador de Resultado
                        </h4>
                        <CurrencyInput 
                          label="Lucro Simulado da Venda"
                          value={simulatedProfit}
                          onChange={setSimulatedProfit}
                        />
                      </div>

                      <div className="flex-1 flex flex-col justify-center items-center gap-2 bg-black/20 rounded p-4 border border-dashed border-zinc-700">
                         <span className="text-xs font-bold text-zinc-500 uppercase">Comissão Gerada</span>
                         
                         {simulatedProfit < commissionConfig.minProfitThreshold ? (
                            <div className="flex flex-col items-center text-red-400 animate-pulse">
                              <span className="text-3xl font-black font-mono">R$ 0,00</span>
                              <span className="text-xs font-bold mt-1 bg-red-900/30 px-2 py-1 rounded">Abaixo do Limite Mínimo</span>
                            </div>
                         ) : (
                            <div className="flex flex-col items-center text-green-400">
                               <span className="text-3xl font-black font-mono">{formatCurrency(simulatedCommissionValue)}</span>
                               {commissionConfig.enabled && (
                                 <span className="text-[10px] text-zinc-500 mt-1">
                                   Baseado na regra {commissionConfig.type === 'fixed' ? 'Fixa' : commissionConfig.type === 'percent' ? 'Percentual' : 'Mista'}
                                 </span>
                               )}
                            </div>
                         )}

                         {!commissionConfig.enabled && (
                           <div className="absolute inset-0 bg-black/80 flex items-center justify-center text-zinc-500 font-bold">
                              COMISSÃO DESATIVADA
                           </div>
                         )}
                      </div>

                      <div className="mt-6 pt-6 border-t border-zinc-800">
                        <button 
                          onClick={handleSaveCommission}
                          className="w-full px-6 py-4 bg-amber-400 hover:bg-amber-500 text-black font-bold rounded shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
                        >
                          <Save size={20} />
                          SALVAR CONFIGURAÇÃO
                        </button>
                      </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
