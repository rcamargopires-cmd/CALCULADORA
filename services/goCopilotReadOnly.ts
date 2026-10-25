/**
 * Primeira camada de conversa do GO: somente leitura, sem IA generativa e sem integrações externas.
 * Toda resposta é derivada das tarefas visíveis no módulo atual.
 * Antes de integrar fontes externas, aplicar autenticação/autorização no backend.
 */
export type GoReadOnlyTask = {
  title: string;
  reason: string;
  dueLabel: string;
  urgent: boolean;
};

export type GoReadOnlyContext = 'crm' | 'pricing';

const normalize = (value: string): string => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const area = (context: GoReadOnlyContext) =>
  context === 'pricing' ? 'fila de avaliações' : 'agenda do CRM';

export const getGoGuidance = (
  question: string,
  tasks: GoReadOnlyTask[],
  activeTask: GoReadOnlyTask | undefined,
  context: GoReadOnlyContext,
): string => {
  const query = normalize(question);
  const scope = area(context);

  if (!query) return 'Escreva uma pergunta sobre as pendências exibidas nesta tela.';

  // Não insinuar acesso a fontes que ainda não foram integradas.
  if (/syonet|autoavaliar|dealernet|integrac|tres sistemas|3 sistemas/.test(query)) {
    return 'Ainda não tenho integração com Syonet, AutoAvaliar ou DealerNet. Consigo orientar somente com as informações já carregadas na ' + scope + '.';
  }

  if (!tasks.length) {
    return 'Não há pendências identificadas na ' + scope + ' neste momento. Isso não confirma que outras áreas estejam sem tarefas.';
  }

  const selected = activeTask || tasks[0];
  const urgentCount = tasks.filter(task => task.urgent).length;
  const next = 'Comece por "' + selected.title + '". ' + selected.reason + ' Prazo ou referência: ' + selected.dueLabel + '. Abra a tarefa para realizar a ação no módulo de origem.';

  if (/por que|porque|motivo|razao|prioridad/.test(query)) {
    return '"' + selected.title + '" está em foco. Motivo registrado: ' + selected.reason + ' Referência: ' + selected.dueLabel + '. Essa é uma sugestão com base na fila disponível, não uma decisão automática.';
  }

  if (/resum|quant|pendenc|agenda|hoje|todas|equipe/.test(query)) {
    const preview = tasks.slice(0, 3).map(task => task.title).join('; ');
    const extra = tasks.length > 3 ? ' Há mais ' + (tasks.length - 3) + ' na agenda.' : '';
    return 'Encontrei ' + tasks.length + ' pendência(s) na ' + scope + ', incluindo ' + urgentCount + ' sinalizada(s) para atenção. Primeiras da lista: ' + preview + '.' + extra;
  }

  if (/proxim|agora|fazer|comec|comecar|primeiro|passo|ajud/.test(query)) {
    return next;
  }

  if (/prazo|quando|venc/.test(query)) {
    return 'Para a tarefa em foco, a referência exibida é: ' + selected.dueLabel + '. Confirme o prazo e execute a ação no módulo de origem.';
  }

  if (/responsavel|quem/.test(query)) {
    return 'Esta tela ainda não informa o responsável de cada pendência. Abra a tarefa no módulo de origem para verificar sua atribuição.';
  }

  return 'Nesta primeira versão, posso resumir a agenda, explicar a prioridade e indicar o próximo passo a partir das tarefas exibidas. Pergunte, por exemplo: "O que faço agora?"';
};
