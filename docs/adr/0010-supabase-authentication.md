# 0010 — Supabase Auth para identidade e sessões

Status: Aceito — mudança solicitada pelo usuário em 28/09/2026.

Substitui 0002 e a restrição de uso exclusivamente PostgreSQL de 0003.

## Context

O usuário decidiu usar a autenticação do Supabase e forneceu o projeto. A imagem mostra um cadastro de cliente no OAuth Server do Supabase: esse recurso transforma o projeto em provedor OAuth para terceiros e requer uma página própria de login/consentimento. Ele não equivale a habilitar Google em Authentication → Sign In / Providers.

## Decision

Usar Supabase Auth com provider Google, SDK oficial no Electron Main, navegador do sistema e PKCE. Como caminho padrão, adotar o login social direto, sem adicionar uma aplicação web de consentimento. O client ID mostrado na imagem não é utilizado nesse fluxo; a configuração requer a publishable key e o provider Google habilitado.

Supabase emite e renova access/refresh tokens. .NET valida assinatura, issuer, audience, expiração, role e session_id, consulta o usuário no Auth e aplica whitelist própria. Não emitir um segundo refresh token .NET. ApplicationSession registra revogação local por session_id do Supabase. O banco da aplicação não armazena refresh tokens.

Identidade local é identificada por AuthIssuer + AuthSubject (UUID do usuário Supabase). Email confirmado serve para vinculação inicial à whitelist. Campos editáveis em user_metadata só servem para apresentação; não comprovam identidade, provider ou autorização.

## Alternatives

- Google Desktop direto e JWTs próprios .NET: substituído pela decisão do usuário.
- OAuth Server público da imagem: viável, mas exige UI de autorização hospedada, configuração do Site URL e fluxo adicional. Adotar somente se o usuário confirmar essa necessidade.
- Confiar em qualquer conta cadastrada no Supabase: rejeitado, pois não preserva a whitelist.

## Consequences

Menos código de emissão/rotação de tokens, mas a API passa a depender de Supabase Auth para consultar o usuário. JWTs expiram conforme o projeto; logout do Supabase não significa revogação imediata de todo access token já emitido. A API mantém a negação local por sessão e verifica whitelist a cada acesso. Revogação offline não pode ser prometida.

A primeira versão usa callback 127.0.0.1:3000 com caminho aleatório e allowlist restrita a /redirect/*. Se a porta estiver ocupada, informar erro. Cofre safeStorage com fallback apenas em memória; sem tokens no renderer.

## Referências

- [Google pelo Supabase Auth](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [OAuth Server e UI de autorização](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Sessões](https://supabase.com/docs/guides/auth/sessions)
- [Configuração e operação local](../supabase-auth.md)
