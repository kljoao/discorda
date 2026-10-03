# Revisão técnica antes da publicação

Revisão local em 02/10/2026, sobre o conjunto de alterações posterior à versão 0.10.1. Inclui leitura do código, correções, testes automatizados, inspeção visual e empacotamento de verificação. Não houve publicação nem alteração da VPS.

## Parecer

As funcionalidades revisadas passaram nas verificações descritas abaixo. Foram encontrados e corrigidos problemas de segurança, concorrência, crescimento de memória e navegação. Isso não equivale a uma garantia de ausência de vulnerabilidades nem a um teste de capacidade em produção.

O alerta de dependência de desenvolvimento descrito em “Dependências” permanece aberto. Antes de uma release, ainda devem ser gerados o instalador com nova versão e seu manifesto assinado. A experiência de microfone, fones, captura física e reconexão entre redes precisa de validação nos PCs afetados.

## Achados corrigidos

| Prioridade | Achado e consequência | Correção e evidência |
|---|---|---|
| Alta | A CA privada do Radmin era adicionada à confiança geral do processo Node. Além de ampliar a confiança para outros serviços, o WebSocket não recebia explicitamente a verificação de fingerprint. | CA restrita ao origin configurado no cliente HTTP e pinning explícito no WebSocket; nenhuma alteração às CAs globais. Teste com HTTPS e WebSocket reais verifica conexão autorizada, rejeição de fingerprint diferente e ausência de requisição HTTP a outro origin com o mesmo certificado. |
| Média | Usuários atrás do mesmo IP público dividiam 120 requisições/minuto e podiam bloquear uns aos outros. | Partição por identidade autenticada; solicitações não autenticadas continuam limitadas por IP. Teste com 15 identidades e 150 consultas sem 429. |
| Média | Histórico carregado e reconciliação periódica cresciam sem limite. | Janela de até 500 mensagens; no máximo 10 páginas por reconciliação. Paginação anterior substitui a janela e oferece retorno às recentes. Leitura histórica não marca mensagens posteriores como lidas. E2E injeta 1.100 mensagens, navega e confirma o limite. |
| Média | Duas transmissões podiam reutilizar a mesma janela e manter vídeo/limpeza de proprietários diferentes. | Um visualizador destacado por vez, com propriedade e limpeza explícitas. E2E abre a segunda transmissão e remove a primeira sem fechar a janela atual. Áudio continua somente no mixer da chamada. |
| Média | Inicialização assíncrona de microfone podia criar nós após a destruição do processador. | Geração de ciclo de vida invalida inicialização pendente. Teste confirma que nenhum nó de captura é criado após cancelar. |
| Média | Assistente contabilizava canais repetidos antes da deduplicação; criação manual ignorava o limite e o lock. | Deduplicação antes do limite; transação e lock comuns nas duas entradas. Testes confirmam repetição idempotente com 100 canais e rollback de configuração inválida. |
| Média | Abrir indicadores disparava consultas caras repetidas ao banco e ao LiveKit. | Cache de 15 segundos com um probe em andamento; orçamento de 8 segundos para o probe interno e consulta de mídia em paralelo. Teste com 20 chamadas simultâneas produz um único probe. Autenticação continua aplicada a cada solicitação. |
| Média | Biblioteca de servidores descartava registros expirados ou inválidos silenciosamente. | Certificados expirados são preservados na lista, mas recusados ao conectar. Arquivo inválido bloqueia a escrita em vez de apagar registros. Leitura limitada a 700.001 bytes antes do parse. |
| Média | Uma chamada podia ser iniciada enquanto a troca de servidor aguardava confirmação. | Ação de mídia bloqueada durante a troca. A troca exige sair da chamada e encerra a sessão anterior. |
| Média | Falha ao publicar o resumo podia transformar backup concluído em “falhou”; dump incompleto tinha nome definitivo. | Falha de publicação é aviso separado. Dump permanece `.partial` até passar pela leitura do catálogo. Quatro testes de script cobrem sucesso, dump interrompido, verificação falha e publicação falha. |
| Baixa | Comparação de diretórios de backup fazia buscas quadráticas e ordenação desnecessária. | HashSet para pertença e seleção linear do diretório mais recente. |
| Baixa | Assistente permitia avançar com e-mail/nome de canal inválidos e não reposicionava o foco. | Validação antes da próxima etapa, feedback e foco no título da etapa. |
| Baixa | Indicadores mostravam bancos pequenos como 0 GB e consultavam a raiz, não o caminho do estado. | Unidades MiB/GiB e consulta do filesystem do caminho de estado; informação indisponível permanece explícita. |
| Baixa | Confirmações rápidas podiam disputar estado de UI; lista de leitura podia gerar rajada de gravações. | Guarda síncrona nos controles de servidores/indicadores e lote máximo de cinco marcadores por sincronização. |
| Baixa | Presença ordenava todas as conexões de cada usuário para encontrar a última digitação. | Seleção linear com MaxBy, mantendo ordenação apenas da lista final. |

