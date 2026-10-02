# MOTYQ · Firebase produção

## Pré-requisito

Criar no GitHub Actions o secret **FIREBASE_SERVICE_ACCOUNT_JSON** com uma conta de serviço do projeto `gen-lang-client-0531247430`.

A conta deve ter apenas as permissões necessárias para:

- publicar Firestore Rules / indexes e Storage Rules;
- executar exportação e importação do banco;
- gravar e ler o bucket de backup.

## Publicação de regras

O workflow **Firebase Rules Deploy** roda quando `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json` ou `.firebaserc` mudam.

Também pode ser executado manualmente em **GitHub → Actions → Firebase Rules Deploy**.

A etapa só é considerada homologada depois de uma execução `success` no ambiente `production`.

## Backup

O workflow **Firestore Backup** é agendado diariamente às 06:15 UTC e também pode ser executado manualmente.

Destino padrão:

`gs://gen-lang-client-0531247430.firebasestorage.app/motyq-backups/<timestamp>`

O primeiro backup deve ser executado manualmente para confirmar permissões e compatibilidade do bucket.

## Restauração

Antes de restaurar:

1. interrompa alterações destrutivas no tenant afetado;
2. confirme o URI exato do backup;
3. valide o projeto e o database ID;
4. execute:

`./scripts/firestore-restore.sh gs://.../motyq-backups/<backup>`

5. acompanhe a operação no Google Cloud Console;
6. execute o **Diagnóstico DMS** após a restauração.

Nunca teste restauração pela primeira vez sobre produção. Use um projeto/ambiente de homologação.
