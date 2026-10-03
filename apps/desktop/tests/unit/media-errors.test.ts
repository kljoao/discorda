import {expect,it} from 'vitest';
import {mediaErrorMessage} from '../../src/renderer/features/chat/media-errors';

it('distinguishes denied permission, missing hardware and capture failures',()=>{
  expect(mediaErrorMessage({name:'NotAllowedError'})).toContain('acesso para aplicativos da área de trabalho');
  expect(mediaErrorMessage({name:'OverconstrainedError'})).toContain('selecione outro microfone');
  expect(mediaErrorMessage({name:'NotReadableError'})).toContain('modo exclusivo');
  expect(mediaErrorMessage({name:'AbortError'})).toContain('interrompida');
  expect(mediaErrorMessage(new Error('private driver details'))).not.toContain('private driver details');
  expect(mediaErrorMessage(null)).toContain('Diagnóstico');
});
