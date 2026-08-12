import { operationalDataService } from './operationalDataService';
import { companyScopeService } from './companyScopeService';
import { storeScopeService } from './storeScopeService';
import { storeScopedOperationalService } from './storeScopedOperationalService';

// Adaptador de compatibilidade: componentes antigos continuam chamando operationalDataService,
// enquanto a leitura real respeita Empresa + Unidade ativas.
operationalDataService.getLatestStock = async () => storeScopedOperationalService.getLatestStock(storeScopeService.get(), companyScopeService.get());
operationalDataService.getSales = async () => storeScopedOperationalService.getSales(storeScopeService.get(), companyScopeService.get());
operationalDataService.getLatestPerformance = async () => storeScopedOperationalService.getLatestPerformance(storeScopeService.get(), companyScopeService.get());
operationalDataService.getPerformanceHistory = async () => storeScopedOperationalService.getPerformanceHistory(storeScopeService.get(), companyScopeService.get());
operationalDataService.getStockHistory = async () => storeScopedOperationalService.getStockHistory(storeScopeService.get(), companyScopeService.get());
