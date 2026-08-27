import { auth } from '../firebase';
import { DealData, CalculationResult } from '../types';

export const analyzeDeal = async (data: DealData, results: CalculationResult): Promise<string> => {
  try {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return 'Sua sessão expirou. Entre novamente no Motyq para usar a análise.';

    const idToken = await firebaseUser.getIdToken();
    const response = await fetch('/api/analyze-deal', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ data, results }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `Erro ${response.status}`);
    return String(payload?.text || 'Não foi possível gerar a análise no momento.');
  } catch (error) {
    console.error('Erro ao analisar negociação:', error);
    return error instanceof Error ? error.message : 'Erro ao conectar com a IA para análise.';
  }
};
