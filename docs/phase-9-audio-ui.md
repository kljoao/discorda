# 0.5.0 — Voz integrada, volume por pessoa e áudio do PC

## Interface
Tema neutro escuro com destaque discreto azul. Entrar em voz mantém o chat na área principal. Microfone, câmera, tela, saída de som e desconexão ficam no rodapé da lateral. Câmeras/telas abrem a aba Chamada; Chat mantém o rascunho e a voz ativa. Sem modal para a sala. O seletor de captura e as configurações continuam sendo diálogos temporários.

Botão direito sobre um membro na lista da sala ou sobre sua câmera/tela abre volume individual. Voz começa em 150%; som compartilhado em 100%; ambos ajustáveis de 0 a 400%. Preferências locais usam o UUID do membro, correlacionado com a identidade de mídia pela lease autenticada retornada no roster. Nomes iguais não misturam preferências. A API atualizada é necessária para essa correlação. A tela de áudio/vídeo permite trocar dispositivos e testar o microfone.

Reprodução usa um AudioContext por chamada, ganho independente por trilha e limitador na soma. Os elementos de áudio ficam com volume zero; há apenas uma saída audível pelo grafo. Ensurdecer zera os ganhos de voz e compartilhamento, sem apagar preferências. Microfone usa AGC do navegador, cancelamento de eco, redução de ruído e o controle de sensibilidade existente.

## Captura automática Windows 11
A opção Compartilhar som do PC não depende mais da lista de janelas elegíveis. O helper descobre sessões WASAPI em todos os dispositivos de saída ativos, captura e mistura os processos identificados. Detecta novas sessões durante a transmissão. Exclui árvores do Discord/Discorda e o processo Electron proprietário; também rejeita ancestrais que incluiriam essas árvores e elimina duplicação de sessões aninhadas.

Uma opção adicional exclui Chrome, Edge, Firefox, Brave, Opera e Vivaldi (e filhos), para quem usa Discord web. Sem essa opção, áudio de todas as abas desses navegadores faz parte do áudio do PC.

Limites explícitos: notificações/sessões com PID zero ou processo não identificável ficam fora; áudio protegido pode ser indisponível. Não há fallback para mixagem geral que reintroduza o retorno das chamadas. Descoberta a cada 750 ms, PCM estéreo 48 kHz em blocos de 20 ms; buffers limitados. Sem áudio em disco. Falha de descoberta limpa capturas; heartbeat encerra helper caso o renderer pare de responder. Recursos nativos e runtimes acompanham instalador.

Windows 10 comum não tem a API seletiva necessária. Por decisão do usuário nesta etapa, priorizado modo automático no Windows 11; modo assistido com dispositivo virtual adiado. Chat, microfone, câmera e tela sem esse áudio continuam disponíveis. O app informa a limitação.

## Validação local
- 23 testes de integração do backend, incluindo roster com lease correta.
- 5 testes de exclusão nativa (Discord/variantes, filhos, ancestrais, duplicação, navegadores, ciclos).
- Teste nativo com tons de processos independentes: dois aplicativos misturados, inclusive um iniciado depois da captura; terceiro processo excluído (93 dB de separação medidos).
- Dois clientes Electron: ganho real de reprodução 250%, volumes separados, ensurdecer/restaurar; chat preserva rascunho e conexão; vídeo em aproximadamente 1904 × 1066 a 60 fps sustentados.
- Integração com login Supabase real, whitelist, API/LiveKit Radmin, áudio automático com energia WebRTC não nula, permissões com dispositivos sintéticos e captura real de janela.
- Testes de UI e unidade do desktop; evidências visuais em artifacts/radmin/chat-0.5.png e call-0.5.png (fixtures).
- Validação entre redes/PCs dos amigos ainda depende de testarem o novo instalador.

Instalar 0.5.0 sobre a versão anterior com o app fechado. Atualizar todos os clientes. Servidor mantém os mesmos endereços/portas.
