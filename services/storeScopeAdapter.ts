import { operationalDataService } from './operationalDataService';
import { storeScopeService } from './storeScopeService';
import { storeScopedOperationalService } from './storeScopedOperationalService';

// Multi-Store V2 adapter: componentes legados continuam chamando operationalDataService,
// mas as leituras passam a respeitar a unidade ativa sem reescrever todo o dashboard.
operationalDataService.getLatestStock = async () => storeScopedOperationalService.getLatestStock(storeScopeService.get());
operationalDataService.getSales = async () => storeScopedOperationalService.getSales(storeScopeService.get());
operationalDataService.getLatestPerformance = async () => storeScopedOperationalService.getLatestPerformance(storeScopeService.get());
operationalDataService.getPerformanceHistory = async () => storeScopedOperationalService.getPerformanceHistory(storeScopeService.get());
operationalDataService.getStockHistory = async () => storeScopedOperationalService.getStockHistory(storeScopeService.get());
