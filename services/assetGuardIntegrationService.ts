const ASSETGUARD_ORIGIN = 'https://controle-manuais-chaves.vercel.app';
const TOKEN_PREFIX = 'dealmaster.assetguard.token.';

export type AssetGuardRadarVehicle = {
  plate: string;
  model: string;
  manualState: string;
  manualUnit: string;
  keyState: string;
  keyUnit: string;
  saleUnit: string;
  requestOpen: boolean;
  waitingRequestHours: number;
  inTransit: boolean;
  transitHours: number;
  outsideSaleStore: boolean;
};

export type AssetGuardRadar = {
  organizationName: string;
  summary: {
    registered: number;
    requestsOpen: number;
    overdueRequests: number;
    inTransit: number;
    overdueTransit: number;
    outsideSaleStore: number;
  };
  vehicles: AssetGuardRadarVehicle[];
};

export type AssetGuardSlaUnit = {
  unit: string;
  requests: number;
  avgRequestToSendHours: number;
  avgTransitHours: number;
  avgTotalHours: number;
  overdue: number;
  requestSlaPercent: number;
  transitSlaPercent: number;
};

export type AssetGuardSlaCycle = {
  vehicleId: string;
  plate: string;
  model: string;
  items: string;
  origin: string;
  destination: string;
  requestAt: string;
  requestToSendHours: number | null;
  transitHours: number | null;
  totalHours: number | null;
  status: 'waiting_send' | 'in_transit' | 'received' | 'delivered';
  overdue: boolean;
};

export type AssetGuardSla = {
  organizationName: string;
  periodDays: number;
  slaHours: number;
  summary: {
    requests: number;
    waitingSend: number;
    inTransit: number;
    overdue: number;
    delivered: number;
    avgRequestToSendHours: number;
    avgTransitHours: number;
    avgTotalHours: number;
    requestSlaPercent: number;
    transitSlaPercent: number;
  };
  units: AssetGuardSlaUnit[];
  recent: AssetGuardSlaCycle[];
};

const tokenKey = (companyId: string) => `${TOKEN_PREFIX}${companyId}`;

async function integrationPost<T>(companyId: string, path: string, payload: unknown): Promise<T | null> {
  const token = assetGuardIntegrationService.getToken(companyId);
  if (!token) return null;
  const response = await fetch(`${ASSETGUARD_ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (response.status === 401) {
    assetGuardIntegrationService.clearToken(companyId);
    throw new Error('Conexão AssetGuard expirada. Conecte novamente.');
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível ler os dados do AssetGuard.');
  return data as T;
}

export const assetGuardIntegrationService = {
  origin: ASSETGUARD_ORIGIN,
  getToken(companyId: string) {
    try { return localStorage.getItem(tokenKey(companyId)) || ''; } catch { return ''; }
  },
  setToken(companyId: string, token: string) {
    try { localStorage.setItem(tokenKey(companyId), token); } catch {}
    window.dispatchEvent(new CustomEvent('dealmaster:assetguard-connected', { detail: { companyId } }));
  },
  clearToken(companyId: string) {
    try { localStorage.removeItem(tokenKey(companyId)); } catch {}
    window.dispatchEvent(new CustomEvent('dealmaster:assetguard-connected', { detail: { companyId } }));
  },
  pairingUrl() {
    const origin = window.location.origin;
    return `${ASSETGUARD_ORIGIN}/sistema/integrar?origin=${encodeURIComponent(origin)}`;
  },
  async getRadar(companyId: string, plates: string[]): Promise<AssetGuardRadar | null> {
    if (!plates.length) return null;
    return integrationPost<AssetGuardRadar>(companyId, '/api/integration/radar', { plates });
  },
  async getSla(companyId: string, days: 7 | 30 | 90 = 30): Promise<AssetGuardSla | null> {
    return integrationPost<AssetGuardSla>(companyId, '/api/integration/sla', { days });
  },
};
