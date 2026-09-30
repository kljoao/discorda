# Contratos

A API ainda não expõe endpoints de negócio. `/health/live` e `/health/ready` são sondas operacionais com resposta textual mínima.

Os tipos REST serão gerados a partir do OpenAPI quando os primeiros endpoints autenticados entrarem na fase 2. Não manter cópias manuais das entidades EF neste diretório. Contratos de IPC atuais ficam em `apps/desktop/src/shared/ipc/contracts.ts` e não são contratos REST.
