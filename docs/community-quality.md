# Qualidade e comunidade — 0.10

## Estruturas e custo

- Histórico: merge de duas sequências por ID de 64 bits em O(n + m log m), com n mensagens carregadas e m atualizações recebidas. A ordenação só incide no lote novo; mensagens duplicadas mantêm a maior versão. Respostas e nomes usam Map para consulta média O(1), evitando busca linear por mensagem. Renderização ainda custa O(n); `content-visibility` reduz pintura fora da tela, mas não é virtualização completa.
- Reconciliação de mídia: índice por lease evita uma busca em todas as leases para cada participante. A associação custa O(L + P) em média, além de consultas ao banco e RPCs ao LiveKit. Listas da interface são agrupadas por canal/identidade uma vez por alteração.
- Busca: tsvector gerado pelo PostgreSQL e índice GIN, parâmetros SQL/EF e páginas de até 50 resultados. Não há promessa de O(1): termos muito frequentes e grandes conjuntos de resultados continuam custosos. Histórico e auditoria usam cursor por ID, sem OFFSET crescente.
- Últimas mensagens: busca pelo índice composto canal/ID por canal, em vez de agrupar toda a tabela de mensagens para carregar o workspace.
- Reações: chave única mensagem/usuário/emoji torna requisições repetidas idempotentes. Apenas seis emojis são aceitos. Consultas em lotes de no máximo 100 IDs, cache e invalidação por mensagem evitam uma requisição por item e atualização integral a cada reação.
- Leitura: upsert atômico com GREATEST impede regressão entre computadores. O servidor exige mensagem existente no canal autorizado; não aceita marcar IDs futuros como lidos.

## Segurança e permissões

O estado do renderer não concede privilégios. Todas as operações de gestão são verificadas novamente na API; cargos persistidos de proprietário não substituem `Admin.Email`. Operações administrativas são limitadas por taxa. Busca, IDs, enumerações, lotes e IPC têm limites explícitos. Mensagens e resultados são renderizados como texto React; nenhum HTML de usuário é executado.

Auditoria inclui ator, ação, alvo e data. Não inclui corpo de mensagem, token ou segredo. Alterações de cargo, criação de canais, exclusões moderadas, fixadas, acessos, rede e movimentação de voz geram registros. A auditoria é operacional e não é um registro imutável contra o administrador do banco. Alterações de configuração feitas diretamente no sistema operacional são responsabilidade do operador.

No modo pressionar para falar, um heartbeat de 80 ms renova uma janela de 300 ms no AudioWorklet. Ausência de heartbeat fecha o áudio. O componente Windows só consulta a tecla de função escolhida; não captura texto nem grava atividade do teclado. O teste de microfone ignora essa trava exclusivamente na monitoração local. Nunca use o monitor local sem fones.

Backup e restauração são executados somente no host. A verificação usa um container nomeado aleatoriamente, sem rede, portas publicadas ou montagem de arquivos do host; copia apenas o dump para dentro. O container é removido ao finalizar. Verifique apenas backups próprios. O teste confirma que o dump restaura e contém tabelas, não que todos os arquivos/configurações externas estão recuperáveis. É necessário guardar essas configurações e uma cópia fora do disco do host.

## Validação automatizada

```powershell
npm test
dotnet test Discorda.slnx -c Release -p:UseAppHost=false
dotnet test tools/windows-audio-tests -c Release
npm run build
npm run test:desktop
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/test-host-panel.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/server-panel.ps1 -SmokeTest
node tools/media-lab/smoke.mjs --soak-minutes=120
npm run audit:source
```

O teste de mídia usa dois clientes sintéticos, um LiveKit isolado em loopback e uma reconexão de sinalização. A duração aceita é de 0 a 240 minutos. Não utiliza contas, dispositivos físicos ou banco de produção. O relatório fica em `artifacts/media-lab/result.json`. Não execute duas instâncias do laboratório simultaneamente. O teste de backup usa uma base sintética em containers exclusivos, nunca o banco do grupo.

## Homologação no grupo

1. Comparar Automático/Jogos/Texto com textos pequenos e cenas em movimento, duas máquinas e depois vários espectadores. Observar FPS e resolução recebidos, perda e bitrate. Limitar a camada de um espectador não deve alterar a seleção dos demais.
2. Testar voz normal, sussurro e voz alta; alternar o filtro; verificar volume de outro membro e ausência de eco do Discord/Discorda. Testar PTT com o app minimizado e durante o jogo; soltar a tecla precisa silenciar. Repetir após suspensão e troca de fones.
3. Manter uma chamada por pelo menos duas horas, anotar CPU/memória no início e fim, desconectar/reconectar rede e trocar dispositivos. Encerrar a transmissão deve liberar a captura.
4. Exercitar cada cargo com contas diferentes. Membro não pode administrar; moderador não promove ninguém; administrador não altera pares/proprietário; proprietário pode revogar delegações. Remoção de voz não deve disparar reentrada automática.
5. Instalar uma beta assinada em um computador de teste. Verificar confirmação após reinício, bloqueio durante chamada e recusa de manifesto/instalador adulterado.

Os testes sintéticos e a revisão local não certificam ausência de vulnerabilidades nem substituem validação em redes e hardware reais. Nenhuma informação privada deve ser incluída em issues, screenshots de produção ou releases.

## Banco externo do piloto

O backup externo inclui apenas o schema `discorda`, não os schemas de autenticação ou outras aplicações do Supabase. O cliente `pg_dump` 17 precisa ser compatível com o servidor (servidores de versão superior exigem atualizar a imagem cliente). A conexão temporária fica em arquivo com ACL restrita, é copiada para um container descartável e removida ao terminar. Senhas não são passadas na linha de comando. Os backups e configurações continuam privados, fora do Git.

Para migrações, `tools/migrate-native.ps1` compara host, porta e banco da conta ativa com a conexão de manutenção. A credencial privilegiada é fornecida somente ao processo de migração, por variável de ambiente, e retirada antes de iniciar a API. `Migration:RuntimeRole` é uma opção de CLI com identificador estritamente validado; concede operações de dados no schema da aplicação, sem DDL, à conta que executa a API. O backup sempre precede a migração no inicializador nativo. Uma conexão externa sem conta de manutenção precisa ter permissões suficientes para migrar ou ser migrada pelo operador.

## Resultado desta rodada

Foram executados testes unitários, de integração, da interface empacotada e do componente nativo de áudio, além de backup/restauração em banco descartável. O laboratório de mídia foi executado por dois minutos com dois clientes sintéticos e reconexão de sinalização. A opção de duas horas está preparada, mas a homologação prolongada em computadores e dispositivos reais não foi realizada nesta rodada.
