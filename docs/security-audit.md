# Auditoria de segurança — 03/10/2026

Revisão do código a partir de `4534593` (0.13.0), com correções locais posteriores e inventário de 290 arquivos públicos. Não houve publicação, rotação de credenciais externas nem alteração da VPS. O escopo é o repositório disponível e seus artefatos de teste locais; não é um pentest independente nem uma garantia de ausência de vulnerabilidades.

## Arquitetura e fronteiras de confiança

| Fronteira | Entradas e dados | Controles examinados |
|---|---|---|
| Usuário → renderer React | Mensagens, menções, buscas, nomes, dispositivos, preferências | Texto escapado, ausência de HTML arbitrário, links HTTP(S) explícitos, limites e estado de captura |
| Renderer → Electron Main | IPC de login, servidores, chat, mídia, administração e atualização | Janela/frame/origin confiáveis, validação das ações e argumentos, sandbox, contextIsolation, sem Node no renderer |
| Desktop → servidor | IP/domínio escolhido, convite, configuração importada, HTTPS/SignalR | Confirmação do servidor, pinning privado por origin ou PKI pública, redirects recusados, sessão separada por servidor |
| Desktop → Supabase/Google | PKCE, callback loopback, JWT e refresh token | Rota aleatória, Host/Origin/método, cofre do SO, descarte de provider tokens, logout e expiração |
| Cliente → API | HTTP, JWT, IDs de canal/mensagem/usuário, WebSocket | Emissor/audience/assinatura/expiração, Google confirmado, whitelist vinculada à identidade, sessão revogável, RBAC, autoria e escopo |
| API → PostgreSQL | Dados do grupo, sessões, whitelist e auditoria | Queries parametrizadas, constraints/índices, concorrência, migrations e conta de execução restrita |
| API/cliente → LiveKit | Grants, leases, presença, áudio/vídeo | Sala autorizada, grant curto, reconciliação de sessão/lease, remoção moderada e limite de participantes |
| Host → infraestrutura | Docker, Caddy, firewall, backups, certificados, configuração privada | Publicação de portas, proxy confiável exato, usuário da API sem root, separação de secrets e restauração isolada |
| Mantenedor → desktop | Instalador, manifesto e metadados da release | Ed25519, versão/nome/hash/tamanho, bloqueio de downgrade e nova conferência antes de instalar |
| CI/build → distribuição | Lockfiles, dependências, helper nativo, ASAR | Build bloqueado por erros, permissões de workflow, allowlist de empacotamento e scans de secrets/dependências |

O banco e o LiveKit internos pertencem à rede confiável do operador. Supabase permanece responsável por refresh tokens, recuperação da conta e política de MFA; não existe um segundo sistema de senhas no Discorda. Não foram encontrados módulos de upload genérico, LDAP, XML de usuário, webhooks, Redis, filas, Kubernetes ou Terraform. Arquivos de conexão, exportações e downloads existentes foram incluídos na revisão.

## Achados e correções

As severidades abaixo consideram o contexto do Discorda. Alertas de scanners de bibliotecas, com suas severidades originais, são tratados separadamente.

