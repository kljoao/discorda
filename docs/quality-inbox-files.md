# Transmissão, caixa de entrada e arquivos

## Qualidade para cada espectador

Abra **Qualidade da transmissão → Qualidade para você** em uma tela recebida:

- **Automática** reduz uma camada após dois intervalos ruins de dois segundos. Recupera uma camada após dez intervalos bons. Considera perda de pacotes, quadros descartados e jitter.
- **Nitidez máxima** solicita a camada mais alta disponível. O tamanho do player e o controle de congestionamento do LiveKit continuam valendo.
- **Economizar dados** limita a recepção à camada mais baixa enviada.

Isso altera apenas sua assinatura da transmissão, sem modificar a qualidade dos demais espectadores ou a captura do apresentador. As opções dependem de camadas simultâneas no envio; com uma camada única, selecione o perfil Automático no computador que transmite. O limite não garante uma resolução ou FPS fixos.

## Caixa de entrada

O botão na lateral reúne menções, respostas e mensagens novas em tópicos seguidos. Use **Seguir tópico** no painel do tópico para acompanhar; clique novamente para parar. Acompanhar não notifica sobre mensagens antigas.

As notificações são gravadas na mesma transação da mensagem, com chave única por destinatário e mensagem. Uma menção que também seja resposta aparece apenas uma vez. Cada pessoa pode consultar e marcar somente sua própria caixa. Mensagens excluídas e canais arquivados não aparecem. A leitura é guardada no servidor, inclusive após reinstalar o cliente. A caixa começa a registrar atividades após a migração desta funcionalidade; não há preenchimento retroativo.

As páginas têm até 50 itens. O cliente limita os itens mantidos em memória e suspende a atualização periódica ao consultar páginas anteriores. **Abrir mensagem** abre o canal ou a resposta específica no tópico.

## Anexos

Use **+**, arraste um arquivo ao chat ou cole uma imagem com **Ctrl+V**. Confira nome, tamanho e, quando suportado, a miniatura antes de confirmar **Enviar arquivo**. O limite é 8 MiB por arquivo e um envio de cada vez. Prévias aceitam PNG, JPEG e WebP estáticos dentro dos limites de dimensões existentes; outros formatos continuam disponíveis como arquivos.

O progresso mede os bytes encaminhados ao transporte. A etapa final aguarda a confirmação do servidor. **Cancelar** interrompe o cliente, mas não pode desfazer uma gravação já confirmada pelo servidor; nesse caso, exclua a mensagem. Uma falha permite tentar o mesmo arquivo com a mesma identidade, evitando mensagens duplicadas.

Arquivos pendentes ficam apenas na memória do processo principal, vinculados à sessão e a um identificador aleatório. Tokens deixam de funcionar após troca de sessão, cancelamento ou expiração. O renderer não recebe tokens de autenticação nem acesso arbitrário a caminhos locais.

O proprietário encontra **Arquivos do grupo** no painel de operação: uso da cota, tamanho, data e remoção individual com confirmação. Remover revoga o download e preserva uma indicação no histórico. A operação fica na auditoria. Liberar a cota lógica não necessariamente reduz imediatamente o arquivo físico do PostgreSQL, que reutiliza espaço internamente.

## Dicas durante chamadas

O cliente compara intervalos de áudio local e recepção a cada dois segundos. Após sinais repetidos, exibe dicas sobre entrada interrompida, voz bloqueada pelo limite de ativação, envio aparentemente parado, saída ausente ou perda de pacotes. O botão leva aos ajustes de áudio. Push-to-talk, mute e silêncio não são tratados como falha de transmissão. Estatísticas indisponíveis são inconclusivas.

Essas dicas são locais; áudio, nomes de dispositivos e métricas não são enviados como telemetria. Teste com fones reais e uma segunda máquina para avaliar problemas específicos de drivers e rede.

## Implantação

Atualize o backend antes do cliente: há migrações para `inbox_entries` e `thread_follows`, além de novas permissões do usuário de runtime. O fluxo `bash tools/vps.sh start` aplica migrações e concessões. A publicação do instalador não atualiza automaticamente a VPS.
