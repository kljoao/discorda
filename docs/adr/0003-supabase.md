# 0003 — Supabase como PostgreSQL gerenciado

Status: Alterado parcialmente pelo [ADR 0010](0010-supabase-authentication.md). Supabase fornece PostgreSQL e Auth. Usar o plano Free, com pooler compartilhado para IPv4, sem adicionais pagos.
Data: 28/09/2026.

## Context

O usuário deseja Supabase e mantém o backend como autoridade de negócio.

## Decision

Usar somente PostgreSQL no início, EF Core/Npgsql, schema privado, role mínima e migrations versionadas. Conexão TLS direta ou pooler session em IPv4-only. Sem acesso do Electron ao banco.

## Alternatives

PostgreSQL na VPS elimina assinatura externa, mas aumenta operação e compartilha falha com mídia. Supabase Auth/Realtime duplicariam responsabilidades já atribuídas ao .NET/SignalR.

## Consequences

Dependência externa e latência regional; backup/restore continuam responsabilidade operacional. Free serve a piloto com limitações aceitas. Storage privado pode ser introduzido posteriormente.

## Referências

- [Arquitetura completa](../../ARCHITECTURE.md)
- [Documentação primária](https://supabase.com/docs/guides/database/connecting-to-postgres)

