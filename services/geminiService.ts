
import { GoogleGenAI } from "@google/genai";
import { DealData, CalculationResult } from "../types";
import { formatCurrency, formatPercentage } from "../utils/currency";

// Initialize the client safely.
const getClient = () => {
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please configure process.env.API_KEY.");
  }
  return new GoogleGenAI({ apiKey });
};

export const analyzeDeal = async (data: DealData, results: CalculationResult): Promise<string> => {
  try {
    const ai = getClient();
    
    const vehicleInfo = data.licensePlate 
      ? `Veículo Placa: ${data.licensePlate}` 
      : "Veículo sem placa informada";

    // Define status de estoque para o prompt com 5 categorias
    let stockAlert = "";
    if (data.stockDays >= 120) {
      stockAlert = `CRÍTICO: Veículo "SUPER VELHO" (${data.stockDays} dias). Prioridade TOTAL é LIQUIDEZ. Aceite qualquer proposta que não dê prejuízo absurdo.`;
    } else if (data.stockDays >= 90) {
      stockAlert = `ALERTA VERMELHO: Veículo "VELHO" (${data.stockDays} dias). Margem é secundária, o foco é girar o estoque urgentemente.`;
    } else if (data.stockDays >= 61) {
      stockAlert = `ATENÇÃO: Veículo "ENVELHECIDO" (${data.stockDays} dias). Comece a flexibilizar a negociação para evitar que vire um carro de 90 dias.`;
    } else if (data.stockDays >= 31) {
      stockAlert = `ALERTA AMARELO: Veículo "MÉDIO" (${data.stockDays} dias). Monitore. Ainda saudável, mas não deixe a venda esfriar por detalhes pequenos.`;
    } else {
      stockAlert = `Estoque Saudável (Recente): ${data.stockDays} dias. Busque a margem cheia e maximize o lucro.`;
    }

    const prompt = `
      Atue como um Gerente Financeiro de Concessionária Volkswagen Sênior. Analise os dados desta venda de veículo (${vehicleInfo}) e forneça um parecer curto e estratégico (máximo 3 parágrafos).
      
      CONTEXTO IMPORTANTE: Nesta operação, o "Retorno Bancário" (BV) é considerado parte fundamental da receita (Inside Profit). É comum que o Lucro Operacional do carro seja baixo ou negativo, sendo compensado pelo ganho financeiro.
      
      CONTEXTO DE ESTOQUE: ${stockAlert}
      
      Dados da Negociação:
      - Valor da Nota Fiscal: ${formatCurrency(data.invoiceValue)}
      - Custo do Veículo: ${formatCurrency(data.vehicleCost)}
      - Total Recebido (Entrada + Financiamento + Troca): ${formatCurrency(results.totalPayment)}
      - Custos Operacionais (Doc, Acessórios, etc): ${formatCurrency(results.totalCosts)}
      
      COMPOSIÇÃO DO RESULTADO:
      1. Lucro Operacional (Lataria): ${formatCurrency(results.profit)} (${formatPercentage(results.marginPercent)})
      2. Retorno Bancário (BV): ${formatCurrency(data.bankReturn)}
      
      >>> RESULTADO FINAL (INDICADOR CHAVE DE SUCESSO) <<<
      - Lucro Líquido Total (Soma): ${formatCurrency(results.profitWithBank)}
      - Margem Total sobre NF: ${formatPercentage(results.marginPercentWithBank)}
      
      Diretrizes da Análise:
      1. **FOCO NA MARGEM TOTAL**: Ignore prejuízo operacional se a Margem Total for saudável. O sucesso da venda depende do resultado COM O BANCO.
      2. **FATOR IDADE DE ESTOQUE**: Aja estritamente de acordo com o nível de alerta de estoque informado acima. Se for "Recente", cobre lucro. Se for "Super Velho", implore pela venda.
      3. Se a Margem Total estiver abaixo de 4%, alerte risco (exceto se for carro velho de estoque). Entre 4% e 8% é aceitável. Acima de 8% é excelente.
      4. Valide se o retorno bancário está ajudando a salvar a operação.
      
      Responda em Português do Brasil. Use formatação Markdown. Seja direto, profissional e focado no resultado final combinado.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "Não foi possível gerar a análise no momento.";
  } catch (error) {
    console.error("Erro ao analisar negociação:", error);
    return "Erro ao conectar com a IA para análise. Verifique sua chave de API.";
  }
};
