# Motyq IQ · lançamento piloto oficial (31/10/2026)

O aplicativo Motyq existente permanece intacto; o **Motyq IQ** será acessível por navegação própria e `https://motyq.com.br/?iq=1` exclusivamente para contas autorizadas da empresa Abrão Reze.

- Inclui: FIPE gratuita, histórico agregado experimental, consulta de anúncios indexados não auditados, painel gerencial e repasse sob consulta.
- Preserva a navegação do Motyq GO e isola o IQ dos widgets de vendedor.
- Esta publicação NÃO incorpora alterações não relacionadas do ramo de testes de 114 commits.
- NÃO modifica `firestore.rules`, `firestore.indexes.json` ou `storage.rules`.
- A publicação de regras Firestore via build fica desabilitada sem autorização explícita: `MOTYQ_EXPLICIT_FIRESTORE_RULES_RELEASE=true`.
- Aprovação gerencial é **simulação local**, não decisão real e não comunicação entre usuários.
- Consultas e históricos em navegador são locais, sem backup de servidor.
- API AutoAvaliar NÃO está conectada. Importação de planilhas é manual.
- A pesquisa de mercado usa anúncios indexados provisórios, não anúncios auditados.
- O modelo histórico piloto foi calibrado com 223 compras, e exige revisão contínua.
- Não efetua compras, pagamentos, emissão de nota fiscal ou alterações reais de permissões.

Rollback operacional: reatribuir o deployment de produção anterior na Vercel se necessário.
