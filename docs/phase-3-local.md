# Fase 3 — laboratório local de mídia

O usuário confirmou o login Google real e pediu para testar localmente antes de hospedar. O host futuro informado é Hostinger KVM 2: 2 vCPU, 8 GB RAM, 100 GB NVMe e 8 TB de transferência. Nenhum acesso à VPS, DNS, firewall ou implantação remota foi realizado. A capacidade para 15 participantes ainda depende de medição real.

## Executar no Windows

```powershell
npm ci
powershell -NoProfile -File tools/media-lab/setup-windows.ps1
npm run test:media
node tools/media-lab/smoke.mjs --check-ui
npm run media:lab
```

O setup baixa LiveKit 1.13.7 da release oficial e verifica SHA256 antes de extrair em `artifacts/media-lab/server`. Não instala serviço nem modifica o firewall. O laboratório usa Edge instalado; `MEDIA_LAB_BROWSER=chrome` seleciona Chrome instalado. Execute apenas uma instância do laboratório por vez: portas 17880/TCP, 17881/TCP e 17882/UDP.

No Windows, LiveKit roda nativamente, vinculado ao loopback. Docker Desktop apresentou conexão ICE intermitente: o teste sintético passou inicialmente e depois falhou, assim como a tela manual. Ambos passaram com o servidor nativo. Em outros sistemas o script contém alternativa Docker; ela ainda não foi homologada fora desta máquina.

## Teste manual

O comando abre dois contextos independentes no navegador, com os mesmos controles:

1. Clique **Conectar** nas duas janelas. Cada uma deve mostrar um participante remoto.
2. Use fones. Ligue um microfone por vez para evitar retorno; confira áudio na outra janela.
3. Ligue a câmera em uma janela e confira a imagem na outra. O navegador pede permissão; o laboratório não concede permissão automaticamente.
4. Clique **Compartilhar tela** e escolha uma fonte no seletor do navegador. Confira a imagem remota e pare pelo botão ou pelo indicador do navegador. Este teste não captura áudio do sistema.
5. Clique **Sair**. Confira os indicadores de câmera/microfone do sistema. Feche as duas janelas para encerrar o servidor. Há encerramento automático após 30 minutos.

Esse laboratório é separado do Electron e não representa canais de voz prontos no produto. Usa tokens próprios, curtos, restritos a uma sala temporária de dois participantes. Não usa sessão Supabase, não grava mídia e não fornece um endpoint de tokens no backend do Discorda. URLs locais aleatórias, validação Host/Origin, CSP e porta HTTP em loopback restringem o acesso. Chave administrativa fica no processo/configuração temporária e é removida ao terminar normalmente; nunca vai ao navegador. Não expor este laboratório na rede ou usá-lo em produção.

## Evidências

Em 28/09/2026, o teste automático com servidor nativo confirmou mídia bidirecional: cada cliente recebeu mais de 12 KB de áudio, vídeo e ao menos 14 frames decodificados. As tracks sintéticas terminaram após desconexão. O relatório de cada execução fica em `artifacts/media-lab/result.json`. A verificação da tela manual confirmou conexão, descoberta do outro participante e saída sem ativar hardware.

Ainda pendentes: microfone/câmera/tela físicos, captura pelo Electron empacotado, áudio do sistema, duas máquinas em redes distintas, TURN/TLS com UDP bloqueado e teste com 15 participantes. A parte remota da fase 3 fica adiada por decisão do usuário; o desenvolvimento local de canais/chat pode continuar sem afirmar que a mídia está homologada para produção.

Referências: [LiveKit local](https://docs.livekit.io/transport/self-hosting/local/), [release 1.13.7](https://github.com/livekit/livekit/releases/tag/v1.13.7), [portas e firewall](https://docs.livekit.io/transport/self-hosting/ports-firewall/).
