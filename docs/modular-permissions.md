# Cargos e permissões por canal

## Uso

Abra **Opções do servidor → Cargos e permissões** para criar cargos, escolher nome, cor, hierarquia e capacidades. Na aba **Pessoas**, atribua vários cargos à mesma pessoa. Todos recebem a base **@todos**, inclusive novos membros.

Na engrenagem de um canal de texto ou voz, escolha um cargo ou uma pessoa e configure cada capacidade como **Herdar**, **Permitir** ou **Negar**. A mesma janela permite renomear e arquivar o canal, quando autorizado. Arquivar preserva o histórico e retira o canal da navegação.

Para criar um canal privado, negue **Ver canal** para **@todos** e permita essa capacidade nos cargos ou pessoas desejados. **Pessoas do grupo** mostra apenas membros com acesso ao canal de texto selecionado, independentemente de estarem online.

Em **Configurações → Aparência → Separar membros por cargo**, cada pessoa passa a aparecer uma vez, no cargo de maior posição. Os grupos seguem a hierarquia; dentro deles, aparecem primeiro os disponíveis, depois os ausentes e os offline. Pessoas sem cargo atribuído ficam em **Sem cargo**. A preferência é local e persiste ao reiniciar.

Clique em uma pessoa para abrir seu cartão lateral com foto, nome no servidor, nome da conta de login e todos os cargos atribuídos. Escape ou um clique fora fecha o cartão. O nome da conta é armazenado separadamente do apelido pela migração `MemberAccountName` e atualizado na autenticação. Contas antigas que já tinham apelido precisam autenticar novamente para recuperar esse nome; o cartão informa quando ainda não está disponível. Não são expostos e-mails nem identificadores de autenticação.

## Resolução das regras

1. Somam-se as permissões de @todos e dos cargos atribuídos.
2. Aplicam-se as exceções de @todos no canal.
3. Combinam-se as exceções dos cargos atribuídos: removem-se as negações e acrescentam-se as permissões. Nessa etapa, permitir em um cargo prevalece sobre negar em outro.
4. Aplicam-se as exceções individuais por último.

Sem **Ver canal**, nenhuma capacidade do canal fica disponível. Sem **Enviar mensagens**, anexos e criação de tópicos ficam indisponíveis. Sem **Entrar em canais de voz**, falar, câmera e compartilhamento também ficam indisponíveis.

**Administrador** concede todas as capacidades e ignora exceções por canal. O proprietário, definido por `Admin:Email` na configuração privada do servidor, mantém acesso de recuperação. Um valor antigo de proprietário gravado no banco não concede essa autoridade.

## Delegação e atualização dos acessos

A posição numérica define a hierarquia; valores maiores ficam acima. Quem gerencia cargos só altera cargos inferiores, concede capacidades que já possui e atribui cargos a pessoas abaixo de sua posição. Não pode promover a si próprio. @todos não pode ser excluído. Alterações usam versões para impedir que uma edição antiga sobrescreva outra mais recente.

O servidor verifica as regras nas mensagens, anexos, busca, tópicos, reações, presença e eventos ao vivo. A lista de canais e os resultados de busca omitem canais inacessíveis. Mudanças invalidam os dados da interface; o servidor continua sendo a autoridade mesmo com um cliente desatualizado.

Na voz, os tokens limitam as fontes de publicação às capacidades concedidas. A reconciliação ocorre a cada três segundos e encerra a sessão de mídia quando o acesso ou as capacidades mudam; a próxima conexão recebe as permissões atuais.

## Implantação

Esta funcionalidade exige atualizar **backend e desktop**. A migração `20261101172451_ModularChannelPermissions` cria cargos, associações e exceções, além de converter administradores e moderadores antigos em cargos editáveis. Membros comuns mantêm as permissões padrão. O fluxo `bash tools/vps.sh start` já executa as migrações e atualiza os privilégios do usuário de runtime; faça backup e atualize o backend antes de distribuir o novo desktop.

## Verificação local sem Docker

Os testes de integração aceitam `DISCORDA_TEST_POSTGRES` com uma conexão PostgreSQL local em loopback. Cada teste cria e remove seu próprio banco com nome aleatório. Sem essa variável, permanece o fluxo padrão com Testcontainers. Não grave credenciais no repositório.

Há cobertura para resolução das exceções, hierarquia, conflitos de versão, migração dos cargos antigos, acesso a conteúdo privado, presença, eventos ao vivo, revogação durante uma escrita pendente e restrições de mídia. O teste de interface `permissions.spec.ts` cobre criação e atribuição de cargo, exceções individuais, pessoas por canal e modo somente leitura.
