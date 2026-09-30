# 0008 — Monorepo e monólito modular pragmático

Status: Aceito pelo usuário em 28/09/2026.
Data: 28/09/2026.

## Context

Frontend, backend e infra pertencem ao mesmo produto pequeno. Os diretórios informados estão vazios.

## Decision

Propor monorepo com apps/desktop, services/backend, packages/contracts, infra e docs. Backend dividido em Api, Core e Infrastructure, organizado por features; contratos gerados por OpenAPI.

## Alternatives

Dois repositórios preservam separação física, mas exigem sincronizar contratos/releases. Microsserviços, CQRS framework e Kubernetes aumentam operação sem necessidade atual.

## Consequences

Mudanças conjuntas e documentação ficam mais simples, mantendo deployments independentes. Local do repositório depende da aprovação solicitada; nenhuma pasta existente foi movida.

## Referências

- [Arquitetura completa](../../ARCHITECTURE.md)

