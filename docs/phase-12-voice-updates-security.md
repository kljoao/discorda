# 0.7.0 — Voz, recuperação e distribuição pública

## Voz

- Foto Google na lista da sala e anel azul quando a pessoa fala. Dentro da chamada, o estado vem do LiveKit; o servidor retransmite a atividade para observadores fora da chamada. Só a própria sessão com concessão de voz vigente pode emitir atividade; eventos têm limite de frequência e expiram no cliente em 2,5 segundos.
- Reconexão nativa do LiveKit para interrupções breves. Falhas persistentes/expiração da concessão levam a nova autorização no servidor e até oito tentativas espaçadas. Sair manualmente cancela tentativas; remoção, identidade duplicada e acesso negado não disparam retorno automático.
- Uma recuperação completa mantém o estado de ensurdecer e tenta restaurar o microfone se estava ligado. Câmera/tela precisam ser ligadas novamente após uma entrada totalmente nova; a reconexão curta do SDK pode preservar as trilhas existentes.
- Saída removida volta ao padrão do Windows. Microfone desaparecido fica silenciado, com seleção do padrão e aviso para ligar conscientemente.
- Redução de ruído WebRTC, padrão ativado, agora tem controle visível e persistido. Alterar o filtro reinicia a captura de microfone; eco e ganho automático continuam. Não é Krisp/RNNoise e não promete eliminar qualquer ruído.

## Separação de dados privados

O instalador não contém mais `resources/lan.json`. A conexão privada fica em `server.json` no diretório de dados do usuário, fora do aplicativo e preservada nas atualizações. A tela inicial permite importar JSON após confirmar explicitamente o servidor e reiniciar. O arquivo aceita somente origem HTTPS e certificados públicos válidos para esse servidor. Não aceita senha, tokens ou campos extras. Configuração corrompida permite reimportar em vez de impedir a inicialização.

O dono envia esse arquivo separadamente aos amigos. Ele inclui o endereço do servidor e certificados públicos, não chaves privadas ou credenciais. Não deve ir para os assets do GitHub. Participantes conectados inevitavelmente conseguem identificar o endereço do servidor; esta mudança remove os endereços do download público.

Revisão do pacote: ausência de LAN/configuração pessoal, árvore node_modules, credenciais reconhecíveis, IPs Radmin e e-mails conhecidos; comparação adicional dos 222 arquivos com valores privados locais em UTF-8 e UTF-16. Não equivale a uma auditoria completa de segurança. Nenhuma credencial privada é necessária no renderer. Sessões continuam no cofre do Windows; whitelist e autorização continuam no servidor.

## Atualizações automáticas

Destino fixo: `https://github.com/kljoao/discorda`. Usa electron-updater/NSIS. Verifica 30 segundos após abrir e a cada quatro horas; também há botão nas configurações. Download automático; instalação só com clique em **Instalar e reiniciar**, fora da chamada. Não instala automaticamente ao fechar o app.

Cada release precisa de manifesto Ed25519 assinado, além do SHA-512 do electron-updater. A chave pública está no aplicativo. O manifesto vincula versão, nome do instalador, tamanho e SHA-256. A assinatura é verificada antes do download; os bytes são verificados antes de marcar como pronto e novamente antes de instalar. Versões antigas, nomes inesperados, chave errada ou instalador alterado são rejeitados. A verificação personalizada do NSIS usa essa chave; ela **não é assinatura Authenticode**, portanto não elimina alertas de editor desconhecido do Windows.

A chave privada de publicação está somente em `%LOCALAPPDATA%\DiscordaBuild\update-signing.pem`. Faça backup privado: perder/trocar essa chave sem uma migração impede atualizar as instalações existentes. Não subir ao GitHub. Outra máquina de build precisa dessa mesma chave, fornecida por `DISCORDA_UPDATE_SIGNING_KEY` ou no mesmo caminho privado.

### Publicar

1. Gerar com `npm run package:release`. O comando não publica automaticamente; valida o conteúdo e gera a assinatura. `package:win` gera uma build comunitária sem assinatura de atualização.
2. Criar uma release normal, não prerelease, com tag **v0.7.0** no repositório informado.
3. Anexar somente estes quatro arquivos da pasta preparada para publicação:
   - `Discorda-0.7.0-setup.exe`
   - `Discorda-0.7.0-setup.exe.blockmap`
   - `latest.yml`
   - `discorda-update.json`
4. Publicar a release quando os quatro uploads terminarem. Não anexar `win-unpacked`, projeto inteiro, arquivos antigos do piloto ou JSON de conexão privada.

A 0.6.x não possui atualizador: instalar a 0.7.0 manualmente uma vez. Depois de importar a conexão privada uma vez, versões posteriores a preservam. Para a próxima release, aumentar versão, gerar novamente e usar tag correspondente (`v0.7.1`, por exemplo). Não substituir binários de uma release já publicada.

## Validação e limites

33 testes de backend, incluindo atividade de voz autorizada recebida fora da chamada e rejeição de outra sessão/concessão encerrada. 30 testes unitários desktop e três de UI; testes de dois clientes com mídia real, cerca de 60 fps, renovação de concessão e recuperação da voz. Remoção de fones simulada via eventos de dispositivos e teste real do filtro de captura. Google e captura de áudio do PC conferidos no executável empacotado.

As assinaturas e alterações de instalador têm testes automatizados. A atualização completa de uma versão publicada no GitHub para outra ainda exige duas releases disponíveis e teste em uma instalação Windows; não foi declarada validada nesta entrega.