| Severidade | Vulnerabilidade | Local | Impacto | Correção |
|---|---|---|---|---|
| Alta | API auto-hospedada utilizava a conta administrativa do PostgreSQL | Assistentes, Compose, migration e grants | Uma invasão da API/credencial de execução teria autoridade sobre schema, roles e histórico de auditoria | `settings.json` usa `discorda_runtime`; `migration.json` separado recebe a conta administrativa. Grants mínimos, auditoria sem UPDATE/DELETE, rejeição de role preexistente elevada ou proprietária no provisionamento automático |
| Alta — dependência | PostgreSQL 17.9 e bibliotecas da imagem estavam sem correções de segurança disponíveis | Compose, backup/restore e fixtures | Mantinha vulnerabilidades conhecidas no mecanismo e ferramentas SQL; explorabilidade varia conforme função e privilégios | Atualização para `17.11-alpine3.23`, sem mudar a major nem a família Alpine. Teste com volume criado em 17.9 e reaberto em 17.11 |
| Média | Verificação de identidade cara ocorria antes do rate limit | `Program.cs`, autenticação | Rajadas de requisições inválidas consumiam verificações/recursos antes de receber 429 | Orçamento anterior à autenticação: 600 requisições/min/IP e 64 verificações simultâneas por processo; mantém 120 requisições/min por identidade depois da autenticação |
| Média | Conexões persistentes de presença não tinham limite de admissão | `LiveChat.cs` | Uma conta autorizada podia manter muitas conexões e ampliar consultas/broadcasts | Admissão atômica: até 4 conexões por membro e 128 por processo; excesso é desconectado |
| Média | Corrida entre entrada em chamada e moderação | `MediaService.cs` | Entrada já em andamento podia recriar a lease depois da remoção moderada | Revalidação e registro de lease sob o mesmo lock da moderação; tentativa concorrente recusada com 403 |
| Média | Decisão de cargo podia ficar obsoleta durante uma alteração concorrente | Cargos, voz moderada, canais, nome do grupo, pins e exclusão moderada | Uma ação pendente podia usar autoridade lida antes de uma demissão | Lock transacional comum e releitura da autoridade antes da mutação; funciona também entre processos da API no mesmo banco |
| Média | Backup externo usava TLS sem verificação obrigatória da identidade do servidor | `backup-external.ps1` | Intermediário de rede podia apresentar outro certificado e receber conexão/credenciais de manutenção | `sslmode=verify-full`, CA configurada copiada ao container ou bundle de CAs confiáveis; nome divergente é recusado |
| Baixa | URL malformada derrubava o handler HTTP do callback OAuth | `auth/loopback.ts` | Requisição local como `//[` podia interromper o processo/login | Parse protegido; 400 sem consumir o login pendente, que continua aceitando o retorno válido |
| Baixa — configuração | LiveKit executava como root com capacidades padrão do Docker | Compose Windows/VPS | Privilégios desnecessários ampliavam o impacto de eventual invasão do processo de mídia | UID/GID 1654, capabilities removidas, no-new-privileges; configuração privada legível por esse UID e teste real de mídia no container |

