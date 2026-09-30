# Segurança

Não publique credenciais, e-mails de membros, IPs privados, arquivos de conexão, dumps, logs ou capturas de configurações em issues. Relate vulnerabilidades pelo recurso **Report a vulnerability / Private vulnerability reporting** do GitHub, quando habilitado no repositório; caso indisponível, peça um canal privado ao mantenedor sem incluir detalhes exploráveis.

## Modelo de confiança

- Supabase valida login Google; API valida assinatura, emissor, audience, expiração, sessão e identidade confirmada no provedor.
- A lista local vincula cada e-mail a uma identidade; autenticação Google não concede acesso sozinha.
- Endpoints administrativos exigem membro autorizado e e-mail administrador configurado no servidor.
- Secrets de banco/LiveKit existem apenas no host. PAT Supabase é usado somente durante a alteração do provedor, sem persistência. A chave publishable é pública por definição.
- Arquivos privados são ignorados pelo Git e pelo build Docker. Isso não remove um segredo que já tenha sido publicado: nesse caso revogue/rotacione e remova do histórico.
- A API/LiveKit de casa usam TLS com certificado fixado no desktop. O JSON de conexão deve ser recebido por canal confiável; importar outro certificado significa confiar em outro host.
- O painel local HTTP fica publicado exclusivamente em loopback. Não altere essa porta para `0.0.0.0` e não encaminhe por túnel sem HTTPS.
- O Firewall é aplicado pelo operador Windows. Docker não garante a restrição por IP apenas porque uma lista foi salva. Revise regras permissivas existentes e valide bloqueio com outra máquina.

## Antes de tornar público

Execute `npm run audit:source`, revise `git status --short` e os arquivos a publicar. O scanner é uma barreira auxiliar, não prova de ausência de segredos. Não force inclusão de arquivos ignorados. Não publique o diretório de trabalho como um ZIP completo. Testes usam credenciais fictícias; produção e backups ficam fora do código.

As builds comunitárias desabilitam atualização oficial automática. Releases do mantenedor usam manifesto Ed25519 e hash do instalador; mantenha a chave privada fora do repositório e fora de pull requests. Assinatura de atualização não elimina avisos de SmartScreen.
