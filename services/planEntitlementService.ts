import { Company, CompanyPlan, DealMasterModule, User } from '../types';
import { DEFAULT_COMPANY, DEFAULT_COMPANY_ID } from './companyService';

export type ModuleDefinition = {
  id: DealMasterModule;
  label: string;
  shortLabel: string;
  description: string;
  minimumPlan: CompanyPlan;
};

export const PLAN_META: Record<CompanyPlan, { label: string; price: number; description: string }> = {
  starter: { label: 'Starter', price: 497, description: 'Núcleo comercial completo para uma operação.' },
  pro: { label: 'Pro', price: 897, description: 'Automação, IA, alertas e AssetGuard para acelerar a gestão.' },
  enterprise: { label: 'Enterprise', price: 1497, description: 'Gestão de grupo, multi-store e integrações avançadas.' },
};

export const MODULES: ModuleDefinition[] = [
  { id: 'dealGuard', label: 'DealGuard', shortLabel: 'DealGuard', description: 'Proteção de margem antes do fechamento.', minimumPlan: 'starter' },
  { id: 'goalTrack', label: 'GoalTrack', shortLabel: 'Metas', description: 'Meta, ritmo, projeção e gap de vendas.', minimumPlan: 'starter' },
  { id: 'myPerformance', label: 'My Performance', shortLabel: 'Vendedor', description: 'Painel privado de desempenho do vendedor.', minimumPlan: 'starter' },
  { id: 'commandCenter', label: 'Command Center', shortLabel: 'Command Center', description: 'Visão executiva diária da operação.', minimumPlan: 'starter' },
  { id: 'stockIntelligence', label: 'Stock Intelligence', shortLabel: 'Estoque', description: 'Capital, aging e faixas críticas de estoque.', minimumPlan: 'starter' },
  { id: 'trends', label: 'Histórico & Tendências', shortLabel: 'Trends', description: 'Evolução de vendas, captura, margem e estoque.', minimumPlan: 'starter' },
  { id: 'smartAlerts', label: 'Smart Alerts', shortLabel: 'Alerts', description: 'Alertas automáticos de mudanças e riscos operacionais.', minimumPlan: 'pro' },
  { id: 'executiveInsights', label: 'Executive Insights', shortLabel: 'Insights', description: 'Leitura executiva pronta para reunião e gestão.', minimumPlan: 'pro' },
  { id: 'aiManager', label: 'Motyq AI', shortLabel: 'AI', description: 'Diagnóstico e briefing executivo assistido por IA.', minimumPlan: 'pro' },
  { id: 'assetGuard', label: 'AssetGuard', shortLabel: 'AssetGuard', description: 'Custódia, logística, alertas e SLA de manuais e chaves.', minimumPlan: 'pro' },
  { id: 'multiStore', label: 'Multi-Store', shortLabel: 'Multi-Store', description: 'Gestão de múltiplas unidades do mesmo grupo.', minimumPlan: 'enterprise' },
  { id: 'groupOverview', label: 'Group Command Center', shortLabel: 'Grupo', description: 'Visão consolidada de lojas e grupo.', minimumPlan: 'enterprise' },
  { id: 'dmsConnect', label: 'DMS Connect', shortLabel: 'DMS', description: 'Camada de integração com DealerNet, NBS e outros DMS.', minimumPlan: 'enterprise' },
];

const planWeight: Record<CompanyPlan, number> = { starter: 1, pro: 2, enterprise: 3 };

export const defaultModuleEnabled = (plan: CompanyPlan, module: DealMasterModule) => {
  const definition = MODULES.find(item => item.id === module);
  if (!definition) return false;
  return planWeight[plan] >= planWeight[definition.minimumPlan];
};

export const moduleEnabled = (company: Pick<Company, 'plan' | 'status' | 'moduleOverrides'> | null | undefined, module: DealMasterModule) => {
  if (!company || company.status === 'suspended') return false;
  const override = company.moduleOverrides?.[module];
  if (typeof override === 'boolean') return override;
  return defaultModuleEnabled(company.plan, module);
};

export const companySnapshotForUser = (user: User): Company => {
  if (!user.companyId || user.companyId === DEFAULT_COMPANY_ID) return DEFAULT_COMPANY;
  return {
    id: user.companyId,
    slug: user.companyId,
    name: 'Minha empresa',
    plan: user.companyPlan || 'starter',
    status: user.companyStatus || 'active',
    moduleOverrides: user.companyModuleOverrides,
  };
};

export const enabledModules = (company: Pick<Company, 'plan' | 'status' | 'moduleOverrides'> | null | undefined) =>
  MODULES.filter(item => moduleEnabled(company, item.id)).map(item => item.id);

export const planModules = (plan: CompanyPlan) => MODULES.filter(item => defaultModuleEnabled(plan, item.id));

export const entitlementService = {
  moduleEnabled,
  enabledModules,
  planModules,
  companySnapshotForUser,
  modules: MODULES,
  plans: PLAN_META,
};