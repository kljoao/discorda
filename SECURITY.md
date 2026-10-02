# Segurança

Não publique credenciais, e-mails de membros, IPs privados, arquivos de conexão, dumps, logs ou capturas de configurações em issues. Relate vulnerabilidades pelo recurso **Report a vulnerability / Private vulnerability reporting** do GitHub, quando habilitado no repositório; caso indisponível, peça um canal privado ao mantenedor sem incluir detalhes exploráveis.

## Modelo de confiança

- Supabase valida login Google; API valida assinatura, emissor, audience, expiração, sessão e identidade confirmada no provedor.
- A lista local vincula cada e-mail a uma identidade; autenticação Google não concede acesso sozinha.
- Endpoints administrativos exigem membro autorizado e e-mail administrador configurado no servidor.
- Secrets de banco/LiveKit existem apenas no host. PAT Supabase é usado somente durante a alteração do provedor, sem persistência. A chave publishable é pública por definição.
- Arquivos privados são ignorados pelo Git e pelo build Docker. Isso não remove um segredo que já tenha sido publicado: nesse caso revogue/rotacione e remova do histórico.
- A API/LiveKit de casa usam TLS com certificado fixado no desktop. Na conexão por IP, a coleta inicial realiza apenas o handshake TLS, sem enviar credenciais; a confiança só é salva após confirmação explícita. Confira a identificação SHA-256 com o administrador por canal confiável: o IP sozinho não comprova a identidade do servidor na primeira conexão. O JSON legado também deve ser recebido por canal confiável. Confiar em outro certificado significa confiar em outro host.
- O painel local HTTP fica publicado exclusivamente em loopback. Não altere essa porta para `0.0.0.0` e não encaminhe por túnel sem HTTPS.
- O Firewall é aplicado pelo operador Windows. Docker não garante a restrição por IP apenas porque uma lista foi salva. Revise regras permissivas existentes e valide bloqueio com outra máquina.

## Antes de tornar público

Execute `npm run audit:source`, revise `git status --short` e os arquivos a publicar. O scanner é uma barreira auxiliar, não prova de ausência de segredos. Não force inclusão de arquivos ignorados. Não publique o diretório de trabalho como um ZIP completo. Testes usam credenciais fictícias; produção e backups ficam fora do código.

As builds comunitárias desabilitam atualização oficial automática. Releases do mantenedor usam manifesto Ed25519 e hash do instalador; mantenha a chave privada fora do repositório e fora de pull requests. Assinatura de atualização não elimina avisos de SmartScreen.

## Revisão de administração — 0.9

Foram revisados os limites entre membro, administrador do grupo e operador local do host. A criação de canais passa a conferir o administrador configurado em cada requisição, removendo a autorização residual de um antigo Owner. A API limita o tamanho das requisições a 64 KiB no Kestrel e aplica limites de frequência às alterações administrativas, além do limite global. Tokens continuam no processo principal, sem acesso no renderer; operações administrativas usam uma lista explícita de ações IPC. Scripts de Firewall são salvos mediante escolha de arquivo, nunca executados remotamente.

Testes cobrem membros recusados, tentativa de atribuir privilégios via payload, troca de administrador, entradas de rede inválidas, acesso não autenticado e preservação do banco na restauração. `npm audit --omit=dev` não apontou vulnerabilidades conhecidas na verificação desta versão; isso não garante ausência de falhas. Esta revisão não é um pentest independente. Regras antigas/amplas do Firewall, comprometimento da conta Google e administradores locais do host continuam sendo riscos que exigem controle operacional.

## Revisão 0.10

Cargos delegados têm hierarquia e são verificados em cada operação na API. O proprietário continua derivado da configuração privada do host, nunca de um cargo enviado pelo cliente. Busca usa parâmetros e índice de texto; reações são limitadas e idempotentes; marcadores de leitura validam acesso e avançam atomicamente. Resultados e mensagens são texto React. Atalhos globais não registram texto, e PTT silencia se o heartbeat parar. O canal beta mantém verificação criptográfica e bloqueio de downgrade. Backups automáticos são opt-in, locais e privados; a verificação de restauração usa um banco descartável sem rede. Veja docs/community-quality.md para o escopo e limites de validação; isso não é uma garantia de ausência de vulnerabilidades.
