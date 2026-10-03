# Usar e administrar uma comunidade

## Servidores e convites

Use **Servidores e convites** na entrada ou na lateral do chat. Adicione um domínio HTTPS ou o IP Radmin do host, confirme a identidade e entre com Google. O aplicativo guarda até 20 conexões; é possível dar nomes locais e remover conexões antigas. A troca encerra a sessão e reinicia o cliente. Saia da chamada primeiro.

O botão **Copiar convite do servidor atual** gera `discorda://join?server=...`. O instalador registra esse protocolo no Windows. Ao abrir um convite, o Discorda apenas preenche o endereço: não se conecta automaticamente e não envia credenciais. Se o mensageiro não tornar o link clicável, cole-o no campo **Endereço ou convite do servidor**. O convite contém o endereço do host; não contém tokens, certificados privados ou autorização de acesso. Evite publicar endereços de redes privadas.

Cada host continua responsável por sua whitelist. O login Google e as permissões no servidor são obrigatórios, mesmo para quem possui um convite. O protocolo de convite não substitui os callbacks de login do Supabase.

Conexões Radmin preservam o certificado confiado. Um certificado vencido exige confirmar uma conexão atualizada com o proprietário. Domínios públicos usam HTTPS normal. Rascunhos, leitura e volumes individuais ficam separados por servidor. Rascunhos, marcadores e volumes de versões anteriores são migrados apenas para o primeiro servidor ativo após atualizar; nunca são copiados para outra comunidade.

## Transmissão e conversa

Na transmissão ou câmera, escolha **Abrir em outra janela**. Mova ou maximize a janela e continue usando o chat. O vídeo se ajusta ao espaço disponível; o áudio continua no mixer da chamada, sem uma segunda reprodução. Fechar a janela não encerra a chamada; encerrar a transmissão fecha sua janela. O modo de tela cheia e a opção de fixar continuam na visualização da chamada. Não há controles para pausar a transmissão.

## Leitura e notificações

A lateral marca canais com mensagens não lidas. Dentro do canal, **Ir para a primeira** leva à primeira mensagem não lida carregada; use **Carregar anteriores** se precisar de um trecho mais antigo. **Dispensar** remove o aviso da visualização atual. A leitura sincroniza com o servidor quando o chat está visível, focado e próximo das mensagens recentes.

Use **Mencionar pessoa** no compositor. Menções e respostas a você têm destaque visual. Em **Notificações**, ative avisos do Windows e, se desejar, limite-os a menções e respostas. **Silenciar este canal** suspende seus avisos, preservando o histórico e os indicadores de leitura. Notificações não expõem o conteúdo das mensagens na tela bloqueada.

## Administração

O proprietário é o e-mail configurado em `Admin:Email` no host. Não existe promoção automática do primeiro usuário. Após entrar, abra **Administrar servidor → Configurar comunidade**:

1. Defina o nome do grupo.
2. Adicione canais de texto e salas de voz (até 10 de cada por operação).
3. Opcionalmente autorize um e-mail como membro.
4. Revise e aplique. Canais existentes são preservados; repetir a configuração não duplica nomes do mesmo tipo.

Nome/canais e autorização de e-mail são operações separadas. Se apenas a autorização falhar, a interface informa que a comunidade foi salva; corrija o e-mail e tente novamente.

Em **Pessoas e permissões**, consulte a tabela de cargos. Mudanças de cargo, bloqueios de acesso e movimentações de chamada exigem confirmação. Moderadores não podem gerenciar usuários de cargo igual ou superior. Somente o proprietário tem acesso à configuração privada, rede e operação. O registro administrativo informa as ações sem registrar conteúdo de mensagens ou credenciais.

## Acessibilidade

Em **Configurações → Acessibilidade**, ajuste o texto da conversa, lista de canais, membros e conteúdo das configurações entre 100% e 150%, ative alto contraste ou reduza animações. As preferências são locais e persistem após reiniciar. A configuração de movimento reduzido do sistema também é respeitada. Tab percorre controles, Enter os ativa e Escape fecha diálogos.

## Operação e backups

Como proprietário, abra **Administrar servidor → Acessos e rede do servidor → Operação do servidor**. Use **Atualizar indicadores** para consultar API, PostgreSQL e LiveKit, pessoas em chamada, memória/CPU da API, tamanho do banco e espaço do volume. Não são métricas globais da VPS: o uso de outros serviços não aparece no consumo do processo da API. CPU é uma média desde o início desse processo, não uma amostra instantânea.

O painel lê um resumo local em `SelfHost:StateDirectory/backup-status.json`. Na VPS, `bash tools/vps.sh backup` grava o resultado após criar o dump, listar seu conteúdo e calcular SHA-256. Isso **não equivale a testar a restauração**; o campo correspondente permanece sem registro. O agendamento Windows existente registra também a data da restauração isolada testada. Ausência de registro é exibida como desconhecida, nunca como sucesso.

O cliente não recebe um socket Docker, não executa comandos remotos e não pode apagar ou restaurar o banco. Siga [VPS](vps.md) para iniciar/parar serviços e manter uma cópia de backup fora do host. Instalar uma nova versão desktop não atualiza a API: publique/atualize ambos para usar o assistente e o painel de operação.
