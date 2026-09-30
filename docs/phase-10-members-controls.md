# 0.6.0 — Membros, controles compactos e identidade Windows

- Membros presentes à direita (disponíveis e ausentes), com nome personalizado e foto Google. A URL vem do perfil verificado do Supabase e é limitada a HTTPS/googleusercontent.com; não é usada para autorizar acesso. O renderer permite somente essas origens adicionais de imagem. Falha/ausência de foto usa inicial. Fotos acompanham perfil/presença sem migration; usuários precisam estar conectados para aparecer.
- Rodapé esquerdo: voz conectada e desconectar; câmera/tela; identidade do usuário, microfone + seletor, fone + seletor, configurações. Input/output podem ser escolhidos sem sair do chat. Output salvo indisponível volta ao padrão do Windows.
- Ping é RTT medido das conexões ICE/WebRTC, atualizado a cada 3 segundos e exposto ao passar o mouse/focar o indicador. Sem estimativas inventadas quando não há amostra.
- Nenhum controle de pausa da transmissão: controles/contexto/PiP nativos desabilitados; evento de pausa retoma a trilha viva. Encerra-se a transmissão pelo botão de tela. Recepção não pausa automaticamente ao ocultar os vídeos no chat.
- Ícone original vetorial em resources/icon.svg e ICO multirresolução (16/24/32/48/64/128/256), gerado por tools/generate-icon.ps1. Aplicado no executável, janela, instalador, atalhos de Desktop e Menu Iniciar. AppUserModelID estável para integração Windows.

Validação: testes de API/URL da foto, UI com lista à direita, troca rápida de input/output, ping real, retomada ao tentar pausar, câmera/tela/voz entre dois clientes. As mesmas limitações de áudio do Windows 11 da versão 0.5.0 permanecem.

Atualizar instalando por cima, com o aplicativo fechado.
