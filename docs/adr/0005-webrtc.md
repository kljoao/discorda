# 0005 — WebRTC e lifecycle explícito de mídia

Status: Aceito pelo usuário em 28/09/2026.
Data: 28/09/2026.

## Context

Voz, webcam e tela simultâneas exigem transporte de baixa latência e capacidades consolidadas.

## Decision

Usar WebRTC pelo SDK LiveKit JS. Microfone, câmera, tela e áudio da tela são tracks distintas. Opus para voz; VP8 baseline com alternativas medidas. SDK conduz signaling, ICE, negociação e reconexão.

## Alternatives

Enviar mídia por SignalR seria inadequado. Implementar codecs/transporte próprios viola o princípio do projeto. Mesh não será etapa intermediária.

## Consequences

DTLS-SRTP protege transporte, não constitui E2EE entre usuários através da SFU. CPU/decode e permissões variam por cliente. Todo dispositivo/track tem cleanup e fallback.

## Referências

- [Arquitetura completa](../../ARCHITECTURE.md)
- [Documentação primária](https://docs.livekit.io/transport/media/advanced/)

