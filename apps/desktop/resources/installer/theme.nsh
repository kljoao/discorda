!define MUI_BGCOLOR "15161D"
!define MUI_TEXTCOLOR "E8EAF3"
!define MUI_INSTFILESPAGE_COLORS "A6B2FF 101117"
!define MUI_FINISHPAGE_NOAUTOCLOSE
!define MUI_WELCOMEPAGE_TITLE "Seu grupo, no mesmo lugar."
!define MUI_WELCOMEPAGE_TEXT "Conversas, partidas e bons momentos.$\r$\n$\r$\nVamos preparar o Discorda para você encontrar sua comunidade.$\r$\n$\r$\nAs próximas atualizações são aplicadas diretamente pelo aplicativo, sem repetir este assistente."
!define MUI_FINISHPAGE_TITLE "Tudo pronto. Entre na conversa."
!define MUI_FINISHPAGE_TEXT "O Discorda está instalado.$\r$\n$\r$\nAbra o aplicativo e conecte-se ao seu servidor para continuar de onde parou."
!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend
!macro customHeader
  BrandingText "Discorda · Seu grupo, no mesmo lugar."
!macroend
!macro customInit
  ; The previous client also passes --updated. Honor it during this first upgrade,
  ; while manual installations keep the branded wizard.
  ${if} ${isUpdated}
    SetSilent silent
  ${endif}
!macroend
