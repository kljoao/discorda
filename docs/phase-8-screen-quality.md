# Compartilhamento e permissões — 0.4.0

## Uso
Atualize todos os participantes para 0.4.0. O host continua iniciando API/LiveKit pelo atalho existente, com Radmin conectado.

Em Compartilhar tela, selecione resolução (720p, 1080p, 1440p ou 4K), 30/60 fps e uma janela/tela. Padrão: 1080p60. Os valores são limites de captura; uma janela menor mantém seu tamanho. A transmissão prioriza resolução, podendo reduzir fluidez quando faltar banda/CPU. Não há garantia de imagem sem perdas.

Orçamentos máximos a 60 fps: 8/20/30/50 Mbps, respectivamente; 30 fps utiliza 70% desses limites. O codec é H.264 quando disponível, VP8 como alternativa. Compartilhamento não usa simulcast de baixa resolução; câmeras mantêm adaptação. Cada espectador exige banda de saída do servidor, mesmo que o transmissor envie apenas uma cópia. O indicador na tela mostra dimensões e quadros efetivamente exibidos, podendo cair em conteúdo parado.

Para som, marque Compartilhar áudio de um aplicativo e escolha o jogo/navegador. Captura nativa Windows WASAPI IncludeProcessTree, estéreo 48 kHz, publicação Opus até 192 kbps. Discorda, Discord e shells não aparecem na lista; não existe captura alternativa do áudio geral do Windows. O processo escolhido é validado por PID + instante de início, evitando reutilização de PID. Captura para ao sair/parar tela/encerrar processo e possui watchdog de 7 segundos.

Requer Windows build 20348+ (Windows 11 atende). Windows 10 comum pode compartilhar vídeo, mas não esse modo de áudio. Todas as abas/processos filhos do navegador escolhido podem ser ouvidos: se usar Discord web, mantenha-o em outro navegador. A captura é por aplicativo, não por aba/janela de áudio.

Em Ajustar microfone, Autorizar microfone e câmera solicita acesso e testa brevemente os dispositivos, desligando-os em seguida. Os botões Microfone/Câmera no Windows abrem as páginas oficiais de privacidade. Se o Windows bloquear acesso de aplicativos desktop, o usuário precisa habilitá-lo ali; o aplicativo não altera consentimentos silenciosamente.

## Build
npm run package:win --workspace @discorda/desktop

Requer PowerShell 7, .NET SDK 10 e runtimes redistribuíveis Visual C++ x64 assinados pela Microsoft instalados na máquina de build. tools/build-windows-audio.ps1 publica helper autocontido e inclui runtimes app-local. O destinatário não precisa instalar .NET/SDK. Fontes e packages.lock.json versionados; binários gerados ignorados. Recursos nativos ficam fora do asar em resources/windows-audio, acompanhados de avisos de terceiros.

## Verificação em 29/09/2026
- 18 testes unitários e 3 testes de interface.
- tools/media-lab/application-audio-smoke.mjs: dois processos Edge independentes com tons artificiais. Captura 440 Hz do processo escolhido e exclui 1100 Hz do outro, com separação medida de 103 dB.
- tools/media-lab/desktop-smoke.mjs: dois Electron trocando RTP real via HTTPS/WSS/LiveKit. Janela animada capturada em 1904 × 1066; recepção sustentada de 59,8 fps por 10 segundos. Minimizar preserva chamada; sair fecha conexões.
- Integração real com Supabase/whitelist: permissões com dispositivos sintéticos, medidor, roster, câmera, captura real de janela, áudio de aplicativo com energia não nula na fonte WebRTC, fixar/tela cheia/parar.
- Não equivale a teste de 4K60 ou de conexão entre duas redes; validar perfil escolhido com os amigos via Radmin.
