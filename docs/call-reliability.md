# Chamadas, diagnóstico e entrega de versões

## Para quem usa o Discorda

- Em **Configurações → Conexão e diagnóstico → Testar minha chamada**, fale durante seis segundos e confirme se ouviu o sinal nos fones. O teste usa a entrada/saída escolhida, não grava nem transmite áudio e encerra a captura ao cancelar ou fechar. Ele verifica API/banco; não certifica o caminho WebRTC entre redes. Saia da chamada para executá-lo.
- Falta de permissão, entrada ausente, dispositivo ocupado e ausência de sinal têm orientações diferentes. Se o dispositivo for interrompido durante a chamada, reconecte-o e use **Ligar microfone**. Câmera e compartilhamento não são restaurados automaticamente numa nova conexão.
- A reconexão mostra tentativas e intervalos. Enquanto o sistema indicar ausência de rede, não consome as oito tentativas. Voltar da suspensão retoma a conexão/áudio e registra novamente os atalhos configurados. Sair manualmente cancela a recuperação; remoção por moderação não dispara retorno automático.
- **Texto e trabalho** prioriza resolução; **Vídeo e jogos**, fluidez. Resolução/FPS escolhidos são limites. As estatísticas distinguem quadros exibidos de quadros codificados/recebidos na camada observada, além de bitrate e sinais de limitação. Telas estáticas podem transmitir menos quadros sem defeito.
- As abas de configurações aceitam setas para cima/baixo, Home e End; Tab leva ao conteúdo, Escape fecha e devolve o foco. Há um atalho de teclado visível ao receber foco para ir direto à conversa. Alto contraste e redução de animações também se aplicam aos novos controles.

## Para quem administra

O painel **Operação do servidor** atualiza a cada 15 segundos enquanto a janela estiver visível. O servidor mantém cache para não repetir consultas a cada administrador. API, banco, LiveKit, armazenamento, backup e restauração verificada são indicadores distintos; ausência de registro não significa backup válido.

O painel inclui versões de assembly da API, .NET, PostgreSQL e protocolo. A versão de assembly não é necessariamente a tag Git. A versão efetiva do LiveKit deve ser conferida no host; o painel informa sua disponibilidade, não inventa uma versão a partir do nome da imagem.

**Exportar saúde do servidor** abre o diálogo de salvar do aplicativo. A exportação reconstrói uma lista restrita de números, datas, estados e versões; não serializa configurações, mensagens, endereços, e-mails ou exceções. Ela exige a mesma autorização de proprietário da consulta de operação.

## Compatibilidade e recuperação de atualização

1. Atualize primeiro o servidor e confirme `/health/ready` e `/api/v1/compatibility` (protocolo atual: `1`). A API mantém os endpoints anteriores.
2. Valide uma versão beta com o grupo de teste antes de publicar a estável. Os canais já existentes continuam optativos e não permitem downgrade.
3. O manifesto mantém sua assinatura original para clientes antigos e acrescenta uma assinatura Ed25519 de `{version, sha256, protocolMin, protocolMax}`. No novo cliente, releases a partir de `0.13.1-beta.1` exigem esses metadados; remover ou modificar a compatibilidade invalida a verificação. Para um protocolo novo, ajuste o endpoint e o intervalo do assinador em conjunto, após testar as versões suportadas.
4. Antes de instalar, o cliente novo consulta novamente o protocolo do servidor selecionado. Protocolo desconhecido/incompatível impede a instalação e explica o motivo. Sem servidor selecionado, considera o protocolo implementado pelo próprio cliente. Clientes antigos não possuem esse bloqueio: por isso a ordem servidor → beta → estável continua necessária.
5. Se o desktop não abrir, execute novamente o instalador oficial da mesma versão ou uma versão corrigida mais nova. Não exclua o perfil do Windows. Não existe rollback binário automático: uma reversão deve ser publicada com número maior e assinatura válida, preservando as restrições de segurança.
6. No servidor, mantenha backup verificado e configuração privada protegida antes da implantação. Não reverta automaticamente migrations nem restaure um banco antigo sobre novas mensagens. Consulte o [guia de VPS](vps.md) e o [guia operacional](selfhosting-operations.md).

## Validação antes de uma release

```powershell
npm test
npm run build
npm run test:desktop
dotnet test Discorda.slnx -c Release
node tools/media-lab/smoke.mjs --regression
```

No Windows, o laboratório nativo requer a instalação de teste documentada em `tools/media-lab/setup-windows.ps1`; `--docker` usa o container isolado. O laboratório usa exclusivamente áudio sintetizado e canvas, nunca microfone/câmera físicos. Verifica dois participantes, tela com áudio, mute/unmute, encerramento de transmissão, recuperação de sinalização e troca de sala. Não simula perda de energia nem certifica TURN, firewall ou redes externas.

O empacotamento oficial executa os testes unitários, build, E2E e regressão de mídia antes de assinar. A CI também possui um job de mídia em Linux/Docker. Traces de E2E ficam locais em caso de falha; fixtures com aliases usam caches Vite separados para não invalidar o cache dos demais testes.

O navegador descartável da regressão recebe permissões para dispositivos falsos, evitando depender da descoberta mDNS de interfaces locais entre host e container. Nenhuma dessas opções é aplicada ao aplicativo ou ao laboratório interativo. O Chromium documenta a relação entre permissão/política e exposição dos [endereços locais de ICE](https://chromium.googlesource.com/chromium/src/+/376fc41e87a058f7a7b300b0ec3a4982b4ec0960/components/policy/resources/templates/policy_definitions/Miscellaneous/WebRtcLocalIpsAllowedUrls.yaml).

### Verificação local desta entrega

Em 03/10/2026: build/typecheck, 69 testes unitários de desktop, 55 testes de backend e a execução completa dos 8 E2E passaram. O empacotamento comunitário e o teste de abertura do executável empacotado passaram. O teste adicional de voz confirmou retomada após evento de suspensão simulado, câmera/tela desligadas e saída manual sem retorno automático. O laboratório nativo passou a regressão completa de mídia.

Houve também timeouts intermitentes na automação de navegador, inclusive após isolar os caches; a execução final dos cenários de diagnóstico/voz com tracing passou. O Docker Desktop no Windows teve execuções aprovadas e falhas repetidas no estabelecimento de ICE: mDNS foi um fator identificado, mas disponibilizar candidatos explícitos não resolveu todas as repetições. Não se considera esse caminho estabilizado. Use o laboratório nativo no Windows; o job Linux/Docker ainda precisa rodar na CI remota. Não foram alterados firewall nem serviços reais para contornar a falha. Logs e traces de teste ficam em diretórios ignorados e não devem ser publicados sem revisão.

Antes de promover a beta, faça um teste em dois PCs/redes: fala nos dois sentidos, tela com som, desligar/religar a rede, suspender/retomar o Windows e remover/reconectar fones USB/Bluetooth. Confira que sair manualmente impede reconexão e que câmera/tela não voltam sozinhas. Testes sintéticos não substituem esses dispositivos reais.
