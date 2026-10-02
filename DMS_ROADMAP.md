# MOTYQ · Roadmap mestre do DMS

Este arquivo é a fonte de acompanhamento do projeto. Um item só é considerado concluído quando está marcado com `[x]` aqui e no painel **PLANO** do Motyq.

**Progresso atual:** 112/160 itens concluídos (70%).

## Regras do projeto

- Uma única fonte de verdade por veículo, cliente, fornecedor, venda e lançamento financeiro.
- Todo módulo deve apontar para os cadastros mestres, sem criar cópias paralelas.
- Aprovação e pagamento são responsabilidades separadas.
- Toda ação sensível precisa de auditoria.
- Multiempresa e multiunidade devem existir desde a origem de cada registro.
- Nenhuma melhoria é encerrada sem atualizar este checklist.

## Fase 1 · Fundação e fonte única de verdade

Um veículo, cliente, fornecedor e lançamento financeiro devem existir uma única vez e ser reutilizados por todos os módulos.

**Progresso da fase:** 15/15

- [x] **F1.01** Estoque atual canônico único
- [x] **F1.02** Identidade estável do veículo com vehicleId
- [x] **F1.03** Cadastro mestre de veículo
- [x] **F1.04** PrepTrack ligado ao vehicleId
- [x] **F1.05** Financeiro da preparação ligado ao vehicleId
- [x] **F1.06** Cadastro mestre de cliente no backend
- [x] **F1.07** CRM e showroom criando/reutilizando customerId
- [x] **F1.08** Cadastro mestre de fornecedor no backend
- [x] **F1.09** Preparação aprovada criando/reutilizando supplierId
- [x] **F1.10** Razão financeiro único base
- [x] **F1.11** Trilha de auditoria base
- [x] **F1.12** Diagnóstico de integridade DMS
- [x] **F1.13** Migração dos dados antigos para IDs mestres
- [x] **F1.14** Validação automática contra duplicidades de mestre
- [x] **F1.15** Histórico de movimentos do estoque separado do estoque atual

## Fase 2 · Usuários, funções e segurança

Cada pessoa acessa somente o necessário para sua responsabilidade.

**Progresso da fase:** 6/12

- [x] **F2.01** Editar usuário existente
- [x] **F2.02** Padrões Gestor, Preparação e Financeiro/Caixa
- [x] **F2.03** Checkboxes de permissões por usuário para estoque, preparação e financeiro
- [x] **F2.04** Workspace enxuto para Preparação e Financeiro/Caixa
- [x] **F2.05** Separar solicitação de preparação da aprovação gerencial
- [x] **F2.06** Separar visão financeira de baixa financeira
- [ ] **F2.07** Checkboxes para CRM, avaliações, propostas, documentos, ativos e relatórios
- [ ] **F2.08** Permissões por unidade e múltiplas unidades por usuário
- [ ] **F2.09** Aplicar permissões também no backend/API
- [ ] **F2.10** Aplicar permissões nas regras Firestore
- [ ] **F2.11** Auditar alteração de permissões e usuários
- [ ] **F2.12** Bloqueio de autoaprovação em fluxos sensíveis

## Fase 3 · Estoque, compra e entrada do veículo

Explicar de onde cada carro veio, quanto custou, quem vendeu e como entrou na operação.

**Progresso da fase:** 17/17

- [x] **F3.01** Cadastro manual de veículo com FIPE
- [x] **F3.02** Importação de estoque sem duplicar fonte de verdade
- [x] **F3.03** Aging automático do estoque
- [x] **F3.04** Custo atual = compra + preparação aprovada
- [x] **F3.05** Avaliação aprovada virar intenção de compra
- [x] **F3.06** Pedido de compra do veículo
- [x] **F3.07** Cadastro do proprietário/vendedor do veículo
- [x] **F3.08** Origem da entrada: compra, troca, repasse ou consignação
- [x] **F3.09** Quitação de financiamento do veículo comprado
- [x] **F3.10** Débitos, multas e pendências na compra
- [x] **F3.11** Conta a pagar da compra
- [x] **F3.12** Formas e etapas do pagamento da compra
- [x] **F3.13** Checklist documental de entrada
- [x] **F3.14** Entrada formal no estoque após compra
- [x] **F3.15** Transferência entre unidades com histórico
- [x] **F3.16** Consignação com proprietário e vencimentos
- [x] **F3.17** Dossiê completo do custo de aquisição

