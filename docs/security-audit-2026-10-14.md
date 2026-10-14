# Motyq: auditoria de segurança (14/10/2026)

Revisão estática preliminar. Não é pentest, nem validação de regras publicadas em produção.

## Achados

- **Alta (confirmada no repositório):** `storage.rules`, caminho `marketiq/{companyId}/{storeId}/...`, permitia leitura e gravação por qualquer conta autenticada, sem conferir empresa ou loja. Correção proposta nesta branch: `allowedStore(companyId,storeId)`. **Confirmar antes do deploy** que os perfis de avaliador e administrador operam corretamente e que as regras de Storage estão efetivamente publicadas.
- **Alta (risco de elevação de privilégio):** `firestore.rules` permitia que gestores com `canUsersManage()` atualizassem seu próprio documento de usuário, inclusive atributos de papel e permissões. Correção defensiva inicial: impedir autoatualização nesse caminho. Ainda falta impor whitelist de campos e garantir integridade em todos os endpoints e fluxos.
- **Média (exposição potencial):** `/config/{document}` concede leitura ampla para usuários ativos (exceto alguns papéis). Revisar classificação e segregação por tenant, sem restringir arbitrariamente documentos necessários à operação.
- **Média (integridade):** caminhos legados com fallback de `companyId` e `storeId` devem ser migrados e validados antes de endurecer o isolamento.
- **A verificar:** `server/motyqFirestore.ts` usa credencial de serviço no backend. Conferir controle de acesso por endpoint, logs, variáveis da Vercel, limites de taxa e ausência de exposição de credenciais.
- **A verificar:** backups do Firestore, MFA para administradores, Firebase App Check, política de retenção LGPD, dependências, CI e testes com duas empresas.

## Testes necessários antes de mesclar

1. Usuário da empresa A não pode ler/gravar fotos `marketiq` da empresa B (Storage emulator).
2. Usuário autenticado inativo não pode ler perfil no Firestore.
3. Gestor não pode editar o próprio papel/permissões via Firestore direto.
4. Gestor consegue administrar outro usuário da mesma empresa apenas dentro dos campos autorizados.
5. Avaliador consegue anexar fotos de vistoria apenas na própria loja.
6. Nenhuma regra nova quebra o fluxo de avaliação, estoque, financeiro e documentos.
7. Conferir que regras implantadas correspondem ao repositório; regras locais não garantem proteção em produção.

**Não publicar automaticamente.**
