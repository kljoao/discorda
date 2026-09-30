# 0002 — Google Desktop OIDC, PKCE e sessões próprias

Status: Substituído pelo [ADR 0010](0010-supabase-authentication.md). Supabase Auth assume OAuth, emissão e renovação de tokens; a API mantém autorização e revogação local.
Data: 28/09/2026.

## Context

Login precisa ser simples, exclusivo a contas autorizadas e sem secret confiável distribuído no desktop.

## Decision

Navegador do sistema, cliente Desktop e loopback efêmero com state, nonce e PKCE S256. Transação vinculada no .NET; Main encaminha code/verifier para troca e validação no backend. Whitelist antes de emitir access token próprio de 5 minutos; refresh rotativo no cofre do Main. Vincular identidade por issuer/sub.

## Alternatives

Custom URI exige registro e proteção contra interceptação. Broker web com callback HTTPS e handoff adiciona mecanismo de entrega. Supabase Auth reduziria código, mas introduziria outra autoridade de sessão.

## Consequences

Validar o fluxo Google real cedo. Biblioteca OIDC/JOSE mantida, transações de uso único e proteção a replay são obrigatórias. Nenhum token Google é usado como sessão da API. Linux sem cofre seguro não persiste refresh.

## Referências

- [Arquitetura completa](../../ARCHITECTURE.md)
- [Documentação primária](https://developers.google.com/identity/protocols/oauth2/native-app)

