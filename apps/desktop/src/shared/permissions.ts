export const permission={view:1,send:2,attach:4,react:8,threads:16,manageMessages:32,manageChannel:64,managePermissions:128,connect:256,speak:512,camera:1024,share:2048,manageRoles:4096,manageChannels:8192,manageServer:16384,moderateVoice:32768,audit:65536,administrator:131072} as const;
export const allPermissions=262143,defaultPermissions=3871,channelPermissions=36863;
export function can(flags:number|undefined,value:number,fallback=false){return flags===undefined?fallback:(flags&value)===value;}
export const permissionCatalog=[
 {value:permission.view,label:'Ver canal',description:'Encontrar o canal e acessar seu conteúdo.',group:'Acesso'},
 {value:permission.send,label:'Enviar mensagens',description:'Conversar e editar as próprias mensagens.',group:'Texto'},
 {value:permission.attach,label:'Enviar arquivos e áudios',description:'Publicar imagens, vídeos, arquivos e mensagens de voz.',group:'Texto'},
 {value:permission.react,label:'Adicionar reações',description:'Reagir às mensagens com emojis.',group:'Texto'},
 {value:permission.threads,label:'Responder em tópicos',description:'Publicar respostas em conversas organizadas.',group:'Texto'},
 {value:permission.manageMessages,label:'Moderar mensagens',description:'Excluir mensagens de outras pessoas e gerenciar mensagens fixadas.',group:'Moderação'},
 {value:permission.connect,label:'Entrar na chamada',description:'Conectar-se à sala de voz e ouvir os participantes.',group:'Voz e vídeo'},
 {value:permission.speak,label:'Falar na chamada',description:'Ativar o microfone na sala.',group:'Voz e vídeo'},
 {value:permission.camera,label:'Usar câmera',description:'Transmitir a webcam na sala.',group:'Voz e vídeo'},
 {value:permission.share,label:'Compartilhar tela',description:'Transmitir a tela e o áudio dos aplicativos.',group:'Voz e vídeo'},
 {value:permission.moderateVoice,label:'Moderar chamadas',description:'Mover ou remover participantes de cargos inferiores.',group:'Moderação'},
 {value:permission.manageChannel,label:'Gerenciar canal',description:'Alterar o nome e arquivar o canal.',group:'Administração'},
 {value:permission.managePermissions,label:'Gerenciar acesso do canal',description:'Configurar regras de cargos e pessoas neste canal.',group:'Administração'},
 {value:permission.manageRoles,label:'Gerenciar cargos',description:'Criar e atribuir cargos inferiores ao próprio, dentro das permissões recebidas.',group:'Servidor'},
 {value:permission.manageChannels,label:'Criar canais',description:'Criar canais de texto e salas de voz.',group:'Servidor'},
 {value:permission.manageServer,label:'Gerenciar servidor',description:'Alterar o nome da comunidade.',group:'Servidor'},
 {value:permission.audit,label:'Ver registro administrativo',description:'Consultar ações administrativas, sem conteúdo de mensagens.',group:'Servidor'},
 {value:permission.administrator,label:'Administrador',description:'Acesso completo, ignorando restrições dos canais. Não transfere a propriedade do servidor.',group:'Servidor'},
] as const;
export interface PermissionRole {id:string;name:string;color:string;position:number;permissions:number;isEveryone:boolean;version:number;editable?:boolean}
export interface RoleMember {id:string;name:string;roleIds:string[];version:number;editable:boolean}
export interface RoleManagement {roles:PermissionRole[];members:RoleMember[];granted:number;position:number}
export interface PermissionOverwrite {id:string;roleId:string|null;userId:string|null;allow:number;deny:number;version:number}
export interface ChannelPolicy {channel:{id:string;name:string;version:number};granted:number;roles:Pick<PermissionRole,'id'|'name'|'color'|'isEveryone'>[];members:{id:string;name:string;access:boolean}[];overwrites:PermissionOverwrite[]}
