# Compartilhamento e administração do grupo

## Ler uma transmissão

Cada tela compartilhada tem controles para ampliar, reduzir, ajustar à janela e exibir no tamanho original. A roda do mouse amplia; arrastar navega pela imagem ampliada. Com a transmissão focada no teclado, `+`, `-` e `0` controlam o zoom. Os mesmos controles estão na janela destacada. O zoom é local: não altera o vídeo enviado nem controla o computador do apresentador.

## Retomar o contexto

O aplicativo já salva os servidores configurados e rascunhos. Agora também lembra o canal de texto e a posição consultada, separadamente por servidor e usuário. Se o canal deixou de existir, abre um canal disponível. No histórico antigo, use **Voltar às mensagens recentes** para acompanhar o canal ao vivo.

Depois de fechar o aplicativo durante uma chamada, o botão **Voltar à chamada** permite retornar à sala anterior. Ele não conecta automaticamente ao iniciar e entra com microfone e câmera desligados. Sair da chamada voluntariamente remove a sugestão. Salas temporárias que desapareceram não são oferecidas. A recuperação durante uma queda de rede continua usando o fluxo existente.

## Convites com aprovação

O proprietário abre **Gerenciar grupo → Acessos e rede do servidor → Convites e pedidos de acesso**. Escolhe validade (até 7 dias) e limite (até 100 solicitações), e usa **Criar e copiar convite**. O link completo aparece uma única vez; o banco guarda apenas seu hash.

O convidado abre ou cola o link no Discorda, confirma o endereço do servidor e entra com Google. O aplicativo envia um pedido associado à identidade Google verificada. O convite não libera conversas, arquivos ou chamadas. O proprietário deve aprovar o pedido no painel; depois, o convidado clica em **Verificar sessão**. Uma conta anteriormente bloqueada pode precisar entrar novamente com Google, porque sessões revogadas permanecem revogadas.

Cada solicitação distinta reserva um uso, inclusive se for recusada. Tentar novamente com a mesma identidade e convite não consome outro uso. Há limites de 50 convites ativos e 200 pedidos pendentes por servidor. Revogar ou expirar um convite impede novas solicitações e a aprovação dos pedidos ainda pendentes. Recuse pedidos antigos para liberar a fila. Contas já aprovadas não são bloqueadas pela revogação do convite; use a gestão de pessoas para revogar acesso.

**Copiar endereço de conexão** continua disponível para membros que já estão autorizados. Para alguém novo, compartilhe o convite criado pelo proprietário. O fluxo não contorna o firewall: em uma instalação Radmin, o convidado ainda precisa alcançar o servidor pela rede e pelas regras do host. As restrições do aplicativo Google em modo de teste também continuam valendo.

## Armazenamento

Em **Arquivos do grupo → Política de armazenamento**, o proprietário configura a cota entre 16 e 10.240 MiB e a idade a partir da qual anexos ficam elegíveis para limpeza. O padrão continua 512 MiB, sem expiração (`0` dias). O limite de 8 MiB por arquivo e 10.000 anexos por servidor permanece.

Acima de 80% da cota, o painel avisa. Salvar uma política não remove arquivos. **Revisar limpeza da política salva** apresenta nomes, datas, quantidade e bytes de um lote de até 100 anexos. Só **Confirmar exclusão destes arquivos** remove o lote. A confirmação expira em cinco minutos; alterações na política ou nos candidatos exigem uma nova revisão. Arquivos recentes ficam preservados e a mensagem recebe uma indicação da remoção. Todas as alterações ficam na auditoria.

Não há exclusão automática em segundo plano. A idade configurada define elegibilidade para a limpeza revisada. Reduzir a cota abaixo do uso atual bloqueia novos envios até liberar espaço ou ampliar a cota. A cota liberada pode ser reutilizada pelo banco sem redução imediata do tamanho físico do volume.

## Privacidade ao compartilhar

Em **Configurações → Acessibilidade → Privacidade ao transmitir**, escolha se deseja ocultar conversas e dados pessoais do Discorda e silenciar avisos de mensagens e eventos da chamada. A proteção vem ativada e é aplicada antes de iniciar a captura, permanecendo enquanto sua tela estiver sendo compartilhada. O áudio da conversa continua funcionando.

A proteção cobre a interface do Discorda: conversas, caixa de entrada, membros, conta e painéis administrativos. Não oculta outros programas, janelas do sistema nem conteúdo da própria tela escolhida. Se uma janela destacada mostrar uma transmissão de outra pessoa, o conteúdo dela também continua visível. Encerrar o compartilhamento restaura a interface.

## Atualização do servidor

Atualize o backend antes do desktop. A migração `InvitationsAndStoragePolicy` cria convites, solicitações e políticas; as permissões do usuário de runtime são atualizadas pelo fluxo de migração. Nenhuma configuração privada precisa ser incluída no repositório ou instalador.