## Fase 4 · Preparação e fornecedores

Controlar solicitação, aprovação, execução, custo e pagamento de cada serviço.

**Progresso da fase:** 12/15

- [x] **F4.01** Criação automática de ordem no PrepTrack
- [x] **F4.02** Lançamento de serviço, fornecedor, valor e prazo
- [x] **F4.03** Aprovação gerencial do serviço
- [x] **F4.04** Serviço aprovado gerando conta a pagar
- [x] **F4.05** Custo aprovado refletindo no custo do veículo
- [x] **F4.06** Pagamento do fornecedor ligado à placa/vehicleId
- [x] **F4.07** Histórico do veículo com solicitação, aprovação e pagamento
- [x] **F4.08** Rejeição de orçamento com motivo
- [x] **F4.09** Múltiplos orçamentos para o mesmo serviço
- [ ] **F4.10** Anexo de orçamento, nota fiscal e comprovante
- [ ] **F4.11** Fotos antes/depois da preparação
- [ ] **F4.12** Retrabalho e garantia do fornecedor
- [x] **F4.13** SLA e indicadores por fornecedor
- [x] **F4.14** Cadastro/edição de fornecedor com dados bancários e Pix
- [x] **F4.15** Relatório de custo de preparação por carro e fornecedor

## Fase 5 · CRM, cliente e negociação

Levar o cliente do primeiro contato até uma proposta sem redigitação.

**Progresso da fase:** 9/12

- [x] **F5.01** CRM/showroom base
- [x] **F5.02** Cadastro mestre de cliente criado a partir do atendimento
- [x] **F5.03** Histórico de atendimento e follow-up
- [x] **F5.04** Propostas comerciais versionadas
- [x] **F5.05** Tela completa para consultar/editar cliente mestre
- [x] **F5.06** CPF/CNPJ, endereço e documentos do cliente
- [x] **F5.07** Deduplicação de clientes antigos
- [x] **F5.08** Proposta vinculada obrigatoriamente ao vehicleId
- [x] **F5.09** Reserva do veículo por proposta
- [ ] **F5.10** Prazo de validade e expiração automática da reserva
- [ ] **F5.11** Aceite digital da proposta
- [ ] **F5.12** LGPD, consentimento e trilha de dados pessoais

## Fase 6 · Pedido de venda, financiamento e faturamento

Transformar proposta aceita em venda completa, sem atalhos paralelos.

**Progresso da fase:** 16/16

- [x] **F6.01** Pedido de Venda central
- [x] **F6.02** Proposta aceita gerar Pedido de Venda
- [x] **F6.03** Reserva automática do estoque ao abrir pedido
- [x] **F6.04** Aprovação gerencial da venda
- [x] **F6.05** Entrada/sinal do cliente
- [x] **F6.06** Financiamento com banco, status e retorno
- [x] **F6.07** Análise/liberação de crédito
- [x] **F6.08** Troca vinculada ao pedido
- [x] **F6.09** Troca aceita virar compra e novo estoque
- [x] **F6.10** Comissão ligada ao pedido de venda
- [x] **F6.11** Faturamento do veículo
- [x] **F6.12** Contas a receber geradas pelo faturamento
- [x] **F6.13** Checklist de entrega
- [x] **F6.14** Entrega registrada com data e responsável
- [x] **F6.15** Saída definitiva do estoque somente após evento correto
- [x] **F6.16** Cancelamento/estorno de venda com reversões automáticas

## Fase 7 · Financeiro completo

Todo real que entra ou sai deve ter origem, vencimento, parte, status e responsável.

**Progresso da fase:** 17/18

- [x] **F7.01** Contas a pagar base
- [x] **F7.02** Contas a receber base
- [x] **F7.03** Fluxo de caixa realizado e projetado inicial
- [x] **F7.04** Lançamento manual financeiro
- [x] **F7.05** Baixa de pagamento e recebimento
- [x] **F7.06** Bancos e contas bancárias
- [x] **F7.07** Caixas físicos por unidade
- [x] **F7.08** Parcelas e recorrências
- [x] **F7.09** Conciliação bancária
- [x] **F7.10** Plano de contas
- [x] **F7.11** Centros de custo
- [x] **F7.12** DRE gerencial
- [x] **F7.13** Comissões a pagar
- [x] **F7.14** Recebíveis de bancos/financiamento
- [ ] **F7.15** Anexo de comprovantes e documentos financeiros
- [x] **F7.16** Estorno de baixa com aprovação e auditoria
- [x] **F7.17** Aging de contas e alertas de vencimento
- [x] **F7.18** Fechamento diário/mensal de caixa

