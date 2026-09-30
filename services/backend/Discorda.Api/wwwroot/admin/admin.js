'use strict';
const $ = id => document.getElementById(id);
let token; // Access tokens live only in memory; never localStorage or URLs.
let configuration;
const say = message => { $('status').textContent = message; };
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
async function api(path, options = {}) {
  const response = await fetch('/api/v1/admin/' + path, { ...options, headers: {
    'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', ...options.headers } });
  if (!response.ok) {
    if (response.status === 401) { token = undefined; $('panel').hidden = true; throw Error('Sessão expirada. Entre novamente.'); }
    if (response.status === 403) throw Error('Este e-mail não é o administrador do servidor.');
    const body = await response.json().catch(() => ({}));
    throw Error(body.error || 'Não foi possível concluir a operação.');
  }
  return response;
}
async function load() {
  const settings = await (await api('settings')).json();
  const people = await (await api('users')).json();
  const addresses = await (await api('network')).json();
  $('server').textContent = `Administrador: ${settings.adminEmail} · Host: ${settings.hostIp || 'não configurado'} · ${settings.supabaseUrl}`;
  $('people').replaceChildren(...people.map(person => { const li = document.createElement('li'); li.textContent = `${person.email} — ${person.enabled ? 'autorizado' : 'bloqueado'}`; return li; }));
  $('network').elements.addresses.value = addresses.join('\n');
  $('panel').hidden = false; $('login').hidden = true; $('logout').hidden = false;
}
function action(id, handler) {
  $(id).addEventListener('submit', async event => {
    event.preventDefault(); const button = $(id).querySelector('button'); button.disabled = true;
    try { await handler(new FormData(event.target)); } catch (error) { say(error.message); }
    finally { button.disabled = false; }
  });
}
action('users', async data => {
  await api('users', {method:'PUT',body:JSON.stringify({email:data.get('email').trim(),enabled:data.get('enabled') === 'true'})});
  await load(); say('Acesso atualizado. Contas bloqueadas perdem as sessões existentes.');
});
action('network', async data => {
  const addresses = data.get('addresses').split(/\s+/).filter(Boolean);
  await api('network', {method:'PUT',body:JSON.stringify({addresses})});
  say('Lista salva. Pendente: baixe o script e execute como administrador no host Windows.');
});
action('google', async data => {
  try { await api('google', {method:'POST',body:JSON.stringify(Object.fromEntries(data))}); say('Credenciais Google atualizadas no Supabase.'); }
  finally { $('google').reset(); }
});
$('firewall').onclick = async () => {
  try { const response = await api('network/script'); const url = URL.createObjectURL(await response.blob());
    const a = document.createElement('a'); a.href = url; a.download = 'discorda-firewall.ps1'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  } catch (error) { say(error.message); }
};
$('logout').onclick = async () => {
  try { if (token) await fetch('/api/v1/auth/logout', { method:'POST',headers:{Authorization:'Bearer '+token} }); }
  finally { token = undefined; sessionStorage.removeItem('discorda-admin-verifier'); location.replace('/admin/index.html'); }
};
$('login').onclick = async () => {
  try {
    if (!configuration?.enabled) throw Error('Configure a URL e a chave publishable do Supabase no host.');
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    sessionStorage.setItem('discorda-admin-verifier', verifier);
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    const url = new URL(configuration.supabaseUrl + '/auth/v1/authorize');
    url.search = new URLSearchParams({provider:'google',redirect_to:location.origin+'/admin/index.html',code_challenge:challenge,code_challenge_method:'s256'});
    location.assign(url);
  } catch (error) { say(error.message); }
};
(async () => {
  try {
    configuration = await (await fetch('/api/v1/auth/config')).json();
    const query = new URLSearchParams(location.search);
    const code = query.get('code'); const error = query.get('error_description');
    history.replaceState(null,'','/admin/index.html');
    if (error) throw Error('O provedor recusou o login. Confira as configurações no Supabase.');
    if (!code) return;
    const verifier = sessionStorage.getItem('discorda-admin-verifier'); sessionStorage.removeItem('discorda-admin-verifier');
    if (!verifier) throw Error('Login sem verificador. Inicie o login novamente neste navegador.');
    const response = await fetch(configuration.supabaseUrl + '/auth/v1/token?grant_type=pkce', {
      method:'POST',headers:{'Content-Type':'application/json',apikey:configuration.publishableKey},
      body:JSON.stringify({auth_code:code,code_verifier:verifier}) });
    if (!response.ok) throw Error('Não foi possível completar o login. Tente novamente.');
    token = (await response.json()).access_token;
    await load(); say('Conectado como administrador.');
  } catch (error) { say(error.message); }
})();