PostgreSQL 17.10/17.11 incluem correções próprias que um scanner de pacotes do SO pode não identificar, pois a imagem oficial compila o PostgreSQL. Foram consultadas também as [notas 17.10](https://www.postgresql.org/docs/17/release-17-10.html) e [17.11](https://www.postgresql.org/docs/17/release-17-11.html). O esquema do Discorda não usa `btree_gist`, `ltree`, pgcrypto ou replicação lógica; operadores que os adicionaram precisam verificar as recomendações dessas versões.

## Corrigido

Os nove grupos acima foram alterados no código/configuração e validados localmente. Os testes de API agora usam a conta restrita, enquanto a preparação das fixtures usa a conta proprietária. Isso exercita operações reais de login, chat, administração e auditoria com os novos grants, além de testar explicitamente operações proibidas.

Na segunda passagem, foram reavaliados os consumidores dos novos arquivos: início no Windows/VPS, recuperação administrativa, backup, restauração e rotação. O backup Windows inclui `migration.json` quando existente e continua aceitando instalações antigas; a troca de administrador mantém os dois JSONs coerentes. Os conversores recusam conexões customizadas em vez de descartar suas opções silenciosamente. O conversor Windows foi adaptado e testado também em Windows PowerShell 5.1, usado pelo painel legado, sem exigir sua substituição para iniciar o servidor.

### Aplicar em instalações existentes

Estas alterações no clone não corrigem automaticamente um servidor já em execução.

1. Preserve um backup privado do banco e da configuração e reserve uma janela de manutenção: a atualização do PostgreSQL reinicia o banco.
2. Atualize o código após a publicação desta revisão. Na VPS, use `bash tools/vps.sh stop` e `bash tools/vps.sh start`; no Windows/Docker use `pwsh -File tools/start-selfhost.ps1`.
3. Os scripts separam a conexão antiga gerada pelos assistentes, criam a conta restrita durante a migration e iniciam a API com ela. Não é necessário apagar volumes ou recriar o banco.
4. Confira readiness, login autorizado/negado, chat, painel e chamada. Confira também que somente o serviço `migrate` monta `migration.json`.

Para conexão customizada ou piloto nativo: crie uma **conta nova** de runtime, sem propriedade de schema/tabelas/banco, sem superuser, criação de banco/roles, replicação, bypass de RLS ou associação a roles privilegiadas. Preserve a conexão administrativa num arquivo privado de migration. Configure `Migration.RuntimeRole` e `Migration.RuntimePassword` (senha aleatória de 32 bytes representada por 64 caracteres hexadecimais) nesse arquivo e execute o comando `migrate` com a configuração administrativa; o provisionamento automático cria a role somente se ela não existir. Configure a API para usar essa role e retire dela o arquivo/credencial administrativa. Não reutilize uma conta dona dos objetos: revogar GRANTs não elimina privilégios de ownership.

Se a role já existe, a migration **não redefine a senha**. Faça rotação pelo prompt `\password` do psql, atualize a conexão de runtime e o valor privado de migration e recrie a API. Para trocar o proprietário do grupo manualmente, atualize `Admin.Email` nos dois arquivos. Preserve ambos nos backups criptografados. Se uma interrupção deixar um arquivo `.pending`, confira os arquivos privados antes de tentar novamente; não apague o banco como tentativa de recuperação.

## Validação

| Verificação | Resultado e limite |
|---|---|
| Backend Release, PostgreSQL real | 55 testes aprovados; autenticação externa simulada, banco real em containers; inclui RBAC concorrente, IDOR, whitelist/sessões, mídia, proxy e grants restritos |
| Desktop unitário | 63 testes aprovados; inclui IPC, TLS real privado, cofre, callback, updates, captura e ciclo de vida de áudio |
| Helper de áudio .NET | 5 testes aprovados de exclusão de processos; não é teste de hardware nos PCs dos usuários |
| TypeScript/build Vite/Electron | Build aprovado, incluindo typecheck |
| E2E desktop | 7 testes aprovados na execução completa com diagnóstico; houve timeout intermitente do teste de modal em outras execuções, que não reproduziu isoladamente. Não foi removida assertion nem aumentado timeout para ocultá-lo |
| Instalador comunitário | Empacotamento Windows concluído e verificação do conteúdo aprovada; smoke do executável empacotado: 6 aprovados e 1 ignorado por ser exclusivo do servidor de desenvolvimento. Execução final com diagnóstico Playwright, sem alterações temporárias nas assertions ou no teste |
| API Docker | Imagem compilada; migration real repetível e readiness com usuário de runtime restrito |
| `test-security-host.ps1` | Separação Windows idempotente, migration real, API restrita, volume 17.9 → 17.11 preservado, dump TLS válido e rejeição de hostname divergente; sem acessar volumes de produção |
| Assistente VPS | 4 testes Python aprovados: configuração, entradas inválidas, upgrade idempotente e recusa de conexão customizada |
| Backup VPS | 4 testes Python aprovados de sucesso e falhas de dump/verificação/publicação de status |
| Painel de host | Backup/restore real, integridade, recusa de banco não vazio e restauração descartável aprovados |
| LiveKit local | Houve execuções aprovadas com dois participantes, mídia sintética e encerramento das tracks no servidor nativo e no Docker sem root. Repetições posteriores falharam na sinalização/WebRTC, também com as permissões originais e no servidor nativo; a causa não foi isolada. A validação de estabilidade permanece inconclusiva. Não valida redes externas, TURN/TLS nem captura física |
| Secrets | Gitleaks 8.30.1 com redaction, refs locais `--all`: 10 commits examinados, nenhum achado. Snapshot dos arquivos públicos e `audit:source` também sem achados |
| Dependências | npm produção sem alertas; NuGet backend/helper sem alertas conhecidos. Alertas de desenvolvimento e imagens detalhados abaixo |
| Configuração estática | Trivy reconheceu o Dockerfile da API e apontou apenas DS-0026 LOW, ausência de HEALTHCHECK embutido. As rotas de health existem e são testadas; esse aviso de monitoramento permanece, não é bypass de autenticação. O scan não equivale à validação de toda configuração Compose/Caddy |
| Scripts e CI | Scripts PowerShell públicos passaram pelo parser; `bash -n`, testes Python e `git diff --check` aprovados. CI passou a executar os testes Python e bloquear alertas npm de produção HIGH/CRITICAL; execução remota dessa CI ainda depende de publicação |

Relatórios brutos e logs ficam em `artifacts/security-*`, ignorados pelo Git. Não os publique sem revisão: alguns scanners registram caminhos locais e o escopo de produção pode conter informações sensíveis. Uma tentativa inicial de Gitleaks sobre a árvore inteira também encontrou arquivos privados ignorados; isso não foi classificado como vazamento no código público. A checagem final usou somente o inventário público e o histórico local.

### Dependências e imagens: alertas que permanecem

- **npm de desenvolvimento:** 8 registros HIGH na cadeia do `electron-builder`, derivados do mesmo [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp), em `http-cache-semantics`. Não há correção publicada indicada para essa biblioteca no advisory consultado. O downloader observado usa `got` sem cache HTTP compartilhado habilitado; o cache de arquivos do Electron é outro mecanismo. Não foi demonstrada exploração no build atual e a dependência não vai no bundle de produção. Não se aplicou downgrade/override major: `@electron/get` 5 troca a API de download e tem [mudanças incompatíveis](https://github.com/electron/get/releases/tag/v5.0.0).
- **Imagem PostgreSQL:** a atualização removeu os 58 registros de pacotes Alpine presentes na imagem antiga. A imagem `17.11-alpine3.23` ainda tem 46 alertas de metadados Go em `gosu` (1 CRITICAL, 21 HIGH, 21 MEDIUM, 2 LOW e 1 UNKNOWN). `gosu` é o helper de troca de usuário, não um serviço TLS/HTTP. A [implementação upstream](https://github.com/tianon/gosu) foi confrontada com os cenários dos avisos; não se demonstrou caminho para os parsers/protocolos de rede apontados. O alerta `x/sys/windows` também não corresponde ao sistema Linux da imagem. Os avisos não foram suprimidos nem chamados de corrigidos; recomenda-se acompanhar atualização/rebuild oficial do helper.
- **Imagem API Ubuntu 24.04/.NET 10:** 14 registros (9 MEDIUM, 5 LOW), sem versão corrigida indicada pelo scanner para os pacotes instalados. Envolvem glibc, ICU, PCRE2, systemd/udev, shadow, tar e zlib. Não foi confirmado um caminho de exploração a partir das entradas da API; isso não prova inalcançabilidade. Atualizações da imagem base devem ser acompanhadas.
- **LiveKit 1.13.7:** 3 registros LOW do mesmo `CVE-2026-81870`, em componentes OpenTelemetry, e 1 UNKNOWN referente a `openpgp` sem manutenção. A configuração fornecida não habilita coletor nem diagnóstico Info do OpenTelemetry, e não existe fluxo OpenPGP no Discorda. Permanecem dependências upstream, não vulnerabilidades remotamente reproduzidas nesta revisão.

Scans feitos com Trivy 0.75.0, banco de vulnerabilidades atualizado em 03/10/2026, sem ignorar avisos por severidade. Os números são registros por pacote, não contagem de falhas independentes. Scanners por versão não substituem análise de alcance e mudam conforme novas divulgações.

## Requer ação externa

- Rotacionar credenciais privadas compartilhadas anteriormente, caso a rotação ainda não tenha sido feita: banco, Google OAuth e chaves privadas de serviço aplicáveis. Nenhum valor é reproduzido neste relatório. A chave **publishable** do Supabase é pública por projeto e não equivale a uma chave secret/service_role.
- Publicar uma nova versão revisada, atualizar o servidor e distribuir o desktop corrigido. O instalador gerado nesta auditoria é comunitário, de teste, com a versão existente; não foi publicado como release oficial.
- Validar no host real DNS/TLS, IP exato do Caddy, firewall Ubuntu/Docker ou Windows/Radmin, portas de mídia e backups fora da máquina. Não houve acesso administrativo à VPS nesta auditoria.
- Conferir proteção da conta GitHub/Google/Supabase, MFA, regras de branch/review, private vulnerability reporting e armazenamento da chave de assinatura. Essas políticas não são comprovadas pelo clone local.
- Verificar retenção de mensagens, sessões, auditoria e backups conforme o uso do grupo. Não houve exclusão de dados reais durante a revisão.

## Segunda passagem e busca de variantes

Depois das correções, foram repetidas as buscas por SQL dinâmico, execução de processos, caminhos/URLs controláveis, sinks HTML, secrets, endpoints anônimos, opções que enfraquecem TLS e validações só no renderer. Foram revisitados todos os grupos de entrada IPC/HTTP e os pontos de persistência, moderação, administração e distribuição.

- A variante de privilégio de banco foi procurada em assistentes, Compose, comandos nativos, grants, backup e restore. O piloto de desenvolvimento usa conta proprietária e exige separação manual antes de produção; não foi apresentado como automaticamente corrigido.
- A corrida de cargo foi procurada em todas as mutações com permissões delegadas. O assistente de comunidade depende do proprietário definido na configuração privada, que não muda via API.
- O parse de URL foi conferido nos demais callbacks, convites, imports, navegação e links; não se encontrou outra exceção equivalente desprotegida no callback HTTP de produção.
- As verificações TLS permissivas foram rastreadas: o bootstrap Radmin coleta somente certificado e exige confirmação antes de qualquer requisição autenticada; não é o mesmo caso do backup com credenciais.
- As credenciais de migration foram verificadas nos mounts da API. O teste real confirmou que os grants permitem a operação sem dar acesso à criação de tabelas no schema da aplicação, criação de roles ou exclusão de auditoria.

O [inventário de cobertura](security-audit-coverage.csv) relaciona cada arquivo público e o método de revisão. Leitura dirigida de código, análise automatizada, teste e revisão de artefato são métodos diferentes; o inventário não pretende afirmar que cada linha de biblioteca ou arquivo gerado recebeu auditoria manual. Migrations/snapshots foram verificados em conjunto com o modelo e executados em PostgreSQL real. CSS/assets/licenças/documentos foram inventariados e examinados para conteúdo ativo, dados privados e coerência operacional; não constituem uma nova revisão estética da UI.

## Riscos residuais

- Os alertas de dependências acima continuam visíveis; não há garantia de “zero vulnerabilidades”. Não foi confirmado um achado crítico explorável no código próprio.
- Limites de autenticação/conexões são por processo; não fornecem proteção contra DDoS distribuído. Mais de uma instância exige coordenação de presença/mídia e limites compartilhados, além do proxy.
- O lock administrativo serializa mutações privilegiadas; não envolve leitura do histórico ou envio comum de mensagem. Sua espera, assim como latência do Supabase e do banco, precisa ser observada em produção. O teste local de concorrência não comprova capacidade da VPS.
- Grants de LiveKit duram pouco, mas revogação e reconciliação não são instantâneas. A API/host operador continua sendo uma fronteira de confiança; não há promessa de criptografia de ponta a ponta contra ele.
- Backups/configuração contêm dados privados, protegidos por permissões locais, e devem ser criptografados para armazenamento externo. Um administrador do SO pode ler a memória/dados do próprio host. O cofre do desktop não protege contra comprometimento dessa conta do Windows.
- O laboratório de mídia apresentou falhas intermitentes de sinalização/WebRTC após execuções aprovadas, inclusive na comparação com as permissões originais do container e com o servidor nativo. Isso não demonstrou regressão causada pelo modo sem root, mas impede afirmar estabilidade da chamada; validar novamente no ambiente de destino antes da publicação.
- O timeout intermitente de E2E permanece uma limitação da automação local; os fluxos passaram em execução de diagnóstico e em teste isolado. Testes de microfone/câmera físicos e chamadas entre redes continuam necessários.
- O scan de Git cobre as refs existentes localmente, não forks, clones, anexos, logs remotos ou todos os assets antigos de releases.

## Arquivos modificados

- Backend: middleware de orçamento de autenticação, limite de conexões, revalidação de cargos/media e grants de banco.
- Desktop: tratamento de URL inválida no callback OAuth e regressão correspondente.
- Infra/scripts: separação de contas, helpers de upgrade, atualização do PostgreSQL em produção/desenvolvimento/testes/backup, TLS de backup e preservação das configurações administrativas.
- Testes: regressões de concorrência, limites, conta restrita, callback e teste de host Docker/TLS/upgrade.
- Documentação: este relatório, inventário, modelo de segurança e guias de operação Windows/VPS.

Referências de classificação: [OWASP API4 — consumo irrestrito de recursos](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/), CWE-250 (privilégios), CWE-362/367 (concorrência), CWE-295/297 (validação TLS) e CWE-248 (exceção não tratada).
