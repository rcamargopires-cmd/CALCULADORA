# MOTYQ · Integração fiscal NF-e

## Provedor implementado

O MOTYQ possui adaptador server-side para **Focus NFe** no endpoint consolidado:

`POST /api/integrations`

A integração nunca expõe o token fiscal no navegador.

## Variáveis de ambiente

Use uma destas opções no ambiente da Vercel:

### Empresa única / token padrão

- `FOCUS_NFE_TOKEN`
- `FOCUS_NFE_ENVIRONMENT=homologacao` ou `producao`

### Multiempresa

- `FOCUS_NFE_TOKENS_JSON`

Exemplo:

```json
{
  "empresa-a": "TOKEN_EMPRESA_A",
  "empresa-b": "TOKEN_EMPRESA_B"
}
```

O mapa é indexado pelo `companyId` do tenant.

## Funcionamento

1. Na Central Master, ative **Integração fiscal**.
2. Selecione **Focus NFe**.
3. Comece sempre em **Homologação**.
4. No Pedido de Venda liberado para faturamento, abra **Fiscal / NF-e**.
5. Revise o payload fiscal.
6. Complete a tributação definida pelo contador da empresa.
7. Envie a NF-e.
8. Consulte até o documento ficar autorizado.
9. Somente depois conclua o faturamento financeiro do Pedido de Venda.

Quando a integração Focus NFe está ativa, o MOTYQ bloqueia o faturamento financeiro se a NF-e integrada ainda não estiver autorizada.

## Segurança tributária

O MOTYQ preenche dados comerciais básicos, mas **não inventa NCM, CFOP, CST/CSOSN, ICMS, PIS, COFINS ou enquadramento tributário**.

Essas regras devem ser parametrizadas/validadas pelo contador ou responsável fiscal da empresa antes da produção.

## API Focus NFe utilizada

- autenticação HTTP Basic com o token como usuário e senha vazia;
- homologação: `https://homologacao.focusnfe.com.br`;
- produção: `https://api.focusnfe.com.br`;
- emissão: `POST /v2/nfe?ref=<referencia>`;
- consulta: `GET /v2/nfe/<referencia>?completa=1`;
- cancelamento: `DELETE /v2/nfe/<referencia>`.

A referência é gerada a partir do Pedido de Venda do MOTYQ.

## Homologação obrigatória antes da produção

Antes de mudar a empresa para `producao`:

1. cadastrar/configurar a empresa e certificado no provedor;
2. emitir uma NF-e de homologação válida;
3. validar autorização, chave, protocolo, DANFE e XML;
4. validar uma rejeição proposital e a mensagem exibida no MOTYQ;
5. validar cancelamento em homologação;
6. confirmar com o contador o payload/tributação usado pela loja;
7. só então mudar o ambiente no MOTYQ para Produção.

## Observação

A integração fiscal é assíncrona quando a SEFAZ/provedor retorna processamento pendente. O usuário pode usar **CONSULTAR** no painel fiscal até a autorização.
