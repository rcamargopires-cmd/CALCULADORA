# Motyq GO | Especificação funcional e plano de implementação (v0.1)

Status: proposta técnica, não implementada e não publicada. Este documento não autoriza alteração de produção.

## Objetivo
Uma tarefa principal e uma agenda completa para cada pessoa, com orientação passo a passo, baixa carga cognitiva e registro auditável. O GO é uma camada sobre os módulos atuais, não um DMS separado.

## Experiência
- Tela inicial padrão para seller e evaluator; manager pode iniciar no GO e alternar para dashboard executivo.
- Bloco único **FAÇA AGORA**: verbo claro, cliente/veículo, motivo, prazo, botão de ação e ações secundárias **Reagendar** e **Ver agenda**.
- Agenda: **Atrasadas**, **Hoje**, **Próximas**; pesquisa e filtros simples. Um clique retorna ao foco.
- Nunca tratar abrir tela como concluir tarefa. A conclusão exige evento persistido no módulo de origem.
- Cada etapa orienta o usuário com no máximo 3 instruções curtas; ajuda contextual opcional.
- Não emitir notificações sonoras por padrão; configurar preferências e limitar alertas urgentes.

## Fontes de tarefas (MVP)
1. CRM/showroom_passages: próximo contato vencido, retorno prometido, negociação sem próximo passo.
2. Avaliações: vistoria atribuída, fotos obrigatórias pendentes, laudo aguardando envio, precificação aguardando mesa.
3. Pedidos de venda: aprovação, crédito, faturamento e checklist de entrega pendentes.
4. Estoque operacional: aging crítico como ação para manager, nunca como tarefa do vendedor sem atribuição explícita.

O MVP deve **ler eventos reais**; não criar tarefas fictícias em empresas reais. A demo pode ter fixtures apenas no tenant motyq-demo.

## Contrato proposto da tarefa
```ts
type GoTask = {
  id: string;                 // origem + id + etapa, estável
  companyId: string;
  storeId: string;
  assigneeUserId: string;     // ou fila autorizada
  source: 'crm'|'evaluation'|'sales_order'|'stock';
  sourceId: string;
  action: string;             // verbo curto, acessível
  reason: string;
  dueAt?: string;             // ISO com fuso explícito
  priority: 'critical'|'high'|'normal';
  state: 'pending'|'snoozed'|'completed'|'blocked';
  route: string;              // rota interna permitida
  updatedAt: string;
};
```

## Motor de prioridade
1. Itens bloqueando cliente/entrega ou vencidos e atribuídos: críticos.
2. Prazo hoje e tarefas gerenciais com impacto demonstrável: alta.
3. Demais pendências: normal.
4. Desempate: prazo ascendente, atualização mais antiga, id estável.
5. Uma tarefa reagendada reaparece no novo prazo; uma tarefa concluída some somente após confirmação da gravação na origem.
6. Sem tarefas: mostrar estado vazio e permitir **Ver agenda**; não inventar urgência.

## Segurança e isolamento
- Consultas sempre escopadas por companyId e storeId(s) autorizados.
- Vendedor só acessa próprias tarefas; avaliador, avaliações atribuídas; gestor, pendências da equipe de suas unidades.
- Autorização efetiva nas regras/backend, não somente filtro visual.
- Idempotência por source + sourceId + etapa; evitar duplicações.
- Registrar ator, instante, origem, antes/depois, motivo do reagendamento; não registrar dados sensíveis desnecessários.
- Ações de aprovação/precificação devem reutilizar as permissões existentes.
- Não criar escrita cruzada entre tenants; validar explicitamente motyq-demo versus Abrão Reze.

## Sequência de implementação sem risco
- **Fase 0:** concluir consistência da demo (18 veículos, CRM, pedidos, métricas), testes e restauração segura.
- **Fase 1:** criar adaptadores somente leitura de CRM, avaliações e pedidos; validar escopo e contagens.
- **Fase 2:** GO em rota isolada com foco/agenda e navegação para telas existentes; sem gravar conclusão fictícia.
- **Fase 3:** ações reais de conclusão/reagendamento por módulo, auditadas e autorizadas no servidor.
- **Fase 4:** definir GO como tela inicial por papel após testes com usuários; liberar gradualmente.
- **Fase 5:** lembretes, escalonamento e recomendações de rentabilidade, sem ruído excessivo.

## Critérios de aceite
- Dado o mesmo usuário, GO e módulo de origem exibem a mesma pendência.
- Concluir no módulo atual remove do GO após atualização; abrir não conclui.
- Reagendar mantém histórico, novo prazo e responsável.
- Nenhum usuário vê ou altera tarefa de outra empresa ou unidade não autorizada.
- Vendedor, avaliador e gerente veem ações compatíveis com seus papéis.
- Carregamento, erro de conexão e lista vazia têm estados distintos.
- Navegação móvel permite realizar a tarefa sem caçar menus.
- Testes de regressão verificam estoque, propostas, avaliação e regras de acesso.
- Sem publicação até build/testes e aprovação explícita.
