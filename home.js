const CHAVE_DADOS_PAINEL = "corte-mais.painel.v1";
const estadoInicial = {
    perfil: { nome: "", negocio: "", email: "", fotoPerfil: "" },
    clientes: [],
    agendamentos: [],
    lancamentos: [],
    estoque: [],
    publicacoes: []
};

function carregarEstado() {
    try {
        const salvo = JSON.parse(localStorage.getItem(CHAVE_DADOS_PAINEL));
        if (!salvo || typeof salvo !== "object") return structuredClone(estadoInicial);
        return {
            ...structuredClone(estadoInicial),
            ...salvo,
            perfil: { ...estadoInicial.perfil, ...(salvo.perfil || {}) },
            clientes: Array.isArray(salvo.clientes) ? salvo.clientes : [],
            agendamentos: Array.isArray(salvo.agendamentos) ? salvo.agendamentos : [],
            lancamentos: Array.isArray(salvo.lancamentos) ? salvo.lancamentos : [],
            estoque: Array.isArray(salvo.estoque) ? salvo.estoque : [],
            publicacoes: Array.isArray(salvo.publicacoes) ? salvo.publicacoes : []
        };
    } catch {
        return structuredClone(estadoInicial);
    }
}

const estado = carregarEstado();
const conteudoPrincipal = document.querySelector("#conteudo-principal");
const buscaPainel = document.querySelector("#busca-painel");
const dialogo = document.querySelector("#dialogo-principal");
let visaoAtual = "visao-geral";
let termoBusca = "";
let acaoFormulario = null;

const icones = {
    agenda: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path></svg>',
    clientes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="10" cy="7" r="4"></circle><path d="M20 8v6M23 11h-6"></path></svg>',
    financeiro: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 10h18M7 15h3"></path></svg>',
    retorno: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"></path><path d="M3 3v5h5M12 7v5l3 2"></path></svg>'
};

function salvarEstado() {
    localStorage.setItem(CHAVE_DADOS_PAINEL, JSON.stringify(estado));
}

