# 0009 — Captura Windows primeiro e capacidades por plataforma

Status: Aceito pelo usuário em 28/09/2026.
Data: 28/09/2026.

## Context

Tela 1080p com áudio varia entre SO, versão Electron, permissões e hardware; loopback pode capturar a própria chamada.

## Decision

Homologar Windows primeiro, seleção explícita monitor/janela, até 1080p/30 e tracks separadas. Main autoriza captura selecionada; renderer publica pelo SDK. Exibir suporte real e fallback sem áudio. 60 FPS só após medição.

## Alternatives

Prometer paridade automática nos três SOs seria arriscado. Drivers virtuais automáticos e módulos nativos prematuros aumentariam manutenção e permissões.

## Consequences

Áudio de janela pode ser áudio global. Headphones não resolvem retorno digital. Exigir isolamento testado, saída separada ou desativação de áudio de tela nesse cenário. Testar app empacotado, especialmente permissões macOS/PipeWire.

## Referências

- [Arquitetura completa](../../ARCHITECTURE.md)
- [Documentação primária](https://www.electronjs.org/docs/latest/api/desktop-capturer)


## Atualização em 29/09/2026
Implementação 0.4.0 validou 59,8 fps sustentados entre dois clientes na janela de teste em 1904 × 1066. Perfis até 4K60 disponíveis, com banda configurada e resolução real exibida. Áudio global substituído por helper WASAPI que inclui somente a árvore do aplicativo escolhido; Discord/Discorda e shells bloqueados, sem fallback para loopback geral. Requer Windows build 20348+. Discord web deve usar outro navegador. Ver [validação e limites](../phase-8-screen-quality.md).
