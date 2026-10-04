# Transmissões, tópicos e arquivos

## Para quem usa o aplicativo

- **Várias transmissões:** entre na chamada e escolha **Mosaico de transmissões**. Cada pessoa pode transmitir sua tela; marque as telas que quer assistir. O volume de cada transmissão continua disponível no menu de volume do participante. Mais telas simultâneas consomem mais banda e GPU.
- **Cinema:** **Modo cinema** amplia o palco e oculta a navegação. Quando há telas compartilhadas, o cinema mostra apenas essas telas. `Esc` ou **Sair do cinema** retorna à chamada. Continua sendo possível usar tela cheia.
- **Atalhos:** Configurações → Voz e microfone → Atalhos durante jogos. Clique no campo e pressione uma combinação de `Ctrl`/`Alt`, opcionalmente `Shift`, com letra/número; também pode usar `F1`–`F12`. Microfone, ensurdecer e cinema têm combinações independentes. Atalhos ocupados por outro aplicativo geram um aviso. São registrados somente durante chamadas. Pressionar para falar continua usando uma tecla `F1`–`F12` no Windows.
- **Arquivos:** no compositor do chat, **+** abre a seleção de arquivo. O arquivo é enviado como uma mensagem independente, sem apagar o texto que você estava escrevendo. Limite de **8 MiB por arquivo**. PNG, JPEG e WebP estáticos têm prévia sob demanda; outros formatos podem ser baixados. Arquivos não são executados ou abertos automaticamente. A prévia é limitada a 20 megapixels e 8192 pixels por dimensão.
- **Tópicos:** passe o mouse sobre uma mensagem e escolha **Abrir tópico**. Respostas ficam no painel lateral; `Enter` envia e devolve o foco ao campo. É possível responder, editar e excluir suas respostas; moderadores podem excluir respostas de outros membros. Rascunhos e envios incertos ficam na memória da sessão ao fechar o painel. O contador abre tópicos já existentes. Resultados de busca em tópicos abrem o tópico correto.
- **Salas temporárias:** **Criar sala temporária**, abaixo do título de canais de voz. Escolha um nome e entre imediatamente. Qualquer membro autorizado pode criar até duas salas; elas desaparecem após dois minutos vazias. A chamada permanece na tela se a conexão demorar, com seu estado visível.
- **Diagnóstico:** Configurações → Conexão e diagnóstico → **Compartilhar diagnóstico**. Confira o resumo, escolha um canal e confirme o envio. Somente versão, sistema e estados das conexões são compartilhados; IPs, e-mails, nomes, mensagens e credenciais não entram no resumo.
- **Menções:** menções e respostas emitem um aviso sonoro, inclusive com o app focado. Ajuste em nome do servidor → Notificações → **Som de menções e respostas**. Canais silenciados não tocam. Eventos repetidos são deduplicados e avisos simultâneos são agrupados em um sinal curto. A preferência de notificações do Windows é independente.

## Atualização do servidor

Atualize o backend **antes** de distribuir o novo cliente. A migração `AttachmentsThreadsTemporaryRooms` adiciona metadados de salas temporárias, uma referência/indexação para tópicos e a tabela `discorda.message_attachments`. Execute o serviço de migração do Compose conforme o guia da sua instalação; isso também reaplica as permissões da conta restrita. Depois recrie o serviço da API. Não é necessário um novo volume ou serviço externo.

Os arquivos ficam em `bytea` no PostgreSQL e entram nos backups normais do banco. O total é limitado a **512 MiB e 10.000 arquivos**, serializado por transação para impedir uploads concorrentes de ultrapassarem a cota. Excluir a mensagem remove o arquivo e revoga seu download; cópias já baixadas e backups anteriores permanecem com seus donos. Monitore também o tamanho dos backups. Acesso ao download exige autenticação e acesso ao canal, sem URL pública permanente.

Somente a rota de upload aceita corpo JSON de até 12 MiB (para o overhead base64). As demais rotas mantêm o limite de 64 KiB. Transferências têm no máximo duas operações simultâneas no servidor. Se houver outro proxy com limite próprio, configure essa rota de acordo. O Caddy gerado pelo projeto não impõe um limite menor.

O servidor continua sendo de instância única: leases de voz e presença são locais ao processo. Reiniciar a API inicia a recuperação das chamadas e a limpeza das salas temporárias vazias. A sala é protegida contra expiração enquanto possui lease ativo; criação/admissão/expiração usam o mesmo bloqueio transacional.

## Verificação

Testes cobrem: isolamento de tópicos, reenvio idempotente, limites e autorização de anexos, revogação ao excluir mensagem, cota de salas por criador, expiração vazia, proteção de sala ocupada e confirmação de presença com lease válido. A interface usa participantes sintéticos para validar ordenação, múltiplas telas, cinema, tópicos e compartilhamento do resumo. Esses testes não substituem a avaliação de banda, áudio e atalhos globais em dois PCs reais.

O roster da própria sala acompanha os eventos do LiveKit imediatamente. Os outros clientes recebem atualização por SignalR após a confirmação da conexão; a reconciliação de 3 segundos e a consulta de 4 segundos continuam como recuperação. Isso remove a espera obrigatória pelos dois intervalos, sem prometer conexão instantânea quando a rede está lenta.
