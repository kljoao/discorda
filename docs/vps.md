# Ubuntu + Docker + Caddy existente

Esta receita usa um projeto Compose `discorda-vps`, banco sem porta publicada e uma API ligada à rede externa do seu Caddy. Não sobe outro proxy e não ocupa as portas 80/443 do host. Não substitua o Compose ou o Caddyfile do seu outro sistema.

Requisitos: Docker Engine com Compose v2, Python 3, Git e acesso root para proteger os arquivos locais. O desktop precisa de uma versão com suporte a domínio HTTPS; instaladores antigos que aceitam somente Radmin não servem para esta conexão.

## 1. DNS e configuração privada

Crie um registro A para seu subdomínio apontando para o IPv4 público da VPS. Não use o IP Radmin. Nesta primeira validação, utilize DNS direto, sem proxy intermediário. Só crie AAAA se a VPS, o firewall e o Caddy também estiverem configurados para IPv6.

```bash
git clone https://github.com/kljoao/discorda.git /opt/discorda
cd /opt/discorda
python3 tools/setup-vps.py
```

O assistente solicita domínio, IPv4 público, rede Docker e container Caddy, e-mail do proprietário, URL e publishable key do Supabase. Descobre somente o IP do Caddy nessa rede, cria senhas aleatórias e salva arquivos privados em `.discorda/vps`. Não altera Caddy, DNS ou firewall e não inicia serviços. Não envie essa pasta para o GitHub. Não execute o assistente novamente sobre uma configuração existente.

O e-mail proprietário será autorizado durante a migração. Mantenha o mesmo projeto Supabase para preservar as identidades dos usuários. Configure no Supabase os redirects `http://127.0.0.1:3000/redirect/**` (desktop) e `https://SEU-DOMINIO/admin/index.html` (painel). Google continua usando o callback do Supabase. Não é necessário pôr o client secret do Google na VPS.

## 2. Portas e recursos

Confira se TCP 7881 e UDP 7882/3478 estão livres antes de iniciar. Libere essas portas no firewall do provedor e na política efetiva do host. O Compose publica somente essas portas de mídia; API e banco não publicam portas. Regras Docker podem contornar UFW: valide externamente a exposição em vez de presumir que UFW cobre o encaminhamento dos containers.

```bash
ss -lntup
docker ps --format 'table {{.Names}}\t{{.Ports}}'
free -h
df -h
```

Limites iniciais: API 768 MiB/0,75 CPU, PostgreSQL 512 MiB/0,5 CPU e LiveKit 1536 MiB/1 CPU. Limites não reservam recursos e não garantem ausência de impacto no SaaS. A compilação da imagem também consome CPU/RAM; faça a primeira instalação em horário tranquilo. Meça `docker stats` durante transmissões antes de aumentar os limites ou o número de participantes.

