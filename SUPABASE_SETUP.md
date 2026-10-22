# Configuracao inicial do Supabase

O site usa HTML e JavaScript no navegador, sem servidor de build. A chave publica do Supabase pode ficar no frontend; nunca use a chave `service_role` aqui.

## 1. Aplicar o banco de dados

No painel do Supabase, abra **SQL Editor**, crie uma consulta e execute o conteudo de:

`supabase/migrations/20261021200000_initial_schema.sql`

Isso cria os perfis, servicos, postagens, curtidas, comentarios, agendamentos, politicas RLS e funcoes usadas pelo site. A conexao do repositorio ao GitHub nao executa esta migracao automaticamente.

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
- Cadastro e publicacao de servicos pelo barbeiro.
- Feed de postagens com curtidas e comentarios.
- Pedido de agendamento, confirmacao pelo barbeiro e cancelamento pelo cliente.
- Protecao RLS e bloqueio de dois agendamentos ativos que se sobreponham para o mesmo barbeiro.

As imagens de postagens usam links HTTP/HTTPS nesta versao. O banco ainda nao define expediente, folgas ou antecedencia minima: qualquer horario futuro esta sujeito a disponibilidade e a regra de conflito. O armazenamento de imagens no Supabase Storage e a configuracao de horarios podem ser adicionados em seguida.