## Fase 8 · Documentação, fiscal e pós-venda

Acompanhar a vida documental e fiscal do carro até depois da entrega.

**Progresso da fase:** 10/12

- [x] **F8.01** Dossiê documental do veículo
- [x] **F8.02** ATPV-e / transferência
- [x] **F8.03** CRLV e documentos de entrada/saída
- [x] **F8.04** Gravame
- [x] **F8.05** Multas e débitos
- [x] **F8.06** Despachante e custos documentais
- [ ] **F8.07** Nota fiscal / integração fiscal
- [ ] **F8.08** Upload e organização de documentos
- [x] **F8.09** Garantia do veículo vendido
- [x] **F8.10** Ocorrências de pós-venda
- [x] **F8.11** Custos de garantia/pós-venda
- [x] **F8.12** Pesquisa de satisfação e retorno do cliente

## Fase 9 · Gestão, BI e relatórios

Usar as transações reais do DMS como fonte dos indicadores.

**Progresso da fase:** 3/12

- [x] **F9.01** Dashboard operacional
- [x] **F9.02** Estoque por idade e custo de capital
- [x] **F9.03** Relatórios comerciais/showroom existentes
- [ ] **F9.04** Dashboard 100% derivado das transações DMS
- [ ] **F9.05** Rentabilidade real por veículo
- [ ] **F9.06** Resultado por vendedor
- [ ] **F9.07** Resultado por unidade
- [ ] **F9.08** Resultado por fornecedor de preparação
- [ ] **F9.09** Funil completo lead → proposta → venda → entrega
- [ ] **F9.10** Painel de compras/captação
- [ ] **F9.11** Painel financeiro e DRE
- [ ] **F9.12** Alertas executivos de inconsistências e exceções

## Fase 10 · Multiempresa, SaaS e administração

Permitir vender o Motyq para várias lojas sem misturar dados ou configurações.

**Progresso da fase:** 6/12

- [x] **F10.01** Multiempresa base
- [x] **F10.02** Multiunidade base
- [x] **F10.03** Administração master de empresas
- [x] **F10.04** Planos Starter, Pro e Enterprise
- [x] **F10.05** Controle de mensalidade/bloqueio base
- [x] **F10.06** Gestão de usuários por empresa
- [ ] **F10.07** Configuração de módulos por plano totalmente aplicada
- [ ] **F10.08** Cobrança recorrente automatizada
- [ ] **F10.09** Portal do cliente para cobrança/plano
- [ ] **F10.10** Onboarding guiado de nova loja
- [ ] **F10.11** Importador/migrador de dados de outro DMS
- [ ] **F10.12** Ambiente demo totalmente isolado

## Fase 11 · Segurança, confiabilidade e operação

O sistema precisa ser confiável o bastante para carregar estoque, dinheiro e histórico real.

**Progresso da fase:** 1/12

- [ ] **F11.01** Testes automatizados dos fluxos críticos
- [x] **F11.02** CI com typecheck, build e testes a cada alteração
- [ ] **F11.03** Regras Firestore versionadas e publicadas por ambiente
- [ ] **F11.04** Índices Firestore versionados
- [ ] **F11.05** Backup periódico e procedimento de restauração
- [ ] **F11.06** Migrações de dados versionadas
- [ ] **F11.07** Auditoria imutável ou protegida contra edição
- [ ] **F11.08** Monitoramento central de erros
- [ ] **F11.09** Monitoramento de performance
- [ ] **F11.10** Rotina automática de diagnóstico por tenant
- [ ] **F11.11** Política de retenção e exclusão de dados/LGPD
- [ ] **F11.12** Exportação de dados e trilha para auditoria

## Fase 12 · Expansão para concessionária completa

Recursos adicionais caso o Motyq avance de seminovos para concessionárias com pós-venda técnico.

**Progresso da fase:** 0/7

- [ ] **F12.01** Ordem de serviço de oficina
- [ ] **F12.02** Agenda de oficina
- [ ] **F12.03** Estoque de peças
- [ ] **F12.04** Requisição/baixa de peças por OS
- [ ] **F12.05** Garantia de fábrica
- [ ] **F12.06** Produtividade de técnicos
- [ ] **F12.07** Integrações com montadoras

