# Configuracao inicial do Supabase

O site usa HTML e JavaScript no navegador, sem servidor de build. A chave publica do Supabase pode ficar no frontend; nunca use a chave `service_role` aqui.

## 1. Aplicar o banco de dados

Em um projeto novo, abra **SQL Editor** no painel do Supabase e execute as migracoes nesta ordem:

- `supabase/migrations/20261021200000_initial_schema.sql`
- `supabase/migrations/20261021230000_financial_entries.sql`
- `supabase/migrations/20261021233000_inventory_items.sql`
- `supabase/migrations/20261022000000_inventory_entry_dates.sql`
- `supabase/migrations/20261028000000_financial_entry_updates.sql`
- `supabase/migrations/20261028010000_post_engagement_and_profile_photos.sql`

A primeira migracao cria os perfis, servicos, postagens, curtidas, comentarios, agendamentos, politicas RLS e funcoes usadas pelo site. A segunda adiciona lancamentos financeiros privados por barbeiro. A terceira adiciona o estoque por barbeiro e registra automaticamente no financeiro as compras e entradas com custo. A quarta atualiza as funcoes de estoque para receber a data local da compra e evitar divergencias de fuso horario. A quinta permite atualizar lancamentos financeiros, mantendo a protecao RLS por barbeiro. A sexta habilita fotos de perfil no Storage e consultas de curtidas e comentarios nas postagens do barbeiro. Se as cinco primeiras migracoes ja foram aplicadas, execute somente a sexta; nao reaplique migracoes anteriores. A conexao do repositorio ao GitHub nao executa as migracoes automaticamente.

## 2. Configurar a autenticacao

Em **Authentication**:

1. Habilite o provedor de e-mail e senha.
2. Mantenha a confirmacao por e-mail habilitada (recomendado).
3. Em **URL Configuration**, configure:
   - `Site URL`: `https://constsamueldev.github.io/corte-mais/`
   - `Redirect URLs`: `https://constsamueldev.github.io/corte-mais/**`
4. Se estiver testando localmente com Live Server, adicione tambem a URL local apresentada pelo editor, por exemplo `http://127.0.0.1:5500/**`.

Clientes e barbeiros podem criar a propria conta. O perfil e criado pelo banco usando os metadados da autenticacao; o papel nao pode ser alterado pelo formulario de perfil.

## 3. Informar as credenciais publicas

No painel, abra **Project Settings > API** (em algumas versoes, **Project Settings > API Keys**) e copie a URL do projeto e a chave publica `anon` ou `publishable` para:

- `SUPABASE_URL` em `supabase-config.js`
- `SUPABASE_PUBLISHABLE_KEY` em `supabase-config.js`

Nao copie a chave `service_role`/`secret` para este arquivo. A chave publica depende das politicas RLS, que ja estao definidas na migracao.

## 4. Executar e publicar

Sirva a pasta por HTTP usando Live Server ou a hospedagem escolhida; abrir `index.html` diretamente como `file://` nao funciona com modulos JavaScript. Publique os arquivos estaticos do repositorio e configure a URL publicada e as URLs de redirecionamento no Supabase.

## O que esta primeira versao inclui

- Cadastro e login de barbeiro e cliente, confirmacao de e-mail e recuperacao de senha.
- Links de confirmacao e recuperacao redirecionados para o caminho do GitHub Pages; a tela de acesso permite reenviar uma confirmacao expirada.
- Perfil de barbeiro e cliente.
- Visao geral do barbeiro, controle financeiro de entradas, saidas e saldo mensal, e estoque com alerta de minimo; compras de estoque sao lancadas como despesas. Os dados sao isolados por conta.
- Cadastro e publicacao de servicos pelo barbeiro.
- Feed de postagens com curtidas e comentarios; o barbeiro pode consultar os nomes de quem curtiu e os comentarios nas proprias postagens.
- Fotos de perfil para clientes e barbeiros, escolhidas do dispositivo (JPG, PNG ou WebP, ate 5 MB). As fotos ficam em um bucket publico para aparecerem na plataforma; cada usuario pode enviar e remover apenas os arquivos da propria pasta.
- Agendamentos: o cliente solicita um horario a partir de um servico ativo no Feed; o barbeiro confirma ou recusa o pedido na Agenda, e o cliente pode cancelar.
- Protecao RLS e bloqueio de dois agendamentos ativos que se sobreponham para o mesmo barbeiro.

As imagens das postagens usam links HTTP/HTTPS nesta versao. O banco ainda nao define expediente, folgas ou antecedencia minima: qualquer horario futuro esta sujeito a disponibilidade e a regra de conflito. A migracao de fotos cria o bucket publico `profile-photos` e define as politicas de acesso ao Storage.
