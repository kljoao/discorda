# Assistir, ouvir e encontrar conteúdo

## Janela flutuante

Na transmissão, escolha **Abrir em outra janela**. A janela oferece **Modo compacto**, **Sempre no topo**, **Tela cheia** e **Voltar ao Discorda**. O modo compacto reduz a janela; “Sempre no topo” é independente e pode ser desligado. Há uma janela destacada por vez. Encerrar a transmissão ou a chamada fecha o visualizador.

O vídeo destacado permanece sem áudio próprio: o mixer da chamada reproduz o som uma única vez. O controle da janela altera o mesmo volume da transmissão na interface principal. Os controles nativos de janela estão disponíveis no aplicativo desktop.

## Voz e som compartilhado

Cada pessoa mantém volumes separados de **Voz** e **Som compartilhado**. Clique no participante para abrir os ajustes. A transmissão também possui volume e **Silenciar transmissão** no próprio bloco e na janela flutuante. Esse botão não silencia a voz da pessoa nem apaga o volume escolhido; **Ouvir transmissão** restaura a reprodução. As preferências ficam salvas localmente por servidor e participante.

## Perfis de captura

- **Automático:** equilíbrio, até 1080p e 60 fps, com camadas para adaptação de quem recebe.
- **Jogos:** até 1080p e 60 fps, priorizando fluidez.
- **Filmes:** até 1080p e 30 fps, priorizando vídeo em movimento.
- **Texto e código:** 1440p e 30 fps, priorizando nitidez.

Escolher um perfil preenche resolução e FPS, que ainda podem ser ajustados antes de compartilhar. O som exige ativação explícita. Uma troca de fonte durante a transmissão preserva as configurações existentes. Os indicadores no vídeo mostram resolução e quadros efetivamente exibidos; a configuração de captura não garante essa entrega, que depende da máquina e da rede. Uma imagem estática pode produzir menos quadros.

## Áudio e reconexão de dispositivos

O diagnóstico da chamada indica captura encerrada, ausência prolongada de sinal, sensibilidade possivelmente cortando a voz, envio parado, perda de pacotes ou reprodução suspensa. **Retomar e testar som** tenta reativar a saída e reproduz um aviso nos fones. **Abrir ajustes de áudio** permite selecionar entrada e saída e usar os testes guiados.

Silêncio não prova falha de microfone: a dica orienta a verificar entrada, mute físico e permissões se a pessoa estiver falando. O aplicativo não pode conceder permissões do Windows sozinho.

Desconectar um dispositivo não apaga sua preferência. O app usa a saída padrão temporariamente e tenta restaurar os fones preferidos quando reaparecem. Ao recuperar o microfone preferido, mantém a captura silenciada até a pessoa ativá-la. Reconhecimento depende de o sistema manter o identificador do dispositivo.

## Desde sua última visita

O botão da barra de canais reúne canais não lidos, menções e respostas pendentes, fixadas recentes e transmissões informadas pelo servidor. A seleção de uma transmissão entra na respectiva sala; abrir o painel sozinho não entra em chamadas.

As fixadas cobrem o período desde a consulta anterior, limitado a 30 dias; a primeira consulta usa sete dias. O painel mostra até 20 fixadas e 50 itens da caixa de entrada, cujo histórico completo continua acessível separadamente. O estado de transmissão é reconciliado pelo servidor e pode levar alguns segundos para atualizar.

Abrir o painel ou pedir para navegar a uma mensagem não a marca imediatamente como lida. Um item da caixa de entrada é marcado quando a mensagem aparece por pelo menos 750 ms, com a janela em foco e sem um modal ou proteção de transmissão cobrindo a conversa. Também é possível marcá-lo manualmente na caixa de entrada.

## Busca

Abra a lupa do chat e selecione canal, pessoa, datas e tipo de arquivo. Os filtros funcionam sem palavras-chave; palavras procuram no texto e nos nomes de anexos. Datas usam UTC, incluindo todo o último dia escolhido. Os tipos são classificados pela extensão, não por inspeção do conteúdo.

Os resultados trazem prévia textual, anexos e **Abrir no contexto**, que carrega até 25 mensagens anteriores e 25 posteriores ao resultado. Imagens compatíveis podem ser visualizadas pelo controle existente de anexos. A busca respeita autorização e canais arquivados, exclui mensagens removidas e pagina em lotes de 50.

Atualize o backend antes de distribuir o desktop com novidades e filtros. Os recursos de servidor desta etapa utilizam o esquema existente; continuam necessárias as migrações das etapas anteriores ainda não implantadas.
