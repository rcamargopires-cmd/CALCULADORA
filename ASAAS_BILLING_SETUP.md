# MOTYQ · Cobrança recorrente Asaas

A integração do código cria um cliente e uma assinatura mensal no Asaas e processa eventos de pagamento por webhook.

## Variáveis Vercel

Configure no ambiente de produção:

- `ASAAS_API_KEY`: chave da API Asaas;
- `ASAAS_ENVIRONMENT`: `sandbox` para homologação ou `production` para cobrança real;
- `ASAAS_WEBHOOK_TOKEN`: token forte exclusivo do webhook, diferente da API Key;
- `FIREBASE_SERVICE_ACCOUNT_JSON`: já usado pelas rotas server-side do MOTYQ.

## Webhook

Cadastre no Asaas:

`https://<dominio-producao>/api/integrations`

Eventos mínimos:

- PAYMENT_CREATED
- PAYMENT_UPDATED
- PAYMENT_CONFIRMED
- PAYMENT_RECEIVED
- PAYMENT_OVERDUE
- PAYMENT_REFUNDED
- PAYMENT_DELETED

Configure o mesmo valor de `ASAAS_WEBHOOK_TOKEN` como token de autenticação do webhook.

## Homologação

1. Use `ASAAS_ENVIRONMENT=sandbox`.
2. Na Central Master, selecione provedor **Asaas**.
3. Clique em **ATIVAR RECORRÊNCIA ASAAS**.
4. Confirme que `externalCustomerId` e `externalSubscriptionId` foram gravados.
5. Simule um pagamento no Sandbox.
6. Confirme que o webhook atualizou `lastPaidAt`, `nextDueAt` e o link de pagamento.
7. Só depois altere o ambiente para `production`.

A criação da assinatura não é tratada como pagamento. O MOTYQ atualiza o estado financeiro apenas pelos eventos recebidos do Asaas.
