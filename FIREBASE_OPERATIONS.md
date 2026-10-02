# MOTYQ · Firebase produção

## Pré-requisito

Criar no GitHub Environment **production** o secret **FIREBASE_SERVICE_ACCOUNT_JSON** com uma conta de serviço do projeto `gen-lang-client-0531247430`.

Opcionalmente, crie os secrets **FIREBASE_PROJECT_ID**, **FIREBASE_DATABASE_ID** e **FIREBASE_BACKUP_BUCKET**. Sem eles, os workflows usam os valores atuais de produção.

Para homologação separada, crie um GitHub Environment **staging** com os mesmos nomes de secrets apontando para o projeto de homologação.

A conta deve ter apenas as permissões necessárias para:

- publicar Firestore Rules / indexes e Storage Rules;
- executar exportação e importação do banco;
- gravar e ler o bucket de backup.

## Publicação de regras

O workflow **Firebase Rules Deploy** roda em produção quando `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json` ou `.firebaserc` mudam.

Também pode ser executado manualmente em **GitHub → Actions → Firebase Rules Deploy**, escolhendo `production` ou `staging`.

A etapa só é considerada homologada depois de uma execução `success` no ambiente escolhido.

## Backup

O workflow **Firestore Backup** é agendado diariamente às 06:15 UTC e também pode ser executado manualmente. Ele aguarda o término da exportação: o workflow só fica verde se o backup terminar sem erro.

Destino padrão:

`gs://gen-lang-client-0531247430.firebasestorage.app/motyq-backups/<timestamp>`

O primeiro backup deve ser executado manualmente para confirmar permissões e compatibilidade do bucket.

## Restauração

Antes de restaurar:

1. interrompa alterações destrutivas no tenant afetado;
2. confirme o URI exato do backup;
3. valide o projeto e o database ID;
4. execute:

`MOTYQ_RESTORE_CONFIRM=RESTORE ./scripts/firestore-restore.sh gs://.../motyq-backups/<backup>`

5. acompanhe a operação no Google Cloud Console;
6. execute o **Diagnóstico DMS** após a restauração.

Nunca teste restauração pela primeira vez sobre produção. Use um projeto/ambiente de homologação.
