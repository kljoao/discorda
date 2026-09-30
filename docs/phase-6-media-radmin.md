# Voz, vídeo e instalador para teste no Radmin

O cliente inclui canais de voz, câmera, compartilhamento de tela/janela, áudio do sistema opcional, mute, ensurdecer, seleção de dispositivos e volume por participante. Entrar não liga dispositivos. Minimizar a chamada permite continuar no chat. Sair, fechar a janela ou sair da conta interrompe as trilhas locais.

## Teste com o amigo

1. Os dois PCs devem estar na mesma rede Radmin e ter Internet para o login Google/Supabase.
2. No PC do João, iniciar `tools/start-radmin.ps1`. A API e o LiveKit precisam permanecer ativos. Na primeira vez, executar `tools/allow-radmin.ps1` e aceitar a elevação do Windows.
3. Enviar somente `apps/desktop/release/Discorda-0.2.0-setup.exe` ao amigo. Ele instala e entra com `friend@example.com`, já habilitado na whitelist. O instalador usa `https://26.10.10.1:7443` automaticamente.
4. Ambos entram em **Sala de voz** ou **Jogando juntos**, ligam o microfone e usam fones. Depois testar câmera e compartilhamento. Dois cliques em um vídeo solicitam tela cheia.

O certificado público do servidor e sua CA privada são confiados apenas dentro do Discorda; nenhuma raiz é instalada no Windows. Certificado, chaves privadas, senha do banco e API secret do LiveKit ficam separados: somente os certificados **públicos** e o endereço entram no cliente. O certificado de teste vence em seis meses; renovar requer regenerar o perfil e o instalador.

O firewall libera TCP 7443 (API/WSS), TCP 7881 e UDP 7882 (WebRTC) exclusivamente de `26.10.10.2` para `26.10.10.1`. Não há encaminhamento de portas no roteador. O servidor anuncia o endereço Radmin no ICE. A instalação do amigo não inclui serviços de servidor ou banco. Instalador sem assinatura comercial: o Windows pode mostrar aviso de editor desconhecido.

## Autorização e limites deste piloto

A API valida sessão, whitelist e associação ao grupo, cria a sala e emite JWT de 60 segundos, com identidade única da chamada, sala específica e permissões de mídia sem administração ou envio de dados. A aplicação renova uma concessão a cada 15 segundos; o servidor exige renovação em 45 segundos. A cada 10 segundos, verifica revogações no banco e remove participantes sem concessão válida, inclusive após reinício da API. Uma saída antiga não encerra a chamada nova.

O LiveKit self-hosted renova tokens durante chamadas; expiração de JWT não encerra uma conexão já estabelecida. A remoção periódica limita acessos antigos, mas não é revogação criptográfica imediata: um token copiado pode reconectar e permanecer até a próxima varredura. Para incidente com token vazado, parar o LiveKit e rotacionar sua chave (interrompe todas as chamadas). Este piloto não promete a revogação forte prevista para hospedagem definitiva. Se a API ficar fora do ar, o cliente oficial encerra a chamada na próxima renovação; o SFU isolado não consegue consultar a whitelist sozinho.

Áudio do sistema no Windows pode incluir o áudio recebido na própria chamada; a opção vem desligada. Não há garantia de exclusão do áudio do Discorda ou áudio isolado por janela. Sem gravação de chamadas. TURN público e teste entre redes sem Radmin ficam para a hospedagem futura. Windows nativo não oferece o monitor de capacidade de CPU do LiveKit; adequado ao teste local, a implantação definitiva deve usar Linux.

## Verificação

- Testes de integração: acesso anônimo negado, canal de texto recusado, assinatura/validade/escopo de token, concessão antiga e bloqueio da whitelist.
- `node tools/media-lab/desktop-smoke.mjs`: dois perfis Electron isolados, dispositivos sintéticos, sala descartável, áudio/vídeo RTP recebido nos dois sentidos pelo endpoint HTTPS/WSS e encerramento dos peer connections. Somente esse processo de teste substitui autenticação/IPC por fixtures; a aplicação distribuída não tem bypass.
- Verificação local com login Supabase real, autorização, permissão de mídia e publicação de câmera/microfone sintéticos. A conectividade no PC do amigo ainda precisa do teste feito por ele.

Referências: [grants do LiveKit](https://docs.livekit.io/frontends/reference/tokens-grants/), [captura no Electron](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts).

Resultado desta execução: 21 testes backend e 15 testes unitários desktop passaram; smoke do aplicativo empacotado e regressão de chat passaram. HTTPS com o perfil público do instalador confirmou API/banco disponíveis. A seleção e captura de uma janela real, sua interrupção, câmera/microfone sintéticos e ensurdecer passaram no cliente com Supabase real. Regras de firewall instaladas e verificadas com endereços restritos. Teste feito em duas instâncias no mesmo PC, ainda sem confirmação do PC remoto do amigo.
