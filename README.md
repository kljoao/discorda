# Discorda

Comunicação para grupos: chat, chamadas, câmera e compartilhamento de tela. Código sob [MIT](LICENSE). Electron/React no desktop; ASP.NET Core, PostgreSQL e LiveKit no servidor. O Supabase é usado **somente para login com Google**; mensagens e permissões ficam no seu PostgreSQL.

> **Sobre o projeto e as contribuições:** o Discorda nasceu como um experimento de desenvolvimento com o GPT-6 Astra. Melhorias no código, correções de vulnerabilidades e novas funcionalidades são sempre bem-vindas. Por segurança, todos os pull requests serão revisados por uma pessoa antes de serem incorporados ao projeto; essa responsabilidade não será delegada à IA. Para relatar vulnerabilidades, siga as orientações do [SECURITY.md](SECURITY.md).

## Quero apenas entrar no servidor de um amigo

1. Instale o Discorda pela página de [releases](https://github.com/kljoao/discorda/releases).
2. Instale o [Radmin VPN](https://www.radmin-vpn.com/) e entre na rede privada informada pelo administrador.
3. No Discorda 0.7.1 ou mais recente, informe o **IP Radmin do servidor** recebido do administrador. Confira a identificação do certificado com ele e clique em **Confiar e conectar**. O app salva a conexão e reinicia; não é necessário receber um arquivo JSON.
4. Entre com Google. O administrador deve autorizar seu e-mail no Discorda e seu IP no Firewall. Se o Google estiver em modo de testes, também precisa adicionar seu e-mail aos usuários de teste.

O computador que hospeda o servidor precisa estar ligado, com Docker e Radmin funcionando. Informe o IP do host, não o IP do seu próprio PC. A primeira conexão usa confiança explícita no certificado apresentado; confirme sua identificação com o administrador. Nas próximas conexões, mudanças inesperadas de certificado são bloqueadas. Arquivos JSON antigos continuam aceitos na opção secundária de importação.

## Hospedar em casa — Windows e Radmin

### 1. Preparar o computador

Instale Git, PowerShell 7, Docker Desktop com backend WSL2/Linux containers e Radmin VPN. Confirme que `docker info` funciona. Não é necessário instalar PostgreSQL, LiveKit, Node ou .NET no host para subir os serviços Docker.

No Radmin VPN, escolha **Rede → Criar nova rede** e defina nome e senha. Seus amigos usarão **Ingressar em rede existente**. Anote o IPv4 `26.x.x.x` do **seu** computador. Não é necessário instalar o produto de acesso remoto Radmin Server. Veja a [ajuda oficial](https://www.radmin-vpn.com/help/).

Esta receita usa Docker Desktop no Windows. Docker também pode executar os serviços no Linux, mas o Radmin VPN não oferece o mesmo caminho nesse sistema; nesse caso é necessário adaptar rede, certificados e Firewall para outra VPN. Não exponha as portas diretamente na internet seguindo esta receita.

### 2. Configurar Google e Supabase

Crie seu próprio projeto Supabase. Em **Authentication → Sign In / Providers**, habilite Google. No Google Cloud, crie uma credencial OAuth do tipo **aplicativo Web** e registre este callback, substituindo a referência do projeto:

```text
https://SEU_PROJETO.supabase.co/auth/v1/callback
```

Copie o client ID e client secret do Google para o provedor Google no Supabase. Não crie um aplicativo na seção **OAuth Server** do Supabase: esse é outro fluxo.

Em **Authentication → URL Configuration → Redirect URLs**, adicione:

```text
http://localhost:18080/admin/index.html
http://127.0.0.1:3000/redirect/**
```

Use `http://localhost:18080/admin/index.html` como Site URL para este ambiente privado. O callback público do Google continua sendo o domínio Supabase; você não precisa de domínio público para a API de casa. Se o aplicativo Google estiver em testes, cadastre o administrador e os amigos em **Test users**. A autorização no Google não substitui a lista do Discorda.

Tenha a URL do projeto e a chave **publishable** `sb_publishable_...`. Não é necessário fornecer chave `secret`, `service_role` ou senha do banco Supabase. [Guia oficial Google/Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google).

### 3. Subir o servidor

Em PowerShell 7, como seu usuário normal:

```powershell
git clone https://github.com/kljoao/discorda.git
cd discorda
pwsh -File tools/setup-selfhost.ps1
```

O assistente solicita IPv4 Radmin do host, e-mail administrador, URL Supabase e publishable key. Gera senhas aleatórias para PostgreSQL, LiveKit e certificado TLS, protege a pasta privada e executa o Compose. A primeira compilação pode levar alguns minutos.

O Compose inicia PostgreSQL, executa as migrations e autoriza o e-mail administrador, inicia LiveKit e só então inicia a API. O banco não publica porta no host. Dados persistem em volumes Docker. A API roda sem root; o certificado é confiado exclusivamente pelo aplicativo após importar a conexão.

Se já existe uma configuração, o assistente recusa sobrescrevê-la. Para iniciar novamente:

```powershell
pwsh -File tools/start-selfhost.ps1
```

### 4. Autorizar os amigos

Abra **http://localhost:18080/admin/index.html** no computador servidor e entre com o Google do administrador.

- **Pessoas autorizadas:** autorize ou bloqueie e-mails. Bloquear revoga as sessões existentes.
- **Rede Radmin:** salve os IPs individuais dos amigos; baixe o script e execute-o em PowerShell **como administrador no host**. Salvar no painel, por si só, não aplica o Firewall. Lista vazia remove as permissões criadas por esse script.
- **Login Google:** pode atualizar client ID/secret do provedor usando um token pessoal de gerenciamento Supabase (PAT). O token é usado na operação, não armazenado. O secret fica no Supabase. Não há botão para revelar os valores salvos. Sem PAT, continue usando o dashboard Supabase.

O primeiro login exige que Google já esteja configurado no dashboard, conforme etapa 2. Nenhum usuário se torna administrador apenas por ser o primeiro a entrar: o e-mail vem da configuração privada do host e é verificado pelo servidor.

As regras geradas chamam-se `Discorda SelfHost *` e liberam API TCP 7443, mídia TCP 7881 e UDP 7882. **Revise regras amplas do Docker e regras antigas do Discorda no Firewall:** permissões existentes podem anular o isolamento pretendido. Não abra essas portas no roteador. O comportamento de Firewall/encaminhamento do Docker Desktop precisa ser verificado no host; teste também um IP não autorizado. O login e a whitelist continuam obrigatórios independentemente da rede.

Compartilhe o IP Radmin do host e a identificação pública do certificado em uma conversa privada. Consulte ambos com `pwsh -File tools/show-server-identity.ps1`. Os amigos informam o IP no app e confirmam a identificação. Instale o desktop no host também e use esse mesmo IP. Para clientes antigos, o assistente ainda gera `.discorda/selfhost/Discorda-conexao.json`; não compartilhe a pasta `.discorda` inteira.

### 5. Validar a instalação

- `http://localhost:18080/health/ready` deve retornar `Healthy`.
- Entre com duas contas autorizadas e confirme chat, áudio e compartilhamento em duas máquinas.
- Confirme que um e-mail não autorizado é recusado e que um IP não permitido não alcança as portas do host.
- Teste saída/entrada na chamada, perda temporária de rede e reconexão.

A qualidade depende de upload do host, conexão dos amigos, GPU e decodificação. LiveKit em Docker Desktop usa encaminhamento de portas; a validação real em duas máquinas é necessária. A configuração anuncia o IP Radmin do host para mídia. [Portas LiveKit](https://docs.livekit.io/transport/self-hosting/ports-firewall/).

## Operar, atualizar e fazer backup

Veja [operação e recuperação](docs/selfhosting-operations.md): comandos para logs, backup, restore, renovação de certificado, troca de secrets, recuperação de administrador e migração do piloto antigo.

## Desenvolver e compilar

Requisitos adicionais: Node 24, .NET SDK 10 e Docker para os testes de integração. O instalador e o helper de áudio são compilados no Windows. Instale as ferramentas de compilação C++/Visual Studio e o runtime VC++ x64 caso o helper solicite dependências.

```powershell
npm ci
dotnet restore Discorda.slnx --locked-mode
npm test
dotnet test Discorda.slnx -c Release
npm run build
npm run test:desktop
npm run package:win
```

`package:win` gera uma **build comunitária** em `apps/desktop/release/community`, sem exigir chave privada e sem buscar atualizações oficiais automaticamente. Ela pode ser reinstalada por cima para atualizar. A CI usa esse caminho.

Para desenvolver a interface: `npm run dev`. Para banco/API nativos, consulte [o guia de desenvolvimento](docs/development-legacy.md); os relatórios `docs/phase-*` são registros históricos, não a instalação recomendada. Não copie dados de produção para testes.

## Releases e forks

As releases oficiais usam `npm run package:release` e exigem uma chave Ed25519 externa ao repositório. O aplicativo verifica assinatura e hash antes de instalar uma atualização. A assinatura própria não substitui Authenticode/SmartScreen.

Um fork precisa definir seu próprio repositório em `apps/desktop/electron-builder.yml`, URL do manifesto em `src/main/updates.ts` e chave pública em `src/main/update-key.ts`, gerando e guardando sua própria chave privada. A chave pública original não concede acesso à chave privada. Não habilite o canal oficial numa build que deveria atualizar a partir de outro mantenedor.

Nunca inclua `.discorda`, `.env`, PFX, user-secrets, conexão JSON, backups ou logs nas releases. Publique apenas instalador, blockmap, `latest.yml` e manifesto assinado de uma release validada. Código: mantenha somente os arquivos não ignorados, após revisão. Consulte [segurança](SECURITY.md) e [contribuições](CONTRIBUTING.md).

## Limites atuais

A instalação guiada é voltada a Windows/Radmin, um servidor e um grupo. O Supabase continua sendo dependência externa para autenticação. Secrets de infraestrutura são gerenciadas no host, com reinício; o painel não é um gerenciador genérico de senhas. A aplicação do Firewall é uma etapa elevada explícita. Não há promessa de proteção contra administradores locais do computador ou de disponibilidade quando o host está desligado.
