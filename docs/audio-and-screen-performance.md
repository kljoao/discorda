# Voz e desempenho das transmissões

## Processamento de voz

O microfone e as mensagens de áudio usam uma cadeia local, mono, a 48 kHz: cancelamento de eco na captura, supressão de ruído, filtro de graves a 75 Hz, volume de entrada e proteção suave de picos, seguidos de compressão leve. A chamada publica Opus com teto de 64 kbps, RED e DTX. Áudio de aplicativos e da transmissão não passa por esses filtros de voz.

Em **Configurações → Voz e microfone**, a supressão oferece:

- **Avançada · RNNoise**: padrão para quem mantinha a supressão ativada. Usa um modelo neural em AudioWorklet/WASM, no computador do usuário. Nenhum áudio é enviado a serviços de processamento.
- **Padrão**: filtro nativo do navegador, para comparação ou máquinas que precisem de uma opção mais leve.
- **Desativada**: preserva a opção de cancelamento de eco e os demais ajustes de voz.

O ganho automático pode ser desativado independentemente. O teste de microfone mostra o filtro efetivamente usado e informa quando é necessário voltar à alternativa padrão. Falhas ao carregar o modelo ou incompatibilidade de taxa não devem interromper a voz. O modo avançado desativa a supressão nativa na mesma entrada para evitar dois filtros de ruído em sequência.

Mensagens de áudio usam o mesmo processamento, com a ativação por voz e o modo pressionar para falar desligados durante a gravação, para preservar os trechos mais baixos. A chamada mantém esses controles e a proteção de expiração do atalho.

## Pontos corrigidos no compartilhamento

Antes, escolher uma resolução fixa de 1080p/60 com intenção automática usava `maintain-resolution`. Sob limitação, o WebRTC podia preservar a resolução reduzindo FPS. Agora, 60 fps prioriza `maintain-framerate`; o perfil de texto mantém a preferência explícita pela legibilidade.

Trocar a fonte substituía a trilha de captura sem atualizar o teto de bitrate, o limite de FPS e a preferência de degradação do transmissor RTP. Essas opções são reaplicadas, preservando a topologia negociada e o estado das camadas inativas. As camadas menores do modo automático também passam a aceitar 60 fps quando solicitado.

O painel de qualidade não usa mais simplesmente o primeiro relatório de saída de uma transmissão simulcast, que podia ser a camada menor. Ele escolhe a camada principal e reinicia o cálculo por intervalo quando muda o identificador do relatório.

O medidor do microfone deixa de atualizar o estado da sala inteira dez vezes por segundo quando as configurações estão fechadas. Isso evita renderizações desnecessárias da interface de transmissão. O contador de FPS exibidos também desconta os quadros descartados pelo reprodutor.

## Como investigar quedas restantes

No painel **Qualidade da transmissão**, compare o FPS exibido com o de envio/recepção, bitrate, perda, descarte e variação de chegada. No transmissor, quando o navegador oferece os dados, aparecem também FPS de captura e tempo de codificação por quadro.

- Captura baixa com envio acompanhando: verifique o aplicativo capturado, a GPU e a carga local. A taxa solicitada não obriga uma fonte parada a produzir 60 imagens diferentes por segundo.
- Captura adequada e limitação de CPU no envio: o codificador está sob pressão; compare 720p/60 e 1080p/60 e feche tarefas pesadas.
- Limitação por banda ou perda de pacotes: compare a conexão do transmissor, a do receptor e a rota até o servidor.
- Envio adequado e descarte na recepção: investigue decodificação e carga do computador de quem assiste.

Essas correções tratam configurações concretas do cliente; não demonstram a causa de uma sessão específica em produção. A seleção 1080p/60 representa uma meta de captura e um teto de codificação, não uma garantia independente de hardware, conteúdo, rede e receptor.

## Validação e distribuição

O teste `noise-suppression.spec.ts` mistura fala sintética com ruído branco determinístico, mede a atenuação, verifica que a fala continua presente e simula falha de carregamento do modelo. Há testes de pressionar para falar, retomada da entrada, gravação, limites do transmissor e seleção das métricas. O teste Electron também inicia o WASM e o AudioWorklet por `app://`, sob a política real de conteúdo do aplicativo. O compressor tem ganho unitário abaixo do limiar; não usa o ganho de compensação automático do `DynamicsCompressorNode`, que elevaria o ruído residual.

O teste sintético não substitui escuta com microfones reais e ambientes variados, nem estabelece equivalência com sistemas proprietários. O laboratório de mídia valida transmissão local e reconexão; não reproduz o jogo, o hardware ou a rede dos usuários.

Esta mudança é do desktop e não exige migração adicional do banco. Os binários WASM e as licenças são incluídos no pacote; não há dependência de CDN em tempo de execução.

Fontes técnicas: [RNNoise](https://github.com/xiph/rnnoise), [RNNoise WASM](https://github.com/shiguredo/rnnoise-wasm), [configuração de mídia LiveKit](https://docs.livekit.io/transport/media/advanced/).
