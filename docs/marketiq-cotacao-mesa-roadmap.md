# Motyq IQ · Cotação Mesa
Arquitetura de evolução incremental (2026-11-10).

## Missão
A Mesa escolhe um veículo (pela ficha de avaliação ou diretamente do Radar Dealer),
o sistema sugere compradores profissionais que declararam interesse no segmento,
recebe propostas, calcula teto com despesas tributárias e margem informadas,
e apresenta a loja que fechou, valor final e situação do pagamento.

## Fase 1 · Fluxo assistido no navegador
Implementado:
- Renomear módulo de Repasse Sob Consulta para Cotação Mesa, preservando chaves e casos antigos.
- Carregar automóvel ou moto do Radar Dealer com um clique, mediante confirmação de substituição de rascunho.
- Carteira de lojistas por unidade, empresa e usuário neste navegador.
- Regras determinísticas de correspondência por marca, modelo, ano-modelo e categoria.
- WhatsApp individual, aberto só por interação humana e apenas se houver consentimento do lojista.
- A mensagem NÃO inclui placa, cliente, FIPE, custo ou preço de compra interno.
- Acompanhamento manual de preparado/contatado/respondeu/sem interesse; abrir WhatsApp não equivale a envio.
- Salvar consulta mesmo sem propostas, registrar ofertas confirmadas, validade, custos, margem e decisão de gestor.
- Registrar expressamente comprador, valor fechado, data e pagamento informado como recebido ou pendente.
- Log de revisões e CSV de cotações sem placa, com campos de fechamento.
- Sem automação de envio, sem tráfego adicional de Firestore e sem baixa real do estoque.

### Limites da fase 1
A carteira e os casos ainda são arquivos locais do navegador: não há sincronização entre dispositivos,
nem histórico empresarial auditável, nem confirmação externa de recebimento/pagamento.
Importar carteira legada ou replicar para outros usuários exige uma próxima implementação segura.
Em computadores compartilhados, proteger sessão e informações de contatos.

## Fase 2 · Back-end multiusuário (antes de mensagens automáticas)
- Modelar CotacaoCase, CotacaoBuyer, CotacaoOutreach, CotacaoBid, CotacaoClose
  com empresa/unidade, criador, timestamps, versões, responsáveis e eventos imutáveis.
- Usuário Mesa cria cotações, gestor revisa e confirma, operações/financeiro validam faturamento e liquidação.
- Controle de acesso por empresa, perfil, unidade e contato; sem exposição pública de placa/documentos.
- Paginação e cache com redução de leituras para não agravar quotas Firestore já observadas.
- Mecanismos de deduplicação, reenvio idempotente e trilha de opt-in, opt-out e base legal LGPD.
- Confirmar com um gerente o destino do estoque e integrações autorizadas antes de sincronizar.

## Fase 3 · WhatsApp Business oficial
- Conectar número comercial autorizado à plataforma oficial Meta/WhatsApp Business.
- Opt-in verificável de cada comprador, templates aprovados, limites por lote, opt-out, fuso e horário.
- Botão da Mesa seleciona público sugerido e revisa o texto; APROVAÇÃO humana explícita antes do disparo.
- Webhook validado para entrega, resposta, valor, validade e recusa, com revisão humana de ambiguidades.
- Não prometer disponibilidade de API ou preços sem consultar a documentação e orçamento atuais.

## Fase 4 · Aprendizado de compradores e decisão
- Perfil automático a partir de ofertas/compras REAIS confirmadas, com recência e preferências.
- Rankear compradores por marca/modelo/versão, ano, KM, região e valor de propostas anteriores.
- Comparar proposta bruta, custos de NF/impostos e margem desejada, apontando o teto por loja.
- Registrar venda apenas com confirmação humana e conciliar pagamento com comprovantes/financeiro.
- Mostrar dados insuficientes quando a amostra não suportar previsão; não inventar preços.

## Fase 5 · Integração de estoque / Dealernet
- Sincronização autorizada por API/arquivo, chave de veículo e versão, sem duplicar ou apagar avaliações.
- Estado: identificado → em cotação → propostas → selecionado → aprovado → faturado → recebido → concluído.
- Alertas por prazo e janela de validade; auditoria permanente de quem mudou valores, quando e por quê.

## Guardrails
1. Cotação não é venda; preço confirmado não é pagamento recebido.
2. Abrir conversa no WhatsApp não confirma envio, entrega ou consentimento.
3. A automação não deve contatar compradores sem consentimento e aprovação da Mesa.
4. Cliente, placa, custo interno e documentos não saem em mensagem sem autorização explícita.
5. Sem gravação de vendas ou pagamentos oficiais nos DMS neste piloto local.
