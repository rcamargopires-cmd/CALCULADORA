# MOTYQ · Checklist de entrada em produção

Este checklist separa **código pronto** de **credenciais/homologações externas**.

## 1. Aplicação

- [x] CI com typecheck, testes e build.
- [x] Quality Gate.
- [x] Diagnóstico DMS por tenant.
- [x] Monitoramento de erros.
- [x] Monitoramento de performance.
- [x] Migrações versionadas.
- [x] Ambiente demo isolado.
- [x] Exportação de auditoria.
- [x] Testes comportamentais dos fluxos críticos.

## 2. Firebase

- [x] `firestore.rules` versionado.
- [x] `storage.rules` versionado.
- [x] `firestore.indexes.json` versionado.
- [x] Workflow de publicação criado.
- [ ] Adicionar `FIREBASE_SERVICE_ACCOUNT_JSON` aos GitHub Actions.
- [ ] Executar **Firebase Rules Deploy** e obter `success`.
- [ ] Executar primeiro **Firestore Backup** manual.
- [ ] Confirmar arquivo no bucket de backup.
- [ ] Testar restauração em ambiente separado de homologação.

## 3. Cobrança recorrente

- [x] Cliente e assinatura mensal Asaas.
- [x] Webhook idempotente.
- [x] Atualização automática de pagamento/vencimento.
- [x] Bloqueio por inadimplência já integrado ao BillingGate.
- [ ] Configurar `ASAAS_API_KEY`.
- [ ] Configurar `ASAAS_WEBHOOK_TOKEN`.
- [ ] Confirmar `ASAAS_ENVIRONMENT=sandbox`.
- [ ] Criar assinatura teste.
- [ ] Simular pagamento/atraso no Sandbox.
- [ ] Somente depois usar `production`.

## 4. Fiscal NF-e

- [x] Integração Focus NFe server-side.
- [x] Emissão, consulta e cancelamento.
- [x] Vínculo da NF-e ao Pedido de Venda.
- [x] Chave, protocolo, DANFE e XML sincronizados.
- [x] Diagnóstico de inconsistência fiscal.
- [x] Bloqueio de faturamento financeiro sem NF-e autorizada quando a integração está ativa.
- [ ] Configurar `FOCUS_NFE_TOKEN` ou `FOCUS_NFE_TOKENS_JSON`.
- [ ] Configurar certificado/empresa no provedor.
- [ ] Homologar payload tributário com contador.
- [ ] Emitir, consultar e cancelar documento de homologação.
- [ ] Somente depois habilitar ambiente Produção.

## 5. Piloto real

- [ ] Cadastrar uma empresa piloto.
- [ ] Criar usuários reais por função.
- [ ] Importar estoque real.
- [ ] Rodar Diagnóstico DMS e chegar a zero críticos.
- [ ] Simular ciclo completo: lead → proposta → compra/troca → preparação → venda → crédito → NF-e → financeiro → entrega → pós-venda.
- [ ] Simular cancelamento/estorno.
- [ ] Validar fechamento financeiro diário.

## 6. Expansão OEM

Integrações com montadoras não bloqueiam a operação do DMS de seminovos. Cada fabricante exige contrato, especificação e credencial próprios. O framework deve ser conectado somente depois da definição das montadoras prioritárias.