Esta receita configura ICE UDP, ICE TCP e TURN UDP autenticado. **Não configura TURN/TLS em 443**, que conflitaria com o Caddy atual. Redes corporativas que bloqueiam as alternativas podem não conseguir chamadas; valide com seus usuários. Um fallback TURN/TLS exige planejamento adicional de IP/porta/proxy de camada 4. [Portas oficiais do LiveKit](https://docs.livekit.io/transport/self-hosting/ports-firewall/).

## 3. Banco existente: escolha antes de iniciar a API

Para começar vazio, prossiga para a etapa 4. Para preservar o grupo, faça backup do banco realmente usado pelo servidor anterior. O painel Windows oferece Backup; para o piloto com banco Supabase, exporta somente o schema `discorda`. Não copie tabelas `auth`, secrets do Supabase ou o banco de outro aplicativo.

Pare as escritas no servidor antigo durante o backup final e a migração; mantenha esse servidor e seu backup intactos até validar a VPS. Transfira `database.dump` por SCP para uma pasta privada na VPS. O dump contém mensagens, e-mails e permissões: nunca coloque em release ou pasta pública.

Inicie somente o PostgreSQL e confirme que o banco de destino está vazio:

```bash
bash tools/vps.sh database
docker compose --env-file .discorda/vps/compose.env -f infra/compose/vps.yml exec -T postgres psql -U discorda -d discorda -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');"
```

O resultado deve ser **0**. Se houver tabelas, pare: não restaure sobre elas e não use `--clean`. Somente depois da confirmação, restaure seu próprio backup (ajuste o caminho):

```bash
docker compose --env-file .discorda/vps/compose.env -f infra/compose/vps.yml exec -T postgres pg_restore -U discorda -d discorda --no-owner --no-privileges --exit-on-error --single-transaction < /CAMINHO/PRIVADO/database.dump
```

A tabela de histórico de migrations está no schema `discorda` e acompanha esse backup. Confira a versão do PostgreSQL de origem: o cliente 17 não lê dumps criados por versões maiores; nesse caso, planeje a versão de destino antes de importar.

## 4. Iniciar os serviços

```bash
bash tools/vps.sh start
bash tools/vps.sh status
```

O comando compila somente a API Discorda, espera o PostgreSQL, aplica migrations e inicia API/LiveKit. Em erro, não continue configurando o Caddy até corrigir. Consulte `bash tools/vps.sh logs`; não publique logs sem revisão.

A API usa `discorda_runtime`, uma conta com acesso somente aos dados necessários. A conta administrativa fica em `migration.json`, montado apenas no serviço de migration; não copie esse arquivo para o container da API. Ao atualizar uma instalação gerada pelo assistente antigo, `start` separa automaticamente essas contas, sem apagar o banco. Configurações customizadas exigem a adaptação descrita no [relatório de segurança](security-audit.md). Preserve `migration.json` junto ao restante da configuração privada nos backups. Alterações de `Admin.Email` devem ser feitas em `settings.json` e `migration.json` antes de migrar/reiniciar.

O PostgreSQL está fixado em `17.11-alpine3.23`, mantendo a mesma versão principal e família Alpine do ambiente anterior. A atualização reinicia o banco; reserve uma janela de manutenção. Não altere volumes nem use `down -v`. Extensões adicionais e índices customizados devem ser conferidos nas [notas oficiais do PostgreSQL 17.11](https://www.postgresql.org/docs/17/release-17-11.html).

## 5. Adicionar o subdomínio ao Caddy

Faça uma cópia do Caddyfile original. Adicione uma única vez o conteúdo de `.discorda/vps/Caddyfile.fragment`, que equivale a:

```caddyfile
SEU-DOMINIO {
    reverse_proxy discorda-api:8080
}
```

Preserve todos os blocos existentes. Com bind mount de um arquivo, confirme que o container enxerga a edição: editores que substituem o inode podem deixar o mount no arquivo antigo. Validar/recarregar o caminho montado garante que os comandos usam o que o container enxerga. Não execute `docker compose down` no projeto do SaaS.

```bash
docker exec NOME_DO_CADDY caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
# Apenas se a validação passar:
docker exec NOME_DO_CADDY caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
curl --fail https://SEU-DOMINIO/health/ready
```

O health deve retornar `Healthy`. Confira também o domínio do SaaS. A recarga é preferível a parar/reiniciar o proxy, mas pode reconectar WebSockets existentes; escolha um momento adequado. [Comandos oficiais do Caddy](https://caddyserver.com/docs/command-line).

## 6. Usar e administrar

Abra o cliente com suporte HTTPS, informe o domínio do grupo e confirme. O certificado público é validado pelas autoridades confiáveis, sem fixar o certificado que o Caddy renova. A conexão Radmin anterior continua funcionando com sua verificação de certificado.

Entre como proprietário e use Gerenciar grupo. A lista de IPs Radmin e o script de firewall Windows não controlam uma VPS pública: aqui a proteção de acesso é login/whitelist, e o firewall é administrado no Ubuntu/provedor. Valide login autorizado e recusado, busca, mensagens, presença, chamadas, compartilhamento com som e duas redes distintas.

Somente o IP exato do Caddy é confiável para os headers de encaminhamento. Se o container Caddy for recriado e mudar de IP, atualize `Proxy.TrustedIp` no arquivo privado e recrie a API. Não confie em todos os proxies ou em todos os clientes. O hostname `discorda-api` precisa ser único na rede externa.

## Operação

O proprietário pode consultar indicadores em **Administrar servidor → Acessos e rede do servidor → Operação do servidor**. O backup abaixo publica um resumo no volume de estado da API; o painel diferencia criação do dump de restauração testada. Veja os limites das métricas e instruções no [guia da comunidade](community.md).

```bash
bash tools/vps.sh backup
bash tools/vps.sh status
docker stats
```

Backup guarda somente o schema `discorda`, é privado e não é criptografado. Copie também a configuração privada de maneira criptografada para outro local; a cópia no mesmo disco não protege contra perda da VPS. Verifique a restauração em um PostgreSQL descartável antes de depender do backup. O agendamento Windows não funciona no Ubuntu; configure o agendamento Linux separadamente após validar a instalação e a retenção.

Para atualizar, faça backup, pare **somente** API/LiveKit com `bash tools/vps.sh stop`, execute `git pull --ff-only` e `bash tools/vps.sh start`. Não execute `down -v`: isso apaga dados. Uma atualização do desktop não atualiza o servidor. Para voltar ao servidor anterior após novas escritas, planeje a transferência dos dados; não faça duas cópias divergentes do grupo.

O Compose e os testes locais não comprovam DNS, certificados, firewall ou desempenho da sua VPS. A implantação só está concluída após validar os serviços naquele ambiente.
## Atualização assistida

Depois de instalar a versão que contém o assistente, execute na pasta do repositório:

```bash
bash tools/vps.sh update
```

Requer `git`, `curl`, `python3`, `flock` (util-linux no Ubuntu) e Docker Compose. Busca a última release estável do repositório GitHub configurado como `origin`; recusa alterações locais, atualizações simultâneas e commits que não avancem o checkout atual. Faz backup antes de parar chamadas, avança o código, inicia os serviços com migrações e verifica a versão exata da API e a prontidão do banco por até 90 segundos. O Caddy e outros projetos Docker não são alterados.

Na primeira adoção, obtenha os scripts com `git pull --ff-only`. Para reaplicar o código já presente e verificar os serviços, use `bash tools/vps.sh start` e `bash tools/vps.sh verify`. Se o código já corresponder à release mas a verificação falhar, esses dois comandos também recompõem os containers.

No aplicativo, o painel **Operação do servidor → Atualizar o servidor** exibe versões, protocolo, etapas e verificação de API/banco. O comando é executado por você via SSH; a API não tem acesso ao socket do Docker nem executa comandos remotos.

Uma falha interrompe o procedimento e exige consultar `bash tools/vps.sh logs`. Não há restauração automática do banco, pois migrações e novas mensagens podem tornar uma reversão insegura. O caminho do backup é informado antes da parada. A verificação confirma API, banco e versão; teste também uma chamada e o caminho HTTPS público após atualizar.