## Complexidade e limites

N = mensagens armazenadas; W = mensagens carregadas; M = membros; P = conexões; C = canais ativos; B = backups locais; K = tamanho da página.

| Operação | Tempo / espaço relevantes | Observação |
|---|---|---|
| Histórico no PostgreSQL | Busca por índice `(ChannelId, Id)`; custo esperado de seek O(log N) mais resultados da página | Paginação por cursor, até 50 mensagens, sem OFFSET. Projeção do autor da resposta usa PK. Plano efetivo depende do PostgreSQL e da distribuição dos dados; não é uma promessa de O(1). |
| Merge do chat | O(W + K log K), espaço O(W + K) | W limitado a 500. Para evento individual, K=1. |
| Reconciliação | Até 10 páginas por ciclo | Limite independente do histórico total do banco. Histórico remoto permanece disponível. |
| Índices de mensagens, pessoas, reações e pins na UI | Construção linear; consulta esperada O(1) com Map/Set | Evita buscar autores/reações em listas aninhadas por mensagem. |
| Presença | O(P + M log M), espaço O(P + M) por snapshot | Ordenação da lista para exibição. Broadcast ainda cresce com o número de destinatários. |
| Assistente de comunidade | O(C + A), espaço O(C + A) | A até 20 entradas; C até 100 canais ativos. Lock evita concorrência entre criações. |
| Servidores salvos | O(S), S até 20 | Arquivo limitado, gravações serializadas, certificados revalidados na seleção. |
| Seleção do backup recém-criado | O(B), espaço O(B) | HashSet substitui comparação de cada diretório com todos os anteriores. |
| Indicadores | Cache O(1) entre probes, espaço constante | `pg_database_size` ainda pode percorrer arquivos do banco; cache limita frequência, não muda o custo interno. |

Não existe uma única “melhor Big O” para todo o aplicativo. Os limites acima controlam os caminhos mais frequentes; os custos de rede, renderização, codificação de vídeo e consultas externas também importam.

## Segurança examinada

- JWT: emissor, audiência, assinatura, expiração, subject e session_id; identidade Google verificada no Supabase, separada de metadados editáveis.
- Autorização: whitelist, vínculo imutável de identidade, revogação de sessão, hierarquia de cargos e proprietário definido no host. Botões ocultos não substituem a validação no backend.
- Novos endpoints de setup e operação: somente proprietário, payload limitado, erros sem conexão de banco ou credenciais.
- Chat: queries parametrizadas, escopo de canal/workspace, autoria, versão concorrente, idempotência e paginação. Corpo de mensagem renderizado como texto/elementos React, sem HTML arbitrário.
- Electron: sandbox, contextIsolation, nodeIntegration desativado, IPC restrito à janela/frame confiável e CSP. Janela de transmissão sem preload, sem novas janelas, navegação ou webview.
- Conexões: convite apenas informa endereço; exige confirmação local. Não carrega token nem concede acesso. TLS privado isolado; HTTPS público mantém validação normal.
- Sessão: cofre seguro do sistema operacional, sem provider tokens desnecessários; logout e troca de servidor limpam credenciais locais.
- Atualização: conferência de manifesto/instalador assinado, bloqueio de downgrade e instalação durante chamada mantidos.
- Artefato: allowlist de arquivos, ausência de node_modules duplicado, configurações privadas e padrões de credenciais no app.asar.
- Busca histórica: 375 blobs de texto alcançáveis pelas refs locais examinados para padrões de chaves privadas/Supabase secret/Google secret, sem ocorrência. Isso não prova ausência de todo tipo de segredo, nem examina forks ou assets antigos no GitHub.

### Dependências

- `npm audit --omit=dev`: zero alertas reportados para dependências de produção na consulta realizada.
- Backend e componente nativo: consulta NuGet com dependências transitivas sem pacotes vulneráveis reportados.
- `npm audit` completo: **8 entradas altas derivadas de um único advisory** em `http-cache-semantics <=4.2.0`, usado pela cadeia `electron-builder → @electron/get → got → cacheable-request`.
- O [advisory GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) informa ausência de versão corrigida na data desta revisão. Não foi aplicada a sugestão automática de downgrade do empacotador.
- A biblioteca afetada pertence às ferramentas de build. A configuração padrão inspecionada de got tem cache desativado e esse caminho não serve respostas de usuários do Discorda. Isso reduz a exposição observada, mas o alerta permanece registrado até correção upstream ou substituição validada da cadeia.
- Audit de pacotes não substitui a avaliação dos componentes Chromium/Electron, imagens Docker, kernel ou configuração do host. Não foi feita uma varredura CVE completa das imagens da VPS.

