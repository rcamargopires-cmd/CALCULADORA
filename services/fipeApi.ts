
import { parseCurrencyInput } from "../utils/currency";

// Definição de alguns carros reais para simular a resposta da API de Placa
// Em um sistema de produção com chave paga (APIPlaca/Infosimples), isso viria direto da placa.
// Aqui, mapeamos finais de placa para carros reais para buscar o PREÇO REAL na FIPE.
const MOCK_CARS = [
  { 
    // HYUNDAI HB20 1.0 Comfort Plus 2019 (Carro da Imagem do usuário)
    description: "HB20 Comf./C.Plus/C.Style 1.0 Flex 12V",
    brandId: "26", // Hyundai
    modelId: "5084", 
    yearId: "2019-1"
  },
  { 
    // CHEVROLET ONIX
    description: "ONIX HATCH LT 1.0 8V FlexPower 5p Mec.",
    brandId: "23", // GM
    modelId: "5965", 
    yearId: "2019-1"
  },
  { 
    // VW GOL
    description: "Gol 1.6 MSI Flex 8V 4p",
    brandId: "59", // VW
    modelId: "8099", 
    yearId: "2020-1"
  },
  { 
    // TOYOTA COROLLA
    description: "Corolla XEi 2.0 Flex 16V Aut.",
    brandId: "56", // Toyota
    modelId: "6438", 
    yearId: "2018-1"
  },
  { 
    // FIAT STRADA
    description: "Strada Freedom 1.3 Flex 8V CD",
    brandId: "21", // Fiat
    modelId: "8826", 
    yearId: "2021-1"
  }
];

export interface FipeResponse {
  valor: number;
  modelo: string;
  anoModelo: number;
  marca: string;
  combustivel: string;
  mesReferencia: string;
}

/**
 * Busca o valor real na API da FIPE.
 * Como não temos acesso à API paga do Detran (Placa -> Modelo), 
 * usamos uma lógica determinística baseada na placa para escolher um carro e buscar o preço REAL dele.
 */
export const fetchFipeDataByPlate = async (plate: string): Promise<FipeResponse | null> => {
  try {
    const cleanPlate = plate.replace(/[^a-zA-Z0-9]/g, '');
    
    // Seleciona um carro baseado no último caractere da placa para variar os testes
    // Se a placa terminar em 1 ou 6 = HB20 (Igual da foto), 2 ou 7 = Onix, etc.
    const lastChar = cleanPlate.slice(-1);
    const lastDigit = parseInt(lastChar, 10) || 0; 
    const carIndex = lastDigit % MOCK_CARS.length;
    const selectedCar = MOCK_CARS[carIndex];

    // Chamada REAL à API pública da FIPE (Parallelum)
    const url = `https://parallelum.com.br/fipe/api/v1/carros/marcas/${selectedCar.brandId}/modelos/${selectedCar.modelId}/anos/${selectedCar.yearId}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Erro na API Fipe');
    
    const data = await response.json();

    // A API retorna: 
    // { "Valor": "R$ 57.230,00", "Marca": "Hyundai", "Modelo": "...", "AnoModelo": 2019, ... }

    return {
      valor: parseCurrencyInput(data.Valor), // Converte "R$ 57.000,00" para number
      modelo: data.Modelo,
      marca: data.Marca,
      anoModelo: data.AnoModelo,
      combustivel: data.Combustivel,
      mesReferencia: data.MesReferencia
    };

  } catch (error) {
    console.error("Erro ao buscar FIPE:", error);
    return null;
  }
};
