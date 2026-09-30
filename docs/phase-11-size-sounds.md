# 0.6.1 — Pacote menor e avisos de chamada

O espaço exibido pelo NSIS é o espaço instalado, não o tamanho do download.
A versão 0.6.0 indicava 514,8 MiB; a 0.6.1 fica em aproximadamente 402 MiB
(22% menor), com instalador de aproximadamente 126 MiB contra 140,2 MiB.

## Empacotamento

- Removida a segunda cópia das dependências JavaScript: Main/preload já usam esbuild e renderer usa Vite. ASAR cai de 69,5 MiB para cerca de 4 MiB.
- Os imports dinâmicos do SignalR são resolvidos estaticamente no build. Verificação no pacote real inclui presença/chat, não apenas o endpoint de saúde.
- Mantidos português brasileiro e inglês nos recursos do Electron; retirados os demais idiomas.
- Compressão máxima no instalador; avisos legais preservados em THIRD-PARTY-LICENSES.txt, gerados das dependências de produção instaladas.
- Verificador do pacote rejeita node_modules duplicado, requires dinâmicos não resolvidos do SignalR e tamanho instalado acima de 420 MiB.
- O runtime .NET continua incluído para captura de áudio funcionar sem instalação adicional. Trimming foi avaliado e descartado nesta versão: NAudio usa COM/reflection não compatíveis com remoção automática segura. Não foram suprimidos os avisos para forçar publicação.
- O próprio executável Electron mede aproximadamente 235 MiB. Chegar a 100 MiB instalados requer outra base ou build especializado; não se obtém isso comprimindo o instalador. Um protótipo WebView2/Tauri deve comprovar captura de tela, áudio por processo e 60 fps antes de considerar migração. O runtime compartilhado também ocupa espaço no Windows.

## Sons

Quatro sequências originais sintetizadas com Web Audio: entrada, saída, início e fim de compartilhamento de tela. Sem download de arquivos e sem sons copiados de outro aplicativo.

Avisos para o próprio usuário e outros participantes da sala atual. Usam a saída selecionada e volume próprio (padrão 50%, persistido nas configurações). 0% silencia; ensurdecer também. Eventos de áudio da tela, câmera, assinatura de trilha ou reconexão não repetem o aviso de tela. A entrada em uma sala com telas já publicadas não dispara uma sequência de avisos antigos. Falhas de som não interrompem a chamada.

## Validação

- 24 testes unitários e 3 testes de interface.
- Dois clientes Electron empacotados: sons sintetizados nos eventos locais/remotos, voz, volume por pessoa, câmera e tela a aproximadamente 60 fps na máquina de teste; fechamento das conexões ao sair.
- Captura nativa: mistura automática de aplicativos e exclusão da árvore de processo, isolamento medido superior a 60 dB.
- Perfil real: autenticação, presença com foto Google, permissões, teste de microfone, transmissão com som do PC, fixar/tela cheia e desconectar.

## Próximas prioridades propostas

1. Diagnóstico da transmissão com FPS efetivo, bitrate, perda de pacotes e gargalo de captura/rede/decodificação; ajuste automático preservando legibilidade e opção de 60 fps.
2. Atualização automática com assinatura, verificação de integridade e recuperação de falha.
3. Recuperação de dispositivos desconectados, suspensão do Windows e troca de rede durante chamadas.
4. Hospedagem da API/LiveKit e TURN para testar fora do Radmin, quando o grupo decidir sair do piloto local.
5. Administração da whitelist/convites pelo dono do grupo.

Atualizar com o Discorda fechado, instalando por cima. Esta versão não exige mudanças no servidor ou banco.
