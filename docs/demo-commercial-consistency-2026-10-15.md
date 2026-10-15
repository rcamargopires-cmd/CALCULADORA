# Motyq Demo Motors: consistência comercial (15/10/2026)

## Diagnóstico estático
- `ExecutiveDashboard.tsx` substitui estoque vazio por `demoStockRows()`, mas as telas de estoque usam a base operacional. Isso gera 18 veículos e capital fictício no dashboard com zero no estoque.
- `demoSeedService.seedStock()` tenta persistir 18 registros em `operational_stock`. É necessário investigar leitura, filtros, migração, regras e eventual erro de seed antes de reexecutar.
- `seedSales()` grava vendas agregadas em `operational_sales` por vendedor, sem vínculo obrigatório com pedidos formais, passagens e veículos. `seedFormalDms()` cria quatro pedidos formais separados, de modo que os totais podem divergir.
- `seedQueueAndCrm()` cria 19 passagens de demonstração e propostas em algumas; verificar se foram persistidas e aparecem na interface.
- `demoPerformanceSnapshots()` cria mapas de desempenho independentes das vendas e dos pedidos reais da demo.

## Critérios de aceite (ambiente demo somente)
1. Estoque atual é uma única fonte de verdade; 18 placas únicas, 18 registros atuais, zero duplicados; dashboard, estoque manual e vitrine reconciliados.
2. Passagens CRM visíveis para seus vendedores e gestores; clientes e contatos fictícios claramente marcados como demonstração.
3. Propostas e pedidos formais referenciam passagens, vendedores, clientes e veículos existentes; vendas faturadas/entregues não permanecem no estoque atual.
4. Mapa de desempenho usa a mesma definição de vendas e período que os pedidos formais. Se metas e histórico forem sintéticos, rotular explicitamente.
5. Reconciliação por vendedor: passagens -> propostas -> pedidos -> vendas; discrepâncias explicadas.
6. Operações restritas a `motyq-demo` / `motyq-demo-principal`; nenhuma alteração em Abrão Reze.
7. Não executar `resetAndSeed()` nem publicar em produção sem backup, inspeção de registros e testes de regressão.

## Sequência de correção
- Inventariar documentos demo por coleção e status, somente leitura.
- Definir modelo canônico e vínculos de IDs.
- Construir migração idempotente e com dry-run.
- Testar no emulador ou ambiente de homologação.
- Executar migração autorizada e comparar relatórios antes/depois.
