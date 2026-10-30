# Motyq IQ · Exceções gerenciais (implantação controlada)

**Situação em 30/10/2026:** funcional na branch `feature/marketiq-mesa-workspace` como **simulação local**. Não foi autorizada a implantação de permissões ou a gravação de decisões no banco operacional.

## Fluxo de negócio

1. Mesa registra o **Repasse Sob Consulta** com oferta de revenda confirmada e dentro da validade, custos estimados de NF/impostos, despesas e margem por operação.
2. Mesa informa o valor pretendido para compra e salva a consulta.
3. Na mesma consulta, usa **Solicitar revisão gerencial**. O pedido grava um retrato da oferta, custos, teto técnico, valor solicitado, versão do caso e justificativa.
4. Gerente, autenticado em conta distinta, **aprova, contrapropõe ou recusa**, justificando a decisão.
5. O valor **decidido** é apresentado sem sobrescrever o preço técnico ou o valor inicialmente proposto.
6. Cada decisão gera evento versionado. Os relatórios gerenciais incluem pedido, teto original, valor decidido, diferença e responsável.
7. Alterações na consulta, na composição dos custos ou vencimento da oferta invalidam a decisão para aquela negociação. Nova versão requer novo pedido.

**Não há emissão de NF, compra efetivada, pagamento ou transferências nesta funcionalidade.**

## Status técnico atual

- Interface da Mesa: `components/MarketIqConsultedRepasse.tsx`.
- Caixa de solicitações e interface responsiva do gerente: `components/MarketIqApprovalCenter.tsx`.
- Regras de negócio, separação solicitante/decisor e log: `services/marketIqApprovalModel.ts`.
- Adaptador Firestore compartilhado: `services/marketIqApprovalCloud.ts`, **desabilitado por padrão**.
- Namespace próprio do recurso: `marketiq_preview_approvals_v1`.
- Regras de Firestore propostas e índices: `firestore.rules` / `firestore.indexes.json` na **branch de testes**.
- Testes: `scripts/marketiq-approval-tests.mjs`.
- Relatórios: aba **Exceções e decisões** do Painel Gerencial e exportação CSV da caixa de solicitações.

## Simulação local, sem banco

Abrir a URL da branch de testes com `?mesa=teste`, usar dados fictícios e:

1. Criar um Repasse Sob Consulta e salvar.
2. Selecionar **Solicitar revisão gerencial** e preencher o motivo.
3. Na caixa de solicitações, clicar **Simular tela do gerente**.
4. Aprovar, contrapropor ou recusar com justificativa. O resultado fica identificado como **SIMULAÇÃO**.
5. Voltar ao Repasse Sob Consulta e consultar o valor simulado vigente, que permanece distinto do teto técnico.
6. Ver o relatório na aba **Exceções e decisões** ou exportar CSV/log.

Todos esses dados ficam **somente neste navegador**. Não chegam ao gerente de outro dispositivo e podem ser apagados localmente. Nunca apresentar essas decisões como autorizações reais.

## Antes de ativar o compartilhamento real

1. Revisar e testar as regras de `marketiq_preview_approvals_v1` no emulador ou em **banco Firebase de homologação isolado**, incluindo casos negados: vendedor se autoaprovar, gerente de outra empresa/loja, modificação da proposta original, remoção de eventos e exclusão de registro.
2. Confirmar os índices das consultas por empresa/loja e solicitante.
3. Validar a autorização com **duas contas reais distintas**, uma da Mesa e outra gerente, em celulares/navegadores diferentes. Enviar uma solicitação e testar seu recebimento, resposta, revisão e histórico. Validar acesso e bloqueio de terceiros.
4. Implantar regras e índice no ambiente autorizado, sem alterar inadvertidamente outros módulos.
5. Somente depois definir `VITE_MARKETIQ_APPROVALS_CLOUD=true` **no ambiente preview correto**, realizar novo deploy e repetir os testes. Essa flag está desligada por padrão.
6. Antes de produção, definir política de retenção/backup, trilha de auditoria imutável no servidor, aprovação por alçada, notificações e verificação fiscal com a área responsável.
7. A promoção para produção requer autorização específica. A implantação de regras de Firestore não é executada em builds Vercel de preview (`VERCEL_ENV=preview`).

## Limitações intencionais

- O log da simulação local é **não auditável**, por ser editável no próprio navegador.
- A aplicação não calcula tributação fiscal de forma legal/automática; são custos e percentuais fornecidos pela Mesa e precisam de conferência da contabilidade.
- Uma aprovação gerencial nunca deve substituir a verificação física do veículo ou confirmar uma compra realizada.
- A média de anúncios indexados continua uma estimativa não auditada, não dado confiável para uma aprovação automática.
- Solicitações no ambiente compartilhado continuam sujeitas às regras do Firebase, não apenas aos botões da interface.
