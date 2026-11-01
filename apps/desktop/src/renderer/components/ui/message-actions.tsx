import type {ButtonHTMLAttributes,ReactNode} from 'react';

export function MessageAction({label,children,danger=false,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{label:string;children:ReactNode;danger?:boolean}){
 return <button type="button" {...props} aria-label={label} data-tooltip={label} className={'message-action'+(danger?' danger':'')}><span aria-hidden="true">{children}</span></button>;
}
