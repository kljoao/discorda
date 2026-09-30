# 0001 — Electron com isolamento de processos

Status: Aceito pelo usuário em 28/09/2026.
Data: 28/09/2026.

## Context

Precisamos de integração com desktop, captura e distribuição Windows, preservando portabilidade.

## Decision

Usar Electron, TypeScript, React, Vite, Tailwind e shadcn/ui. Main controla integrações e refresh token; preload expõe IPC específico; renderer sandboxed controla UI e mídia. Assets locais, CSP e sem Node no renderer.

## Alternatives

Tauri reduziria parte do footprint, mas mudaria a stack solicitada e a matriz de mídia. Aplicação web simplificaria distribuição, com integração de captura diferente.

## Consequences

Consumo de memória e atualizações Chromium precisam de acompanhamento. Tracks e listeners têm proprietário e cleanup definidos. Windows é a primeira plataforma homologada.

## Referências

- [Arquitetura completa](../../ARCHITECTURE.md)
- [Documentação primária](https://www.electronjs.org/docs/latest/tutorial/security)