function escapar(valor = "") {
    return String(valor).replace(/[&<>"']/g, caractere => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[caractere]);
}

function iniciais(nome = "") {
    const partes = nome.trim().split(/\s+/).filter(Boolean);
    return partes.length ? partes.slice(0, 2).map(parte => parte[0]).join("").toLocaleUpperCase("pt-BR") : "NB";
}

function idNovo(prefixo) {
    return `${prefixo}_${crypto.randomUUID()}`;
}

function moeda(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataISO() {
    const agora = new Date();
    const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function formatarData(valor) {
    if (!valor) return "Sem data";
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${valor}T12:00:00`));
}

function atualizarIdentidade() {
    const nome = estado.perfil.nome || "Novo barbeiro";
    const negocio = estado.perfil.negocio || "Minha barbearia";
    const primeiroNome = estado.perfil.nome.trim().split(/\s+/)[0] || "barbeiro";
    document.querySelectorAll('[data-campo="nome"]').forEach(item => item.textContent = nome);
    document.querySelectorAll('[data-campo="email"]').forEach(item => item.textContent = estado.perfil.email || "E-mail não informado");
    document.querySelectorAll('[data-campo="negocio"]').forEach(item => item.textContent = negocio);
    document.querySelectorAll('[data-campo="primeiro-nome"]').forEach(item => item.textContent = primeiroNome);
    document.querySelectorAll("[data-avatar-iniciais]").forEach(item => item.textContent = iniciais(estado.perfil.nome));
    document.querySelector(".botao-perfil").setAttribute("aria-label", `Perfil de ${nome}`);
    document.querySelector("#data-atual").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date()).toLocaleUpperCase("pt-BR");
    document.querySelector('[data-campo="agendamentos-hoje"]').textContent = estado.agendamentos.filter(item => item.data === dataISO()).length;
    document.querySelector("#menu-perfil strong").textContent = nome;
    document.querySelector("#menu-perfil > span").textContent = estado.perfil.email || "Configure seu e-mail";
    document.querySelector(".seletor-negocio").setAttribute("aria-label", `${negocio}, ${nome}`);
}

function cabecalho(rotulo, titulo, descricao, acao = "") {
    return `<div class="cabecalho-pagina"><div><span class="sobretitulo">${escapar(rotulo)}</span><h1>${escapar(titulo)}</h1><p>${escapar(descricao)}</p></div>${acao}</div>`;
}

function botaoAcao(acao, texto, simbolo = "+") {
    return `<button class="botao-primario" type="button" data-acao="${acao}"><span aria-hidden="true">${simbolo}</span>${texto}</button>`;
}

function lancamentosDoMes() {
    const mes = dataISO().slice(0, 7);
    return estado.lancamentos.filter(item => item.data?.startsWith(mes));
}

function totaisFinanceiros() {
    const itens = lancamentosDoMes();
    const entradas = itens.filter(item => item.tipo === "entrada").reduce((soma, item) => soma + Number(item.valor), 0);
    const saidas = itens.filter(item => item.tipo === "saida").reduce((soma, item) => soma + Number(item.valor), 0);
    return { entradas, saidas, saldo: entradas - saidas };
}

function renderizarIndicadores() {
    const totais = totaisFinanceiros();
    const itens = [
        { titulo: "Agendamentos hoje", valor: estado.agendamentos.filter(item => item.data === dataISO()).length, variacao: "Nenhum horário cadastrado", icone: "agenda", tom: "amarelo" },
        { titulo: "Clientes cadastrados", valor: estado.clientes.length, variacao: "Sua base de clientes", icone: "clientes", tom: "verde" },
        { titulo: "Entradas no mês", valor: moeda(totais.entradas), variacao: "Receitas registradas", icone: "financeiro", tom: "azul" },
        { titulo: "Saldo do mês", valor: moeda(totais.saldo), variacao: `${moeda(totais.saidas)} em saídas`, icone: "retorno", tom: "rosa" }
    ];
    return `<section class="grade-indicadores" aria-label="Resumo do negócio">${itens.map(item => `<article class="cartao-indicador"><div class="topo-indicador"><span>${escapar(item.titulo)}</span><span class="icone-indicador tom-${item.tom}">${icones[item.icone]}</span></div><strong class="valor-indicador">${escapar(item.valor)}</strong><span class="variacao-indicador">${escapar(item.variacao)}</span></article>`).join("")}</section>`;
}

function renderizarVisaoGeral() {
    const clientes = estado.clientes.filter(item => `${item.nome} ${item.email || ""}`.toLocaleLowerCase("pt-BR").includes(termoBusca.toLocaleLowerCase("pt-BR")));
    const proximos = estado.agendamentos.filter(item => `${item.cliente} ${item.servico}`.toLocaleLowerCase("pt-BR").includes(termoBusca.toLocaleLowerCase("pt-BR"))).slice(0, 4);
    const listaAgendamentos = proximos.length ? proximos.map(item => `<article class="linha-agendamento"><time class="hora-agendamento">${escapar(item.horario || "--:--")}</time><span class="avatar avatar-agendamento">${escapar(iniciais(item.cliente))}</span><div class="dados-agendamento"><strong>${escapar(item.cliente)}</strong><span>${escapar(item.servico)}</span></div><span class="estado-agendamento estado-confirmado">${escapar(item.status || "Agendado")}</span></article>`).join("") : '<p class="estado-vazio">Sua agenda está vazia. Cadastre os primeiros horários para acompanhar o dia por aqui.</p>';
    const listaClientes = clientes.length ? clientes.slice(0, 4).map(item => `<article class="linha-cliente"><span class="avatar avatar-cliente">${escapar(iniciais(item.nome))}</span><div class="dados-cliente"><strong>${escapar(item.nome)}</strong><span>${escapar(item.email || "Cliente cadastrado")}</span></div></article>`).join("") : '<p class="estado-vazio">Nenhum cliente cadastrado ainda.</p>';
    conteudoPrincipal.innerHTML = `${cabecalho("VISÃO GERAL", "Bem-vindo ao Corte Mais.", "Comece organizando sua barbearia. Seus dados aparecerão neste painel.", botaoAcao("adicionar-cliente", "Adicionar cliente"))}${renderizarIndicadores()}<div class="grade-conteudo"><section class="painel-conteudo painel-agenda"><div class="cabecalho-painel"><div><span class="sobretitulo">ROTINA</span><h2>Próximos atendimentos</h2></div><button class="link-discreto" type="button" data-visao="agenda">Abrir agenda <span aria-hidden="true">→</span></button></div><div class="lista-agendamentos">${listaAgendamentos}</div></section><section class="painel-conteudo painel-clientes"><div class="cabecalho-painel"><div><span class="sobretitulo">RELACIONAMENTO</span><h2>Seus clientes</h2></div><button class="botao-so-icone" type="button" data-visao="clientes" aria-label="Ver clientes">→</button></div><div class="lista-clientes">${listaClientes}</div><button class="rodape-lista" type="button" data-visao="clientes">Abrir clientes <span aria-hidden="true">→</span></button></section></div>`;
}

function renderizarAgenda() {
    const busca = termoBusca.toLocaleLowerCase("pt-BR");
    const lista = estado.agendamentos.filter(item => `${item.cliente} ${item.servico}`.toLocaleLowerCase("pt-BR").includes(busca));
    const linhas = lista.length ? lista.map(item => `<article class="linha-agendamento"><time class="hora-agendamento">${escapar(item.horario || "--:--")}</time><span class="avatar avatar-agendamento">${escapar(iniciais(item.cliente))}</span><div class="dados-agendamento"><strong>${escapar(item.cliente)}</strong><span>${escapar(item.servico)}</span></div><span class="estado-agendamento estado-confirmado">${escapar(formatarData(item.data))}</span></article>`).join("") : '<p class="estado-vazio">Nenhum atendimento na agenda. A agenda ficará pronta para receber novos horários.</p>';
    conteudoPrincipal.innerHTML = `${cabecalho("ROTINA", "Agenda", "Organize horários e serviços dos seus clientes.", botaoAcao("novo-agendamento", "Novo agendamento"))}<section class="painel-conteudo pagina-lista"><div class="cabecalho-painel"><div><span class="sobretitulo">AGENDA</span><h2>${lista.length} horários cadastrados</h2></div></div><div class="lista-agendamentos">${linhas}</div></section>`;
}

function renderizarClientes() {
    const busca = termoBusca.toLocaleLowerCase("pt-BR");
    const clientes = estado.clientes.filter(item => `${item.nome} ${item.email || ""} ${item.telefone || ""}`.toLocaleLowerCase("pt-BR").includes(busca));
    const lista = clientes.length ? clientes.map(item => `<article class="linha-cliente"><span class="avatar avatar-cliente">${escapar(iniciais(item.nome))}</span><div class="dados-cliente"><strong>${escapar(item.nome)}</strong><span>${escapar(item.email || item.telefone || "Sem contato informado")}</span></div><button class="botao-remover" type="button" data-acao="remover-cliente" data-id="${escapar(item.id)}" aria-label="Remover ${escapar(item.nome)}">×</button></article>`).join("") : '<p class="estado-vazio">Ainda não há clientes. Cadastre o primeiro para começar sua base.</p>';
    conteudoPrincipal.innerHTML = `${cabecalho("RELACIONAMENTO", "Clientes", "Cadastre e acompanhe as informações dos seus clientes.", botaoAcao("adicionar-cliente", "Adicionar cliente"))}<section class="painel-conteudo tabela-clientes"><div class="cabecalho-painel"><div><span class="sobretitulo">SUA COMUNIDADE</span><h2>${estado.clientes.length} clientes cadastrados</h2></div></div><div class="lista-clientes lista-clientes-completa">${lista}</div></section>`;
}

function renderizarPerfil() {
    const nome = estado.perfil.nome || "Configure seu perfil";
    const linhas = `<p>${escapar(estado.perfil.email || "Adicione seu e-mail de contato")}</p><p>${escapar(estado.perfil.negocio || "Adicione o nome da barbearia")}</p>`;
    conteudoPrincipal.innerHTML = `${cabecalho("CONTA", "Meu perfil", "Configure seus dados para personalizar o painel.", botaoAcao("editar-perfil", "Editar perfil"))}<section class="painel-conteudo cartao-perfil"><span class="avatar avatar-perfil-grande">${escapar(iniciais(estado.perfil.nome))}</span><div><span class="sobretitulo">BARBEIRO</span><h2>${escapar(nome)}</h2>${linhas}<span class="etiqueta-demo">Perfil local</span></div></section>`;
}

function renderizarFinanceiro() {
    const totais = totaisFinanceiros();
    const busca = termoBusca.toLocaleLowerCase("pt-BR");
    const lista = estado.lancamentos.filter(item => `${item.descricao} ${item.categoria}`.toLocaleLowerCase("pt-BR").includes(busca)).sort((a, b) => b.data.localeCompare(a.data));
    const itens = lista.length ? lista.map(item => `<article class="linha-financeira"><span class="indicador-tipo ${item.tipo}">${item.tipo === "entrada" ? "↙" : "↗"}</span><div class="dados-lancamento"><strong>${escapar(item.descricao)}</strong><span>${escapar(item.categoria)} · ${formatarData(item.data)}</span></div><strong class="valor-lancamento ${item.tipo}">${item.tipo === "entrada" ? "+" : "−"} ${moeda(item.valor)}</strong><button class="botao-remover" type="button" data-acao="remover-lancamento" data-id="${escapar(item.id)}" aria-label="Remover lançamento">×</button></article>`).join("") : '<p class="estado-vazio">Nenhuma movimentação registrada. Adicione entradas de serviços ou despesas da barbearia.</p>';
    conteudoPrincipal.innerHTML = `${cabecalho("GESTÃO", "Financeiro", "Controle as entradas, saídas e o saldo da sua empresa.", botaoAcao("novo-lancamento", "Adicionar lançamento"))}<section class="grade-resumo-financeiro"><article><span>Entradas neste mês</span><strong class="texto-entrada">${moeda(totais.entradas)}</strong></article><article><span>Saídas neste mês</span><strong class="texto-saida">${moeda(totais.saidas)}</strong></article><article><span>Saldo deste mês</span><strong>${moeda(totais.saldo)}</strong></article></section><section class="painel-conteudo tabela-financeira"><div class="cabecalho-painel"><div><span class="sobretitulo">MOVIMENTAÇÕES</span><h2>${estado.lancamentos.length} lançamentos</h2></div><span class="legenda-horario">MÊS ATUAL</span></div><div class="lista-financeira">${itens}</div></section>`;
}

function renderizarEstoque() {
    const busca = termoBusca.toLocaleLowerCase("pt-BR");
    const produtos = estado.estoque.filter(item => `${item.nome} ${item.categoria}`.toLocaleLowerCase("pt-BR").includes(busca));
    const quantidadeTotal = estado.estoque.reduce((soma, item) => soma + Number(item.quantidade), 0);
    const baixoEstoque = estado.estoque.filter(item => Number(item.quantidade) <= Number(item.minimo)).length;
    const linhas = produtos.length ? produtos.map(item => `<article class="linha-estoque"><span class="icone-estoque" aria-hidden="true">▤</span><div class="dados-produto"><strong>${escapar(item.nome)}</strong><span>${escapar(item.categoria)}</span></div><span class="quantidade-produto ${Number(item.quantidade) <= Number(item.minimo) ? "estoque-baixo" : ""}">${item.quantidade} ${escapar(item.unidade || "un.")}</span><span class="custo-produto">${moeda(item.custoUnitario)} / un.</span><div class="acoes-produto"><button class="botao-secundario" type="button" data-acao="movimentar-estoque" data-id="${escapar(item.id)}" data-tipo="entrada">Entrada</button><button class="botao-secundario" type="button" data-acao="movimentar-estoque" data-id="${escapar(item.id)}" data-tipo="saida">Uso</button></div></article>`).join("") : '<p class="estado-vazio">Seu estoque está vazio. Cadastre utensílios e produtos para acompanhar quantidades e compras.</p>';
    conteudoPrincipal.innerHTML = `${cabecalho("GESTÃO", "Estoque", "Acompanhe utensílios, produtos e compras da barbearia.", botaoAcao("novo-produto", "Adicionar item"))}<section class="grade-resumo-financeiro resumo-estoque"><article><span>Itens cadastrados</span><strong>${estado.estoque.length}</strong></article><article><span>Unidades em estoque</span><strong>${quantidadeTotal}</strong></article><article><span>Itens no mínimo</span><strong>${baixoEstoque}</strong></article></section><section class="painel-conteudo tabela-financeira"><div class="cabecalho-painel"><div><span class="sobretitulo">MATERIAIS E UTENSÍLIOS</span><h2>Estoque atual</h2></div></div><div class="lista-estoque">${linhas}</div></section><p class="nota-modulo">Compras registradas como entrada no estoque também são lançadas automaticamente como despesa no financeiro.</p>`;
}

function renderizarConteudo() {
    const busca = termoBusca.toLocaleLowerCase("pt-BR");
    const publicacoes = estado.publicacoes.filter(item => `${item.servico} ${item.descricao}`.toLocaleLowerCase("pt-BR").includes(busca));
    const cards = publicacoes.length ? publicacoes.map(item => `<article class="cartao-publicacao">${item.imagem ? `<img class="imagem-publicacao" src="${escapar(item.imagem)}" alt="Imagem de ${escapar(item.servico)}" loading="lazy" onerror="this.remove()">` : `<div class="imagem-publicacao imagem-publicacao-vazia"><span>${escapar(iniciais(item.servico))}</span></div>`}<div class="dados-publicacao"><span class="sobretitulo">${escapar(item.status || "PUBLICADO")}</span><h2>${escapar(item.servico)}</h2><p>${escapar(item.descricao || "Serviço da barbearia")}</p><strong>${moeda(item.preco)}</strong><button class="botao-remover" type="button" data-acao="remover-publicacao" data-id="${escapar(item.id)}" aria-label="Remover publicação">Remover publicação</button></div></article>`).join("") : '<p class="estado-vazio">Você ainda não publicou serviços. Crie uma publicação para montar seu catálogo de serviços.</p>';
    conteudoPrincipal.innerHTML = `${cabecalho("DIVULGAÇÃO", "Conteúdo", "Apresente seus serviços e monte um catálogo para seus clientes.", botaoAcao("nova-publicacao", "Nova publicação"))}<section class="painel-conteudo secao-publicacoes"><div class="cabecalho-painel"><div><span class="sobretitulo">SEUS SERVIÇOS</span><h2>${estado.publicacoes.length} publicações</h2></div></div><div class="grade-publicacoes">${cards}</div></section>`;
}

function renderizarVisao() {
    atualizarIdentidade();
    const renderizadores = {
        "visao-geral": renderizarVisaoGeral,
        agenda: renderizarAgenda,
        clientes: renderizarClientes,
        perfil: renderizarPerfil,
        financeiro: renderizarFinanceiro,
        estoque: renderizarEstoque,
        conteudo: renderizarConteudo
    };
    (renderizadores[visaoAtual] || renderizarVisaoGeral)();
    document.querySelectorAll(".link-navegacao[data-visao]").forEach(link => {
        const selecionado = link.dataset.visao === visaoAtual;
        link.classList.toggle("ativo", selecionado);
        if (selecionado) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
}

function campoForm(nome, rotulo, tipo = "text", opcoes = {}) {
    const requerido = opcoes.requerido ? "required" : "";
    const dica = opcoes.placeholder ? `placeholder="${escapar(opcoes.placeholder)}"` : "";
    const valor = opcoes.valor ? `value="${escapar(opcoes.valor)}"` : "";
    if (tipo === "select") {
        const options = opcoes.opcoes.map(item => `<option value="${escapar(item)}">${escapar(item)}</option>`).join("");
        return `<label>${rotulo}<select name="${nome}" ${requerido}>${options}</select></label>`;
    }
    if (tipo === "textarea") return `<label>${rotulo}<textarea name="${nome}" rows="3" ${dica}></textarea></label>`;
    return `<label>${rotulo}<input name="${nome}" type="${tipo}" ${dica} ${valor} ${requerido} ${opcoes.min !== undefined ? `min="${opcoes.min}"` : ""} ${opcoes.step ? `step="${opcoes.step}"` : ""}></label>`;
}

function abrirFormulario(titulo, subtitulo, campos, textoBotao, aoSalvar) {
    acaoFormulario = aoSalvar;
    dialogo.innerHTML = `<form id="formulario-dinamico"><div class="cabecalho-dialogo"><div><span class="sobretitulo">${escapar(subtitulo)}</span><h2>${escapar(titulo)}</h2></div><button class="botao-fechar" type="button" aria-label="Fechar" data-fechar-dialogo>×</button></div>${campos}<div class="acoes-dialogo"><button class="botao-secundario" type="button" data-fechar-dialogo>Cancelar</button><button class="botao-primario" type="submit">${escapar(textoBotao)}</button></div></form>`;
    dialogo.showModal();
}

function abrirCadastroCliente() {
    abrirFormulario("Adicionar cliente", "RELACIONAMENTO", campoForm("nome", "Nome completo", "text", { requerido: true, placeholder: "Nome do cliente" }) + campoForm("email", "E-mail", "email", { placeholder: "cliente@email.com" }) + campoForm("telefone", "Telefone", "tel", { placeholder: "(11) 99999-9999" }), "Salvar cliente", campos => {
        estado.clientes.push({ id: idNovo("cli"), nome: campos.get("nome").trim(), email: campos.get("email").trim(), telefone: campos.get("telefone").trim(), criadoEm: dataISO() });
        visaoAtual = "clientes";
        salvarEstado();
        renderizarVisao();
        mostrarAviso("Cliente adicionado.");
    });
}

function abrirLancamento() {
    const campos = campoForm("tipo", "Movimentação", "select", { opcoes: ["saida", "entrada"] }) + campoForm("descricao", "Descrição", "text", { requerido: true, placeholder: "Ex.: Corte, aluguel, conta de luz" }) + campoForm("categoria", "Categoria", "select", { opcoes: ["Serviços", "Produtos", "Estoque", "Aluguel", "Contas", "Equipamentos", "Impostos", "Outros"] }) + campoForm("valor", "Valor (R$)", "number", { requerido: true, min: "0.01", step: "0.01", placeholder: "0,00" }) + campoForm("data", "Data", "date", { requerido: true, valor: dataISO() });
    abrirFormulario("Novo lançamento", "FINANCEIRO", campos, "Salvar lançamento", form => {
        estado.lancamentos.push({ id: idNovo("lan"), tipo: form.get("tipo"), descricao: form.get("descricao").trim(), categoria: form.get("categoria"), valor: Number(form.get("valor")), data: form.get("data") });
        salvarEstado();
        renderizarVisao();
        mostrarAviso("Lançamento financeiro salvo.");
    });
}

function abrirProduto() {
    const campos = campoForm("nome", "Nome do item", "text", { requerido: true, placeholder: "Ex.: Lote de navalhas" }) + campoForm("categoria", "Categoria", "select", { opcoes: ["Utensílios", "Descartáveis", "Higiene", "Produtos", "Proteção", "Equipamentos", "Outros"] }) + campoForm("quantidade", "Quantidade inicial", "number", { requerido: true, min: "0", step: "1", valor: "0" }) + campoForm("unidade", "Unidade", "select", { opcoes: ["un.", "caixas", "pacotes", "litros", "frascos", "pares", "rolos"] }) + campoForm("custoUnitario", "Custo por unidade (R$)", "number", { requerido: true, min: "0", step: "0.01", valor: "0" }) + campoForm("minimo", "Avisar quando chegar a", "number", { min: "0", step: "1", valor: "2" });
    abrirFormulario("Adicionar item ao estoque", "ESTOQUE · COMPRAS", campos, "Salvar item", form => {
        const quantidade = Number(form.get("quantidade"));
        const custoUnitario = Number(form.get("custoUnitario"));
        const produto = { id: idNovo("est"), nome: form.get("nome").trim(), categoria: form.get("categoria"), quantidade, unidade: form.get("unidade"), custoUnitario, minimo: Number(form.get("minimo") || 0) };
        estado.estoque.push(produto);
        if (quantidade > 0 && custoUnitario > 0) {
            estado.lancamentos.push({ id: idNovo("lan"), tipo: "saida", descricao: `Compra de estoque: ${produto.nome}`, categoria: "Estoque", valor: quantidade * custoUnitario, data: dataISO(), estoqueId: produto.id });
        }
        salvarEstado();
        renderizarVisao();
        mostrarAviso(quantidade > 0 && custoUnitario > 0 ? "Item cadastrado e compra lançada no financeiro." : "Item cadastrado no estoque.");
    });
}

function abrirMovimentacaoEstoque(id, tipo) {
    const produto = estado.estoque.find(item => item.id === id);
    if (!produto) return;
    const entrada = tipo === "entrada";
    const campos = campoForm("quantidade", "Quantidade", "number", { requerido: true, min: "1", step: "1" }) + (entrada ? campoForm("custoUnitario", "Custo por unidade (R$)", "number", { requerido: true, min: "0", step: "0.01", valor: String(produto.custoUnitario || 0) }) : "");
    abrirFormulario(entrada ? `Registrar compra: ${produto.nome}` : `Registrar uso: ${produto.nome}`, entrada ? "ENTRADA NO ESTOQUE" : "CONSUMO DE MATERIAL", campos, entrada ? "Registrar compra" : "Registrar uso", form => {
        const quantidade = Number(form.get("quantidade"));
        if (!entrada && quantidade > Number(produto.quantidade)) {
            mostrarAviso("A quantidade usada não pode ser maior que o estoque disponível.");
            return false;
        }
        produto.quantidade += entrada ? quantidade : -quantidade;
        if (entrada) {
            const custo = Number(form.get("custoUnitario"));
            produto.custoUnitario = custo;
            estado.lancamentos.push({ id: idNovo("lan"), tipo: "saida", descricao: `Compra de estoque: ${produto.nome}`, categoria: "Estoque", valor: quantidade * custo, data: dataISO(), estoqueId: produto.id });
        }
        salvarEstado();
        renderizarVisao();
        mostrarAviso(entrada ? "Estoque atualizado e despesa registrada." : "Consumo de material registrado.");
    });
}

function abrirPublicacao() {
    const campos = campoForm("servico", "Nome do serviço", "text", { requerido: true, placeholder: "Ex.: Corte degradê" }) + campoForm("descricao", "Descrição", "textarea", { placeholder: "Descreva o serviço e o que está incluído" }) + campoForm("preco", "Preço (R$)", "number", { requerido: true, min: "0", step: "0.01", placeholder: "0,00" }) + campoForm("imagem", "Imagem do serviço (URL)", "url", { placeholder: "https://... (opcional)" });
    abrirFormulario("Nova publicação", "CONTEÚDO · SERVIÇOS", campos, "Publicar serviço", form => {
        estado.publicacoes.unshift({ id: idNovo("pub"), servico: form.get("servico").trim(), descricao: form.get("descricao").trim(), preco: Number(form.get("preco")), imagem: form.get("imagem").trim(), status: "PUBLICADO", criadoEm: dataISO() });
        salvarEstado();
        renderizarVisao();
        mostrarAviso("Serviço publicado no seu catálogo.");
    });
}

function abrirPerfil() {
    const campos = campoForm("nome", "Seu nome", "text", { requerido: true, valor: estado.perfil.nome, placeholder: "Nome do barbeiro" }) + campoForm("negocio", "Nome da barbearia", "text", { valor: estado.perfil.negocio, placeholder: "Minha barbearia" }) + campoForm("email", "E-mail de contato", "email", { valor: estado.perfil.email, placeholder: "voce@email.com" });
    abrirFormulario("Editar perfil", "SUA CONTA", campos, "Salvar perfil", form => {
        estado.perfil.nome = form.get("nome").trim();
        estado.perfil.negocio = form.get("negocio").trim();
        estado.perfil.email = form.get("email").trim();
        salvarEstado();
        renderizarVisao();
        mostrarAviso("Perfil atualizado.");
    });
}

function mostrarAviso(mensagem) {
    const aviso = document.querySelector("#aviso-flutuante");
    aviso.textContent = mensagem;
    aviso.classList.add("visivel");
    window.setTimeout(() => aviso.classList.remove("visivel"), 2800);
}

function executarAcao(acao, id, tipo) {
    if (acao === "adicionar-cliente") abrirCadastroCliente();
    if (acao === "editar-perfil") abrirPerfil();
    if (acao === "novo-lancamento") abrirLancamento();
    if (acao === "novo-produto") abrirProduto();
    if (acao === "nova-publicacao") abrirPublicacao();
    if (acao === "movimentar-estoque") abrirMovimentacaoEstoque(id, tipo);
    if (acao === "novo-agendamento") mostrarAviso("O cadastro de agenda será habilitado em breve.");
    if (acao === "remover-cliente") {
        estado.clientes = estado.clientes.filter(item => item.id !== id);
        salvarEstado(); renderizarVisao(); mostrarAviso("Cliente removido.");
    }
    if (acao === "remover-lancamento") {
        estado.lancamentos = estado.lancamentos.filter(item => item.id !== id);
        salvarEstado(); renderizarVisao(); mostrarAviso("Lançamento removido.");
    }
    if (acao === "remover-publicacao") {
        estado.publicacoes = estado.publicacoes.filter(item => item.id !== id);
        salvarEstado(); renderizarVisao(); mostrarAviso("Publicação removida.");
    }
}

document.addEventListener("click", evento => {
    const seletorNegocio = evento.target.closest(".seletor-negocio");
    if (seletorNegocio) {
        const menu = document.querySelector("#menu-negocio");
        menu.hidden = !menu.hidden;
        seletorNegocio.setAttribute("aria-expanded", String(!menu.hidden));
        document.querySelector("#menu-perfil").hidden = true;
        document.querySelector(".botao-perfil").setAttribute("aria-expanded", "false");
        return;
    }

    const link = evento.target.closest("[data-visao]");
    if (link) {
        evento.preventDefault();
        visaoAtual = link.dataset.visao;
        termoBusca = "";
        buscaPainel.value = "";
        renderizarVisao();
        conteudoPrincipal.focus({ preventScroll: true });
    }
    const botaoAcao = evento.target.closest("[data-acao]");
    if (botaoAcao) executarAcao(botaoAcao.dataset.acao, botaoAcao.dataset.id, botaoAcao.dataset.tipo);
    if (evento.target.closest("[data-fechar-dialogo]")) dialogo.close();

    if (evento.target.closest(".menu-negocio") && (link || botaoAcao)) {
        document.querySelector("#menu-negocio").hidden = true;
        document.querySelector(".seletor-negocio").setAttribute("aria-expanded", "false");
    }

    const perfil = evento.target.closest(".botao-perfil");
    if (perfil) {
        const painel = document.querySelector("#menu-perfil");
        painel.hidden = !painel.hidden;
        perfil.setAttribute("aria-expanded", String(!painel.hidden));
        document.querySelector("#menu-negocio").hidden = true;
        document.querySelector(".seletor-negocio").setAttribute("aria-expanded", "false");
    } else if (!evento.target.closest(".painel-flutuante, .menu-negocio")) {
        document.querySelectorAll(".painel-flutuante").forEach(item => item.hidden = true);
        document.querySelector(".botao-perfil").setAttribute("aria-expanded", "false");
        document.querySelector("#menu-negocio").hidden = true;
        document.querySelector(".seletor-negocio").setAttribute("aria-expanded", "false");
    }
});

document.addEventListener("submit", evento => {
    if (evento.target.id !== "formulario-dinamico" || !acaoFormulario) return;
    evento.preventDefault();
    const resultado = acaoFormulario(new FormData(evento.target));
    if (resultado === false) return;
    acaoFormulario = null;
    dialogo.close();
});

document.querySelector("#dialogo-principal").addEventListener("click", evento => {
    if (evento.target === dialogo) dialogo.close();
});
document.querySelector("#dialogo-principal").addEventListener("close", () => acaoFormulario = null);

buscaPainel.addEventListener("input", () => {
    termoBusca = buscaPainel.value.trim();
    renderizarVisao();
});

document.addEventListener("keydown", evento => {
    if ((evento.metaKey || evento.ctrlKey) && evento.key.toLowerCase() === "k") {
        evento.preventDefault();
        buscaPainel.focus();
    }
    if (evento.key === "Escape") {
        document.querySelectorAll(".painel-flutuante").forEach(item => item.hidden = true);
        document.querySelector(".botao-perfil").setAttribute("aria-expanded", "false");
        document.querySelector("#menu-negocio").hidden = true;
        document.querySelector(".seletor-negocio").setAttribute("aria-expanded", "false");
    }
});

atualizarIdentidade();
renderizarVisao();
