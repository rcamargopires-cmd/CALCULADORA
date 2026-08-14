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

const tokenKey = (companyId: string) => `${TOKEN_PREFIX}${companyId}`;

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
    const token = this.getToken(companyId);
    if (!token || !plates.length) return null;
    const response = await fetch(`${ASSETGUARD_ORIGIN}/api/integration/radar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plates }),
    });
    if (response.status === 401) {
      this.clearToken(companyId);
      throw new Error('Conexão AssetGuard expirada. Conecte novamente.');
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível ler o radar do AssetGuard.');
    return data as AssetGuardRadar;
  },
};
