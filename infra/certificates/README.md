# CA PostgreSQL Supabase

`supabase-prod-ca-2021.crt` é um certificado público, obtido via HTTPS do endereço usado pelo painel oficial do Supabase:

https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

Origem do endereço: `ssl:certificate_url` em [custom-content.json do Supabase Studio](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json).

A conexão Npgsql usa `SSL Mode=VerifyFull;Root Certificate=<caminho absoluto deste arquivo>`. O certificado é configurado apenas nessa conexão, sem modificar o repositório de confiança do Windows. Em outro host ou container, montar o arquivo e ajustar o caminho na connection string. Não desabilitar validação de certificado/hostname.

O TLS validado é a conexão API → Session pooler. `pg_stat_ssl` consultado através do pooler descreve a conexão pooler → PostgreSQL e não atesta o TLS do cliente.
