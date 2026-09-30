# 0004 — SignalR para eventos da aplicação

Status: Aceito pelo usuário em 28/09/2026.
Data: 28/09/2026.

## Context

Chat, presença e ocupação de canais precisam de atualização rápida sem transportar mídia pelo backend.

## Decision

REST para comandos persistentes; SignalR para eventos, typing e presença. Persistir antes de notificar, deduplicar por ID/version e ressincronizar via REST. Uma conexão por sessão, grupos autorizados e heartbeat com lease.

## Alternatives

WebSocket próprio exige framing/reconnect adicionais. Supabase Realtime criaria segunda fonte de eventos. Outbox fica adiada até entrega imediata durável ser requisito.

## Consequences

SignalR não garante replay nem substitui histórico. Polling leve do canal aberto recupera falha entre commit e broadcast. Revogação precisa atuar nas conexões/grupos e envio, além de negar novos comandos.

## Referências

- [Arquitetura completa](../../ARCHITECTURE.md)
- [Documentação primária](https://learn.microsoft.com/aspnet/core/signalr/authn-and-authz)

