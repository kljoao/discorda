# Fase 5 — tempo real e presença

## Entrega

O Electron mantém uma conexão SignalR/WebSocket por janela, no Main. O renderer recebe somente eventos de mensagem, canais, presença e estado da conexão, via preload limitado. JWT fica no Main e é enviado no header Authorization pelo transporte Node; não há token em URL nem no renderer. Login/logout e fechamento da janela encerram o ciclo da conexão; falhas iniciais e quedas posteriores têm novas tentativas automáticas.

Mensagens, edições e exclusões continuam sendo comandos REST persistidos antes da notificação. O cliente mescla ID/version, evitando duplicações e regressões por eventos fora de ordem. Uma falha de broadcast não desfaz a escrita: a interface recupera o histórico por REST ao reconectar e periodicamente a cada 60 segundos. A recuperação percorre páginas até alcançar o início do histórico já carregado, incluindo mudanças antigas e lacunas maiores que 50 mensagens. A lista de canais também é recarregada ao reconectar.

## Presença

- Lista de membros online; várias conexões do mesmo usuário são agrupadas.
- Ausente após cinco minutos sem atividade do sistema, usando o idle time do Electron.
- Heartbeat a cada dez segundos; lease de 45 segundos. Desconexão explícita remove imediatamente; falha abrupta expira pelo timeout do transporte ou lease.
- Indicador de digitação por canal, com renovação limitada no Main, limite por conexão no hub e validade de seis segundos. O snapshot é atualizado no máximo a cada cinco segundos; o desaparecimento visual pode levar até cerca de onze segundos sem nova atividade.
- Presença é efêmera e some ao reiniciar a API. Reconexão recompõe o estado. Não há Redis nem suporte a múltiplas réplicas nesta fase.

## Segurança

`/api/v1/live` exige a mesma política Member usada no REST. A conexão só é admitida após existir vínculo com o workspace. Cada heartbeat verifica sessão, whitelist e canal. Antes de enviar eventos/snapshots, o servidor consulta as sessões permitidas e remove conexões revogadas. Uma tarefa a cada cinco segundos detecta revogação por CLI/outro processo; não se promete latência zero para esse caminho. JWT expirado encerra a conexão e a próxima tentativa usa o token atual do SDK Supabase. Falha ao consultar autorização durante a manutenção da presença encerra as conexões.

O bloqueio da whitelist continua revogando as sessões no PostgreSQL. O hub não aceita nomes, IDs de usuário, status administrativos ou destinos arbitrários enviados pelo cliente. Só há um workspace privado, com todos os canais de texto visíveis a seus membros. Canais com ACLs individuais exigirão revisar o destino dos broadcasts antes de serem introduzidos.

A admissão passou a usar ReadCommitted com lock da linha da whitelist. Esse lock já serializa admissão/bloqueio da mesma conta, sem os aborts de serialização causados por rajadas de autenticação durante reconexão. Índices únicos e retries de conflitos continuam protegendo os vínculos.

## Validação

- 19 testes backend passaram: conexões simultâneas SignalR, evento após commit, digitação, revogação encerrando conexão, negação a anônimo/não autorizado, expiração de presença/token e admissão concorrente de seis requests.
- 14 testes unitários do desktop: ciclo de vida, uma conexão/listener, cleanup, retry inicial, IPC e mesclagem por versão.
- Três testes de interface: inclui eventos duplicados, indicador de digitação e recuperação de 64 mensagens após queda, preservando rascunho.
- Conexão WebSocket real no Electron confirmada com a sessão Supabase existente, sem envio de mensagens. Reinício real da API recuperou a conexão e manteve o rascunho. Seis consultas autenticadas simultâneas ao banco remoto também passaram.

Sem migration nova ou serviço pago. A API segue local e o banco no Supabase; a VPS não foi alterada. Voz/vídeo permanecem no laboratório separado.

Referências: [cliente SignalR](https://learn.microsoft.com/aspnet/core/signalr/javascript-client?view=aspnetcore-10.0), [autenticação SignalR](https://learn.microsoft.com/aspnet/core/signalr/authn-and-authz?view=aspnetcore-10.0).