## UI e UX

Inspeção visual e E2E em 1240×820 e 900×650: chat, membros, modal de servidores, assistente, permissões e acessibilidade. A identidade escura existente foi preservada, com hierarquia visual e cor de destaque consistentes.

Validados: diálogo com foco contido, Escape e retorno ao acionador; foco no compositor após envio; texto de leitura até 150%; alto contraste; preferência de movimento reduzido do Windows; seleção de servidor, convite e ações administrativas com feedback; popout sem duplicação de áudio; retorno explícito do histórico ao chat recente.

A lista de permissões deixa de reduzir o texto para 11 px em janelas compactas. Mensagens fora da viewport usam content-visibility para reduzir trabalho de layout. Indicadores exibem unidade legível, data de consulta e diferença entre backup e restauração testada.

A aparência é uma avaliação visual, não uma certificação de acessibilidade. Leitores de tela reais, zoom do Windows e todos os tamanhos de monitor ainda precisam de validação humana.

## Evidências executadas

- 57 testes unitários do desktop.
- 48 testes do backend, com PostgreSQL isolado em Testcontainers.
- 5 testes do componente de áudio nativo.
- 6 testes E2E: chat/admin/acessibilidade, app Electron construído, CSP de desenvolvimento, AudioWorklet real, foco de modal e janela de transmissão.
- 4 testes de falhas de backup com Docker simulado, sem tocar em backups do usuário.
- TypeScript/build, análise de sintaxe PowerShell/Bash, auditoria de fonte e checagem do pacote construído.
- Ensaio de concorrência: 15 usuários, 150 requisições autenticadas de histórico, banco com 10.000 mensagens. Execução local: **696 ms no total, p50 53,5 ms, p95 142,6 ms**, sem erros/429. Supabase simulado; PostgreSQL real. Não é benchmark da VPS nem inclui a Internet.
- Laboratório LiveKit local com dois clientes: recebimento de áudio/vídeo e encerramento das faixas confirmado. Sem teste entre redes, TURN TLS ou captura física.

Logs e screenshots ficam em `artifacts/` e `apps/desktop/test-results/`, ignorados pelo Git. Não contêm uma certificação de produção.

## Limites e próximos critérios de produção

1. Fazer uma chamada entre os PCs reais, incluindo troca/desconexão de fones, mic bloqueado no Windows, minimização com pressionar-para-falar, webcam, tela e reconexão de rede. Os testes sintéticos não reproduzem drivers e permissões físicas.
2. Medir a VPS junto ao SaaS: CPU, memória, RTT, perda, bitrate, p95 de API e chamadas prolongadas. O teste local não valida a capacidade de 1080p/60 fps entre todos os participantes.
3. A autenticação ainda consulta o Supabase em cada requisição autenticada. Esse custo externo não aparece no ensaio com stub. Cache exigiria uma política explícita para janela de revogação; não foi relaxada a checagem para melhorar artificialmente o benchmark.
4. Presença/roster completo e broadcast crescem com membros/conexões; não foi projetado nem validado para milhares de usuários. Busca, pins e auditoria podem precisar de paginação visual/virtualização adicional em comunidades grandes.
5. O pacote ocupa aproximadamente **403 MiB instalado**. Não equivale ao tamanho do instalador comprimido. Electron e runtime nativo continuam sendo os principais componentes; chegar próximo de 100 MiB exige trabalho específico de distribuição/arquitetura.
6. Renderer ainda apresenta aviso de chunk maior que 500 kB (aproximadamente 905 kB, 255 kB gzip). Divisão por rotas/recursos pode melhorar inicialização; não foi mascarado o aviso aumentando o limite.
7. Scripts de backup passaram por testes de falha simulados. Não foi executada restauração do banco real da VPS nem alterado seu agendamento.
8. A versão de teste durante a revisão era 0.10.1; não distribuir o diretório de revisão como uma nova release. Preparar versão, instalador e assinatura pelo fluxo oficial.

## Preparação da release

Após a revisão, a publicação da versão 0.11.0 foi solicitada. As observações sobre ausência de publicação acima descrevem o momento da revisão; o procedimento de atualização está nas [notas da 0.11.0](releases/0.11.0.md).
