/** Do not expose raw driver errors or server details in device diagnostics. */
export function mediaErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  switch (name) {
    case 'NotAllowedError': case 'PermissionDeniedError':
      return 'Acesso ao microfone/câmera negado. No Windows, abra Privacidade e segurança → Microfone e habilite o acesso para aplicativos da área de trabalho. Confira também as permissões em Dispositivos.';
    case 'NotFoundError': case 'DevicesNotFoundError': case 'OverconstrainedError':
      return 'O dispositivo selecionado não está disponível. Reconecte seus fones ou selecione outro microfone em Dispositivos e tente novamente.';
    case 'NotReadableError': case 'TrackStartError':
      return 'O Windows não conseguiu abrir o dispositivo. Confira a conexão e feche aplicativos que possam estar usando o microfone em modo exclusivo; depois tente novamente.';
    case 'AbortError':
      return 'A captura foi interrompida. Reconecte o dispositivo e tente novamente.';
    default:
      return 'Não foi possível concluir o áudio/vídeo. Confira o teste de microfone em Configurações e o estado da conexão em Diagnóstico.';
  }
}
