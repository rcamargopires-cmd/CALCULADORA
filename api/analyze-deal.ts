import { GoogleGenAI } from '@google/genai';

const FIREBASE_API_KEY = 'AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q';

const verifyFirebaseToken = async (idToken: string) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return null;
  const data = await response.json() as any;
  return data?.users?.[0] || null;
};

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const pct = (value: number) => `${(Number(value) || 0).toFixed(2).replace('.', ',')}%`;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const authHeader = String(req.headers?.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sessão do Motyq não encontrada.' });

    const firebaseUser = await verifyFirebaseToken(token);
    if (!firebaseUser?.email) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'A inteligência do Motyq ainda não está configurada no servidor.' });

    const data = req.body?.data || {};
    const results = req.body?.results || {};
    const vehicleInfo = data.licensePlate ? `Veículo Placa: ${data.licensePlate}` : 'Veículo sem placa informada';

    let stockAlert = '';
    const days = Number(data.stockDays) || 0;
    if (days >= 120) stockAlert = `CRÍTICO: Veículo "SUPER VELHO" (${days} dias). Prioridade TOTAL é LIQUIDEZ. Aceite qualquer proposta que não dê prejuízo absurdo.`;
    else if (days >= 90) stockAlert = `ALERTA VERMELHO: Veículo "VELHO" (${days} dias). Margem é secundária, o foco é girar o estoque urgentemente.`;
    else if (days >= 61) stockAlert = `ATENÇÃO: Veículo "ENVELHECIDO" (${days} dias). Comece a flexibilizar a negociação para evitar que vire um carro de 90 dias.`;
    else if (days >= 31) stockAlert = `ALERTA AMARELO: Veículo "MÉDIO" (${days} dias). Monitore. Ainda saudável, mas não deixe a venda esfriar por detalhes pequenos.`;
    else stockAlert = `Estoque Saudável (Recente): ${days} dias. Busque a margem cheia e maximize o lucro.`;

    const prompt = `
Atue como um Gerente Financeiro de Concessionária Volkswagen Sênior. Analise os dados desta venda de veículo (${vehicleInfo}) e forneça um parecer curto e estratégico (máximo 3 parágrafos).

CONTEXTO IMPORTANTE: Nesta operação, o "Retorno Bancário" (BV) é considerado parte fundamental da receita (Inside Profit). É comum que o Lucro Operacional do carro seja baixo ou negativo, sendo compensado pelo ganho financeiro.

CONTEXTO DE ESTOQUE: ${stockAlert}

Dados da Negociação:
- Valor da Nota Fiscal: ${money(data.invoiceValue)}
- Custo do Veículo: ${money(data.vehicleCost)}
- Total Recebido (Entrada + Financiamento + Troca): ${money(results.totalPayment)}
- Custos Operacionais (Doc, Acessórios, etc): ${money(results.totalCosts)}

COMPOSIÇÃO DO RESULTADO:
1. Lucro Operacional (Lataria): ${money(results.profit)} (${pct(results.marginPercent)})
2. Retorno Bancário (BV): ${money(data.bankReturn)}

>>> RESULTADO FINAL (INDICADOR CHAVE DE SUCESSO) <<<
- Lucro Líquido Total (Soma): ${money(results.profitWithBank)}
- Margem Total sobre NF: ${pct(results.marginPercentWithBank)}

Diretrizes da Análise:
1. FOCO NA MARGEM TOTAL: Ignore prejuízo operacional se a Margem Total for saudável. O sucesso da venda depende do resultado COM O BANCO.
2. FATOR IDADE DE ESTOQUE: Aja estritamente de acordo com o nível de alerta informado acima.
3. Se a Margem Total estiver abaixo de 4%, alerte risco (exceto se for carro velho de estoque). Entre 4% e 8% é aceitável. Acima de 8% é excelente.
4. Valide se o retorno bancário está ajudando a salvar a operação.

Responda em Português do Brasil. Use Markdown. Seja direto, profissional e focado no resultado final combinado.`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
    return res.status(200).json({ text: response.text || 'Não foi possível gerar a análise no momento.' });
  } catch (error: any) {
    console.error('Motyq analyze-deal error:', error?.message || error);
    return res.status(500).json({ error: 'Não foi possível gerar a análise agora. Tente novamente.' });
  }
}
