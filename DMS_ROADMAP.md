# MOTYQ · Roadmap DMS

Objetivo: transformar o MOTYQ em um DMS completo para lojas e grupos de seminovos, com uma única fonte de verdade para veículo, cliente, fornecedor, venda e financeiro.

## Princípios obrigatórios

1. Um veículo existe uma vez e recebe um `vehicleId` estável.
2. Estoque, PrepTrack, propostas, financeiro, documentos e histórico apontam para o mesmo `vehicleId`.
3. Histórico não é estoque. Snapshot não é estoque atual.
4. Todo valor financeiro relevante entra no razão financeiro único.
5. Aprovação e pagamento são ações separadas.
6. Toda ação sensível gera trilha de auditoria.
7. Nenhum módulo pode criar uma segunda fonte de verdade do mesmo domínio.
8. Multiempresa e multiunidade são obrigatórios em todos os registros.

## Fase 1 · Fundação DMS
Status: EM ANDAMENTO

- [x] Estoque atual canônico
- [x] `vehicleId` no estoque
- [x] Cadastro mestre de veículo
- [x] PrepTrack ligado ao `vehicleId`
- [x] Financeiro da preparação ligado ao `vehicleId`
- [x] Trilha de auditoria base
- [ ] Cadastro mestre de clientes
- [ ] Cadastro mestre de fornecedores
- [ ] Perfis Preparação e Financeiro/Caixa
- [ ] Matriz granular de permissões
- [ ] Diagnóstico de integridade entre módulos

Critério de aceite: uma placa cadastrada uma vez deve ser o mesmo veículo em estoque, preparação, financeiro e histórico.

## Fase 2 · Ciclo de compra e entrada

Avaliação → aprovação de compra → dados do vendedor/proprietário → pagamento → documentação → entrada no estoque → preparação.

- [ ] Pedido de compra do veículo
- [ ] Proprietário / fornecedor do veículo
- [ ] Quitação de financiamento
- [ ] Contas a pagar da compra
- [ ] Entrada formal no estoque
- [ ] Checklist documental
- [ ] Custos de aquisição
- [ ] Origem: compra, troca, repasse ou consignação

Critério de aceite: toda entrada de veículo explica quem vendeu, quanto custou, como foi pago e quais documentos faltam.

## Fase 3 · Ciclo comercial e Pedido de Venda

Lead → atendimento → proposta → aceite → pedido → crédito → faturamento → entrega.

- [ ] Cadastro mestre de cliente
- [ ] Proposta vinculada ao veículo mestre
- [ ] Reserva de estoque
- [ ] Pedido de Venda
- [ ] Aprovação gerencial
- [ ] Entrada / sinal
- [ ] Financiamento
- [ ] Troca vinculada
- [ ] Comissão
- [ ] Faturamento
- [ ] Entrega
- [ ] Saída definitiva do estoque

Critério de aceite: uma proposta aceita deve conseguir virar venda sem redigitar veículo, cliente ou valores.

## Fase 4 · Financeiro completo

- [x] Contas a pagar
- [x] Contas a receber
- [x] Fluxo de caixa inicial
- [ ] Cadastro mestre de fornecedor
- [ ] Bancos e contas
- [ ] Caixa
- [ ] Parcelas
- [ ] Conciliação bancária
- [ ] Centros de custo
- [ ] Plano de contas
- [ ] DRE gerencial
- [ ] Comissões a pagar
- [ ] Recebíveis de financiamento
- [ ] Auditoria de baixa / estorno

Critério de aceite: todo real que entra ou sai deve ter origem, competência, parte, status e responsável.

## Fase 5 · Documentos, fiscal e pós-venda

- [ ] Dossiê documental do veículo
- [ ] ATPV-e / transferência
- [ ] Gravame
- [ ] Multas e débitos
- [ ] Despachante
- [ ] Nota fiscal / integração fiscal
- [ ] Checklist de entrega
- [ ] Garantia
- [ ] Ocorrências de pós-venda

## Fase 6 · Governança e confiabilidade

- [ ] Testes automatizados de fluxos críticos
- [ ] CI com typecheck e testes
- [ ] Regras Firestore versionadas e publicadas por ambiente
- [ ] Backup e restauração
- [ ] Logs de auditoria imutáveis
- [ ] Monitoramento de erros
- [ ] Migrações versionadas
- [ ] Diagnóstico de consistência por tenant
- [ ] Ambiente demo isolado

## Fluxos críticos que nunca podem quebrar

1. Veículo: entrada → preparação → disponível → reservado → vendido → faturado → entregue.
2. Preparação: solicitação → aprovação → contas a pagar → pagamento → custo do veículo → histórico.
3. Venda: lead → proposta → pedido → recebíveis → faturamento → baixa do estoque.
4. Troca: avaliação → aceite → compra → novo estoque.
5. Financeiro: origem → aprovação → vencimento → baixa → conciliação → DRE.
