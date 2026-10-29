import { exigirSupabase } from "./supabase-client.js";

const main = document.querySelector("#app-main");
const nav = document.querySelector("#app-nav");
const dialog = document.querySelector("#app-dialog");
const notice = document.querySelector("#app-notice");
let supabase;
let user;
let profile;
let view = "";
let posts = [];
let services = [];
let bookings = [];
let financialEntries = [];
let inventoryItems = [];
let commentsByPost = {};
let likesByPost = {};
let avatarVersion = Date.now();

const isBarber = () => profile.role === "barber";
const safe = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);
const money = value => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = value => new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium", timeStyle: "short"
}).format(new Date(value));
const dateToday = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const initials = value => String(value || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase("pt-BR") || "CM";
const formatDate = value => new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "short", year: "numeric"
}).format(new Date(`${value}T12:00:00`));
const usableImage = value => {
    if (!value) return "";
    try {
        const url = new URL(value);
        return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch {
        return "";
    }
};
const avatarContents = (path, name) => {
    const initialsMarkup = `<span class="texto-avatar">${safe(initials(name))}</span>`;
    if (!path) return initialsMarkup;
    const { data } = supabase.storage.from("profile-photos").getPublicUrl(path);
    return `${initialsMarkup}<img class="imagem-perfil" src="${safe(`${data.publicUrl}?v=${avatarVersion}`)}" alt="" aria-hidden="true">`;
};

function updateProfileHeader() {
    document.querySelector("#user-name").textContent = profile.full_name;
    document.querySelector("#business-name").textContent = profile.shop_name || (isBarber() ? "Minha barbearia" : "Cliente");
    const avatar = document.querySelector("#business-avatar");
    avatar.innerHTML = avatarContents(profile.avatar_path, profile.shop_name || profile.full_name);
    document.querySelector("#greeting-name").textContent = profile.full_name.split(/\s+/)[0];
}

function showNotice(message, isError = false) {
    notice.textContent = message;
    notice.classList.add("visivel");
    notice.style.background = isError ? "#9c3e32" : "";
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(() => notice.classList.remove("visivel"), 3500);
}

function renderError(error) {
    console.error(error);
    main.innerHTML = `<div class="error-state"><strong>Não foi possível carregar esta página.</strong><p>${safe(error.message || "Verifique a conexão e a configuração do Supabase.")}</p><button class="button" data-action="reload" type="button">Tentar novamente</button></div>`;
}

function navigation() {
    const groups = isBarber()
        ? [
            ["WORKSPACE", [["overview", "Visão geral", "◈"], ["bookings", "Agenda", "▦"], ["clients", "Clientes", "◎"], ["profile", "Meu perfil", "✦"]]],
            ["GESTÃO", [["finance", "Financeiro", "↗"], ["inventory", "Estoque", "▤"], ["services", "Serviços", "▤"], ["posts", "Conteúdo", "▢"]]]
        ]
        : [["COMUNIDADE", [["feed", "Feed", "◈"], ["bookings", "Meus agendamentos", "▦"], ["profile", "Meu perfil", "✦"]]]];
    nav.innerHTML = groups.map(([group, pages]) =>
        `<div class="grupo-navegacao"><span class="titulo-navegacao">${group}</span>${pages.map(([id, label, icon]) =>
            `<button class="link-navegacao ${view === id ? "ativo" : ""}" data-view="${id}" type="button" ${view === id ? 'aria-current="page"' : ""}><span class="icone-nav" aria-hidden="true">${icon}</span><span>${label}</span></button>`
        ).join("")}</div>`
    ).join("");
}

function pageHeading(eyebrow, title, description, action = "") {
    return `<header class="cabecalho-pagina"><div><span class="sobretitulo">${safe(eyebrow)}</span><h1>${safe(title)}</h1><p>${safe(description)}</p></div>${action}</header>`;
}

function openDialog(title, eyebrow, fields, buttonText, onSubmit) {
    dialog.innerHTML = `<form class="dialog-content" id="dialog-form"><div class="dialog-heading"><div><span class="eyebrow">${safe(eyebrow)}</span><h2>${safe(title)}</h2></div><button class="dialog-close" type="button" data-action="close-dialog" aria-label="Fechar">×</button></div>${fields}<button class="button button-primary" type="submit">${safe(buttonText)}</button></form>`;
    dialog.showModal();
    dialog.querySelector("#dialog-form").addEventListener("submit", async event => {
        event.preventDefault();
        const submit = event.submitter;
        submit.disabled = true;
        try {
            await onSubmit(new FormData(event.currentTarget));
            dialog.close();
        } catch (error) {
            showNotice(error.message || "Não foi possível salvar. Tente novamente.", true);
        } finally {
            submit.disabled = false;
        }
    });
}

function field(name, label, type = "text", options = {}) {
    const id = `field-${name}`;
    const required = options.required ? "required" : "";
    const value = options.value === undefined ? "" : `value="${safe(options.value)}"`;
    const placeholder = options.placeholder ? `placeholder="${safe(options.placeholder)}"` : "";
    const min = options.min === undefined ? "" : `min="${safe(options.min)}"`;
    const max = options.max === undefined ? "" : `max="${safe(options.max)}"`;
    const maxLength = type === "text" && options.max !== undefined ? `maxlength="${safe(options.max)}"` : "";
    const step = options.step === undefined ? "" : `step="${safe(options.step)}"`;
    if (type === "textarea") {
        return `<div class="field ${options.full ? "field-full" : ""}"><label for="${id}">${safe(label)}</label><textarea id="${id}" name="${safe(name)}" maxlength="${safe(options.maxLength || 2000)}" ${placeholder} ${required}>${safe(options.value || "")}</textarea></div>`;
    }
    if (type === "select") {
        const choices = (options.options || []).map(option => {
            const selected = option.value === options.value ? "selected" : "";
            return `<option value="${safe(option.value)}" ${selected}>${safe(option.label)}</option>`;
        }).join("");
        return `<div class="field ${options.full ? "field-full" : ""}"><label for="${id}">${safe(label)}</label><select id="${id}" name="${safe(name)}" ${required}>${choices}</select></div>`;
    }
    return `<div class="field ${options.full ? "field-full" : ""}"><label for="${id}">${safe(label)}</label><input id="${id}" name="${safe(name)}" type="${safe(type)}" ${value} ${placeholder} ${min} ${max} ${maxLength} ${step} ${required}></div>`;
}

function render() {
    navigation();
    if (view === "overview") renderOverview();
    else if (view === "feed") renderFeed();
    else if (view === "posts") renderPosts();
    else if (view === "services") renderServices();
    else if (view === "bookings") renderBookings();
    else if (view === "clients") renderClients();
    else if (view === "finance") renderFinance();
    else if (view === "inventory") renderInventory();
    else renderProfile();
}

async function loadView(nextView) {
    view = nextView;
    main.innerHTML = '<p class="loading-state">Carregando...</p>';
    try {
        if (view === "overview") {
            await Promise.all([loadBookings(), loadServices(true), loadFinancialEntries(), loadInventoryItems()]);
        }
        if (view === "feed") await loadFeed();
        if (view === "posts") await loadPosts();
        if (view === "services") await loadServices(true);
        if (view === "bookings") {
            await Promise.all([
                loadBookings(),
                ...(isBarber() ? [loadServices(true)] : [])
            ]);
        }
        if (view === "clients") await loadBookings();
        if (view === "finance") await loadFinancialEntries();
        if (view === "inventory") await loadInventoryItems();
        render();
        main.focus({ preventScroll: true });
    } catch (error) {
        renderError(error);
    }
}

async function loadFeed() {
    const [{ data: feed, error: feedError }, { data: serviceRows, error: serviceError }] = await Promise.all([
        supabase.rpc("get_public_posts"),
        supabase.from("services").select("id, barber_id, name, description, price, duration_minutes, active").eq("active", true).order("name")
    ]);
    if (feedError) throw feedError;
    if (serviceError) throw serviceError;
    posts = feed || [];
    services = serviceRows || [];
    const barberIds = [...new Set(services.map(item => item.barber_id))];
    if (barberIds.length) {
        const { data, error } = await supabase.from("profiles").select("id, full_name, shop_name").in("id", barberIds);
        if (error) throw error;
        const barbers = new Map((data || []).map(item => [item.id, item]));
        services = services.map(item => ({ ...item, barber: barbers.get(item.barber_id) }));
    }
}

async function loadPosts() {
    const { data, error } = await supabase.rpc("get_public_posts");
    if (error) throw error;
    posts = (data || []).filter(item => item.barber_id === user.id);
}

async function loadServices(ownOnly) {
    let query = supabase.from("services")
        .select("id, barber_id, name, description, price, duration_minutes, active, created_at")
        .order("created_at", { ascending: false });
    if (ownOnly) query = query.eq("barber_id", user.id);
    const { data, error } = await query;
    if (error) throw error;
    services = data || [];
}

async function loadBookings() {
    const { data, error } = await supabase.rpc("get_my_bookings");
    if (error) throw error;
    bookings = data || [];
}

async function loadFinancialEntries() {
    const { data, error } = await supabase.from("financial_entries")
        .select("id, type, description, category, amount, entry_date, created_at")
        .eq("barber_id", user.id)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
    if (error) throw error;
    financialEntries = data || [];
}

async function loadInventoryItems() {
    const { data, error } = await supabase.from("inventory_items")
        .select("id, name, category, quantity, unit, unit_cost, minimum_quantity, updated_at")
        .eq("barber_id", user.id)
        .order("name");
    if (error) throw error;
    inventoryItems = data || [];
}

function monthFinancialTotals() {
    const monthEntries = financialEntries.filter(item => item.entry_date.startsWith(dateToday().slice(0, 7)));
    const income = monthEntries.filter(item => item.type === "income").reduce((sum, item) => sum + Number(item.amount), 0);
    const expense = monthEntries.filter(item => item.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
    return { income, expense, balance: income - expense };
}

function renderOverview() {
    const totals = monthFinancialTotals();
    const today = dateToday();
    const todayBookings = bookings.filter(item => item.starts_at.slice(0, 10) === today && item.status !== "cancelled");
    const upcoming = bookings.filter(item => new Date(item.starts_at) >= new Date() && ["pending", "confirmed"].includes(item.status))
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)).slice(0, 4);
    const clientCount = new Set(bookings.map(item => item.customer_id)).size;
    const metrics = [
        ["Agendamentos hoje", todayBookings.length, "Sua agenda de hoje", "tom-amarelo", "▦"],
        ["Clientes atendidos", clientCount, "Com agendamentos registrados", "tom-verde", "◎"],
        ["Entradas no mês", money(totals.income), "Receitas registradas", "tom-azul", "↙"],
        ["Saldo do mês", money(totals.balance), `${money(totals.expense)} em saídas`, "tom-rosa", "↗"]
    ];
    const bookingRows = upcoming.length ? upcoming.map(item => {
        const customerName = isBarber() ? item.customer_name : item.barber_name;
        const label = item.status === "confirmed" ? "Confirmado" : item.status === "pending" ? "Aguardando" : item.status;
        const statusClass = item.status === "confirmed" ? "estado-confirmado" : "estado-aguardando";
        return `<article class="linha-agendamento"><time class="hora-agendamento">${safe(new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.starts_at)))}</time><span class="avatar avatar-agendamento">${safe(initials(customerName))}</span><div class="dados-agendamento"><strong>${safe(customerName)}</strong><span>${safe(item.service_name)} · ${safe(dateTime(item.starts_at))}</span></div><span class="estado-agendamento ${statusClass}">${safe(label)}</span></article>`;
    }).join("") : '<p class="estado-vazio">Sua agenda está vazia. Os próximos agendamentos aparecerão aqui.</p>';
    const shortcuts = [
        ["finance", "↗", "Financeiro", `${money(totals.balance)} de saldo no mês`],
        ["inventory", "▤", "Estoque", `${inventoryItems.length} itens cadastrados`],
        ["services", "▤", "Serviços", `${services.length} cadastrados`],
        ["posts", "▢", "Conteúdo", "Publicações para clientes"]
    ];
    main.innerHTML = `${pageHeading("VISÃO GERAL", `Olá, ${profile.full_name.split(/\s+/)[0]}.`, "Acompanhe a rotina e os resultados da sua barbearia.")}
        <section class="grade-indicadores" aria-label="Resumo do negócio">${metrics.map(([label, value, caption, tone, icon]) => `<article class="cartao-indicador"><div class="topo-indicador"><span>${safe(label)}</span><span class="icone-indicador ${tone}" aria-hidden="true">${icon}</span></div><strong class="valor-indicador">${safe(value)}</strong><span class="variacao-indicador">${safe(caption)}</span></article>`).join("")}</section>
        <div class="grade-conteudo">
            <section class="painel-conteudo painel-agenda"><div class="cabecalho-painel"><div><span class="sobretitulo">ROTINA</span><h2>Próximos atendimentos</h2></div><button class="link-discreto" type="button" data-view="bookings">Abrir agenda <span aria-hidden="true">→</span></button></div><div class="lista-agendamentos">${bookingRows}</div></section>
            <section class="painel-conteudo painel-clientes"><div class="cabecalho-painel"><div><span class="sobretitulo">GESTÃO</span><h2>Atalhos</h2></div></div><div class="acoes-atalho">${shortcuts.map(([target, icon, label, description]) => `<button class="atalho-painel" type="button" data-view="${target}"><span aria-hidden="true">${icon}</span><strong>${label}</strong><small>${safe(description)}</small></button>`).join("")}</div></section>
        </div>`;
}

function renderClients() {
    const clients = new Map();
    bookings.forEach(booking => {
        const current = clients.get(booking.customer_id);
        if (!current || new Date(booking.starts_at) > new Date(current.lastBooking)) {
            clients.set(booking.customer_id, { name: booking.customer_name, lastBooking: booking.starts_at, total: (current?.total || 0) + 1 });
        } else {
            current.total += 1;
        }
    });
    const rows = [...clients.values()].sort((a, b) => new Date(b.lastBooking) - new Date(a.lastBooking));
    const list = rows.length ? rows.map(item => `<article class="linha-cliente"><span class="avatar avatar-cliente">${safe(initials(item.name))}</span><div class="dados-cliente"><strong>${safe(item.name)}</strong><span>Último agendamento · ${safe(dateTime(item.lastBooking))}</span></div><span class="valor-cliente">${item.total} ${item.total === 1 ? "visita" : "visitas"}</span></article>`).join("") : '<p class="estado-vazio">Clientes com agendamentos aparecerão aqui.</p>';
    main.innerHTML = `${pageHeading("RELACIONAMENTO", "Clientes", "Acompanhe os clientes que já solicitaram horários na barbearia.")}<section class="painel-conteudo tabela-clientes"><div class="cabecalho-painel"><div><span class="sobretitulo">SUA COMUNIDADE</span><h2>${rows.length} clientes</h2></div></div><div class="lista-clientes lista-clientes-completa">${list}</div></section>`;
}

function renderFinance() {
    const totals = monthFinancialTotals();
    const rows = financialEntries.length ? financialEntries.map(item => `<article class="linha-financeira"><span class="indicador-tipo ${item.type === "income" ? "entrada" : "saida"}" aria-hidden="true">${item.type === "income" ? "↙" : "↗"}</span><div class="dados-lancamento"><strong>${safe(item.description)}</strong><span>${safe(item.category)} · ${safe(formatDate(item.entry_date))}</span></div><strong class="valor-lancamento ${item.type === "income" ? "entrada" : "saida"}">${item.type === "income" ? "+" : "−"} ${money(item.amount)}</strong><div class="acoes-lancamento"><button class="botao-editar-lancamento" type="button" data-action="edit-entry" data-id="${safe(item.id)}" aria-label="Editar lançamento ${safe(item.description)}">✎</button><button class="botao-remover" type="button" data-action="delete-entry" data-id="${safe(item.id)}" aria-label="Remover lançamento ${safe(item.description)}">×</button></div></article>`).join("") : '<p class="estado-vazio">Nenhuma movimentação registrada. Adicione entradas e despesas para acompanhar o resultado.</p>';
    const action = '<button class="botao-primario" type="button" data-action="new-entry"><span aria-hidden="true">+</span> Adicionar lançamento</button>';
    main.innerHTML = `${pageHeading("GESTÃO", "Financeiro", "Controle as entradas, saídas e o saldo da sua barbearia.", action)}<section class="grade-resumo-financeiro"><article><span>Entradas neste mês</span><strong class="texto-entrada">${money(totals.income)}</strong></article><article><span>Saídas neste mês</span><strong class="texto-saida">${money(totals.expense)}</strong></article><article><span>Saldo deste mês</span><strong>${money(totals.balance)}</strong></article></section><section class="painel-conteudo tabela-financeira"><div class="cabecalho-painel"><div><span class="sobretitulo">MOVIMENTAÇÕES</span><h2>${financialEntries.length} lançamentos</h2></div><span class="legenda-horario">MÊS ATUAL NO RESUMO</span></div><div class="lista-financeira">${rows}</div></section>`;
}

function financialEntryFields(entry = {}) {
    const categories = ["Serviços", "Produtos", "Estoque", "Aluguel", "Contas", "Equipamentos", "Impostos", "Outros"];
    if (entry.category && !categories.includes(entry.category)) categories.push(entry.category);
    return `<div class="form-grid">${field("type", "Movimentação", "select", { required: true, value: entry.type || "income", options: [{ value: "income", label: "Entrada" }, { value: "expense", label: "Saída" }] })}${field("category", "Categoria", "select", { required: true, value: entry.category || "Serviços", options: categories.map(value => ({ value, label: value })) })}${field("description", "Descrição", "text", { required: true, max: 120, placeholder: "Ex.: Corte, aluguel, conta de luz", value: entry.description || "" })}${field("amount", "Valor (R$)", "number", { required: true, min: "0.01", step: "0.01", placeholder: "0,00", value: entry.amount === undefined ? "" : String(entry.amount) })}${field("entry_date", "Data", "date", { required: true, value: entry.entry_date || dateToday() })}</div>`;
}

function renderInventory() {
    const totalQuantity = inventoryItems.reduce((sum, item) => sum + Number(item.quantity), 0);
    const lowStockCount = inventoryItems.filter(item => Number(item.quantity) <= Number(item.minimum_quantity)).length;
    const rows = inventoryItems.length ? inventoryItems.map(item => {
        const lowStock = Number(item.quantity) <= Number(item.minimum_quantity);
        return `<article class="linha-estoque">
            <span class="icone-estoque" aria-hidden="true">▤</span>
            <div class="dados-produto"><strong>${safe(item.name)}</strong><span>${safe(item.category)}</span></div>
            <span class="quantidade-produto ${lowStock ? "estoque-baixo" : ""}">${safe(Number(item.quantity).toLocaleString("pt-BR", { maximumFractionDigits: 2 }))} ${safe(item.unit)}</span>
            <span class="custo-produto">${money(item.unit_cost)} / ${safe(item.unit)}</span>
            <div class="acoes-produto">
                <button class="botao-secundario" type="button" data-action="move-inventory" data-direction="entry" data-id="${safe(item.id)}">Entrada</button>
                <button class="botao-secundario" type="button" data-action="move-inventory" data-direction="use" data-id="${safe(item.id)}">Uso</button>
                <button class="botao-remover" type="button" data-action="delete-inventory" data-id="${safe(item.id)}" aria-label="Remover ${safe(item.name)}">×</button>
            </div>
        </article>`;
    }).join("") : '<p class="estado-vazio">Seu estoque está vazio. Cadastre itens para acompanhar quantidades, compras e consumo.</p>';
    const action = '<button class="botao-primario" type="button" data-action="new-inventory"><span aria-hidden="true">+</span> Adicionar item</button>';
    main.innerHTML = `${pageHeading("GESTÃO", "Estoque", "Acompanhe utensílios, produtos e compras da barbearia.", action)}
        <section class="grade-resumo-financeiro resumo-estoque">
            <article><span>Itens cadastrados</span><strong>${inventoryItems.length}</strong></article>
            <article><span>Unidades em estoque</span><strong>${safe(totalQuantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 }))}</strong></article>
            <article><span>Itens no mínimo</span><strong>${lowStockCount}</strong></article>
        </section>
        <section class="painel-conteudo tabela-financeira"><div class="cabecalho-painel"><div><span class="sobretitulo">MATERIAIS E UTENSÍLIOS</span><h2>Estoque atual</h2></div></div><div class="lista-estoque">${rows}</div></section>
        <p class="nota-modulo">Compras registradas como entrada no estoque também são lançadas automaticamente como despesa no financeiro.</p>`;
}

function renderFeed() {
    const serviceCards = services.length ? `<section><div class="card-header"><div><span class="eyebrow">ENCONTRE SEU PRÓXIMO CORTE</span><h2>Serviços</h2></div></div><div class="grid-cards">${services.map(service => `<article class="card"><span class="eyebrow">${safe(service.barber?.shop_name || service.barber?.full_name || "Barbearia")}</span><h3>${safe(service.name)}</h3><p class="muted">${safe(service.description || "Serviço disponível para agendamento.")}</p><p class="muted">${safe(service.duration_minutes)} min</p><strong class="price">${money(service.price)}</strong><div class="feed-actions"><button class="button button-primary" type="button" data-action="book" data-id="${safe(service.id)}">Solicitar horário</button></div></article>`).join("")}</div></section>` : '<p class="empty-state">Ainda não há serviços publicados. Quando uma barbearia cadastrar um serviço, você poderá solicitar um horário por aqui.</p>';
    const postCards = posts.length ? posts.map(post => {
        const image = usableImage(post.image_url);
        const comments = commentsByPost[post.id];
        return `<article class="card feed-card"><div class="card-header"><div class="cabecalho-postagem"><span class="avatar avatar-postagem">${avatarContents(post.barber_avatar_path, post.barber_name)}</span><div><span class="eyebrow">${safe(post.shop_name || "Barbearia")}</span><h3>${safe(post.barber_name)}</h3></div></div><time class="muted">${dateTime(post.created_at)}</time></div><p class="feed-copy">${safe(post.body)}</p>${image ? `<img class="feed-image" src="${safe(image)}" alt="Imagem publicada por ${safe(post.barber_name)}" loading="lazy">` : ""}<div class="feed-actions"><button class="button" type="button" data-action="like" data-id="${safe(post.id)}">${post.has_liked ? "♥ Curtido" : "♡ Curtir"} · ${safe(post.likes_count)}</button><button class="button" type="button" data-action="comments" data-id="${safe(post.id)}">Comentários · ${safe(post.comments_count)}</button><button class="button" type="button" data-action="book-barber" data-id="${safe(post.barber_id)}">Ver horários e agendar</button></div>${comments ? `<div class="comments">${comments.map(comment => `<div class="comment-item"><span class="avatar avatar-comentario">${avatarContents(comment.author_avatar_path, comment.author_name)}</span><div><strong>${safe(comment.author_name)}</strong><span>${safe(comment.body)}</span></div></div>`).join("") || '<p class="muted">Nenhum comentário ainda.</p>'}<form class="inline-form" data-form="comment" data-id="${safe(post.id)}"><input name="body" maxlength="1000" placeholder="Escreva um comentário..." aria-label="Escreva um comentário" required><button class="button" type="submit">Enviar</button></form></div>` : ""}</article>`;
    }).join("") : '<p class="empty-state">Os barbeiros ainda não publicaram novidades.</p>';
    main.innerHTML = `${pageHeading("COMUNIDADE", "Feed dos barbeiros", "Acompanhe as novidades, curta, comente e agende seu próximo atendimento.")}<section><div class="card-header"><div><span class="eyebrow">NOVIDADES</span><h2>Postagens</h2></div></div>${postCards}</section><section>${serviceCards}</section>`;
}

function renderPosts() {
    const action = '<button class="button button-primary" type="button" data-action="new-post">Nova postagem</button>';
    const cards = posts.length ? posts.map(post => {
        const image = usableImage(post.image_url);
        const comments = commentsByPost[post.id];
        const likes = likesByPost[post.id];
        const commentList = comments === undefined ? "" : `<div class="detalhes-interacao">${comments.length ? comments.map(comment => `<div class="comment-item"><span class="avatar avatar-comentario">${avatarContents(comment.author_avatar_path, comment.author_name)}</span><div><strong>${safe(comment.author_name)}</strong><span>${safe(comment.body)}</span><time>${dateTime(comment.created_at)}</time></div></div>`).join("") : '<p class="muted">Nenhum comentário nesta postagem.</p>'}</div>`;
        const likeList = likes === undefined ? "" : `<div class="lista-curtidas">${likes.length ? likes.map(like => `<div class="curtida-item"><span class="avatar avatar-comentario">${avatarContents(like.avatar_path, like.profile_name)}</span><strong>${safe(like.profile_name)}</strong><time>${dateTime(like.created_at)}</time></div>`).join("") : '<p class="muted">Esta postagem ainda não recebeu curtidas.</p>'}</div>`;
        return `<article class="card"><div class="card-header"><div class="cabecalho-postagem"><span class="avatar avatar-postagem">${avatarContents(post.barber_avatar_path, profile.full_name)}</span><div><span class="eyebrow">${safe(post.shop_name || profile.shop_name)}</span><time class="muted">${dateTime(post.created_at)}</time></div></div><button class="button button-danger" type="button" data-action="delete-post" data-id="${safe(post.id)}">Excluir</button></div><p class="feed-copy">${safe(post.body)}</p>${image ? `<img class="feed-image" src="${safe(image)}" alt="Imagem da postagem" loading="lazy">` : ""}<p class="muted">♥ ${safe(post.likes_count)} curtidas · ${safe(post.comments_count)} comentários</p><div class="feed-actions"><button class="button" type="button" data-action="post-likes" data-id="${safe(post.id)}">${likes === undefined ? "Ver curtidas" : "Ocultar curtidas"} (${safe(post.likes_count)})</button><button class="button" type="button" data-action="post-comments" data-id="${safe(post.id)}">${comments === undefined ? "Ver comentários" : "Ocultar comentários"} (${safe(post.comments_count)})</button></div>${likeList}${commentList}</article>`;
    }).join("") : '<p class="empty-state">Compartilhe seu primeiro trabalho, novidade ou aviso com os clientes.</p>';
    main.innerHTML = `${pageHeading("CONTEÚDO", "Suas postagens", "Publique novidades e acompanhe curtidas e comentários dos clientes.", action)}${cards}`;
}

function renderServices() {
    const action = '<button class="button button-primary" type="button" data-action="new-service">Adicionar serviço</button>';
    const cards = services.length ? services.map(service => `<article class="card service-card"><div><span class="status-pill ${service.active ? "confirmed" : ""}">${service.active ? "Disponível" : "Oculto"}</span><h3>${safe(service.name)}</h3><p class="muted">${safe(service.description || "Sem descrição.")}</p><p class="muted">${safe(service.duration_minutes)} min · <strong class="price">${money(service.price)}</strong></p></div><div class="service-actions"><button class="button" type="button" data-action="toggle-service" data-id="${safe(service.id)}" data-active="${safe(service.active)}">${service.active ? "Ocultar" : "Ativar"}</button><button class="button button-danger" type="button" data-action="delete-service" data-id="${safe(service.id)}">Excluir</button></div></article>`).join("") : '<p class="empty-state">Cadastre serviços para que clientes possam encontrá-los e agendar.</p>';
    main.innerHTML = `${pageHeading("CATÁLOGO", "Seus serviços", "Gerencie os serviços que aparecem para os clientes.", action)}${cards}`;
}

function renderBookings() {
    const ownBookings = bookings.filter(item => isBarber() ? item.barber_id === user.id : item.customer_id === user.id);
    const cards = ownBookings.length ? ownBookings.map(booking => {
        const statusClass = booking.status === "confirmed" ? "confirmed" : booking.status === "cancelled" ? "cancelled" : "";
        const statusLabel = { pending: "Aguardando confirmação", confirmed: "Confirmado", cancelled: "Cancelado", completed: "Concluído" }[booking.status] || booking.status;
        const canCancel = !isBarber() && ["pending", "confirmed"].includes(booking.status) && new Date(booking.starts_at) > new Date();
        const controls = isBarber() && booking.status === "pending"
            ? `<button class="button button-primary" type="button" data-action="booking-status" data-status="confirmed" data-id="${safe(booking.id)}">Confirmar</button><button class="button button-danger" type="button" data-action="booking-status" data-status="cancelled" data-id="${safe(booking.id)}">Recusar</button>`
            : isBarber() && booking.status === "confirmed"
                ? `<button class="button" type="button" data-action="booking-status" data-status="completed" data-id="${safe(booking.id)}">Marcar concluído</button><button class="button button-danger" type="button" data-action="booking-status" data-status="cancelled" data-id="${safe(booking.id)}">Cancelar</button>`
                : canCancel ? `<button class="button button-danger" type="button" data-action="cancel-booking" data-id="${safe(booking.id)}">Cancelar agendamento</button>` : "";
        return `<article class="card booking-card"><div><span class="status-pill ${statusClass}">${safe(statusLabel)}</span><h3>${safe(booking.service_name)}</h3><p>${isBarber() ? `Cliente: ${safe(booking.customer_name)}` : `Barbeiro: ${safe(booking.barber_name)} · ${safe(booking.shop_name || "")}`}</p><p class="muted">${dateTime(booking.starts_at)} · ${safe(booking.duration_minutes || Math.round((new Date(booking.ends_at) - new Date(booking.starts_at)) / 60000))} min</p><strong class="price">${money(booking.price)}</strong></div><div class="booking-actions">${controls}</div></article>`;
    }).join("") : isBarber()
        ? services.some(service => service.active)
            ? '<p class="empty-state">Ainda não há pedidos. Quando um cliente solicitar um horário pelo Feed, o pedido aparecerá aqui para você confirmar ou recusar.</p>'
            : '<div class="empty-state"><p>Seus clientes poderão solicitar horários pelo Feed assim que você publicar um serviço ativo.</p><button class="button button-primary" type="button" data-view="services">Cadastrar serviço</button></div>'
        : '<p class="empty-state">Nenhum agendamento por aqui ainda. Encontre um serviço no Feed e solicite um horário.</p>';
    const action = isBarber()
        ? ""
        : '<button class="button button-primary" type="button" data-view="feed">Solicitar agendamento</button>';
    main.innerHTML = `${pageHeading(isBarber() ? "ROTINA" : "SUA AGENDA", isBarber() ? "Agenda da barbearia" : "Meus agendamentos", isBarber() ? "Os clientes solicitam horários pelo Feed; confirme ou recuse os pedidos aqui." : "Consulte seus pedidos e solicite novos horários.", action)}${cards}`;
}

function renderProfile() {
    const role = isBarber() ? "BARBEIRO" : "CLIENTE";
    main.innerHTML = `${pageHeading("SUA CONTA", "Meu perfil", "Atualize as informações que aparecem na plataforma.")}<form class="card" id="profile-form"><span class="eyebrow">${role}</span><div class="campo-foto-perfil"><span class="avatar avatar-perfil-grande">${avatarContents(profile.avatar_path, profile.full_name)}</span><div class="field"><label for="profile-avatar">Foto de perfil</label><input id="profile-avatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp"><small>Selecione uma imagem JPG, PNG ou WebP de até 5 MB. A foto ficará visível na plataforma.</small>${profile.avatar_path ? '<label class="opcao-remover-foto"><input type="checkbox" name="remove_avatar"> Remover foto atual</label>' : ""}</div></div>${field("full_name", "Nome", "text", { value: profile.full_name, required: true, max: 100 })}${isBarber() ? field("shop_name", "Nome da barbearia", "text", { value: profile.shop_name, required: true, max: 100 }) + field("bio", "Sobre", "textarea", { value: profile.bio, maxLength: 500, full: true }) : ""}<div class="field"><label>E-mail da conta</label><input type="email" value="${safe(user.email)}" disabled></div><button class="button button-primary" type="submit">Salvar perfil</button></form>`;
}

function bookingDialog(serviceList, barberId, barberName = "") {
    const options = serviceList.filter(item => item.barber_id === barberId && item.active)
        .map(item => `<option value="${safe(item.id)}">${safe(item.name)} · ${money(item.price)} · ${safe(item.duration_minutes)} min</option>`).join("");
    if (!options) {
        showNotice("Este barbeiro ainda não possui serviços disponíveis para agendamento.", true);
        return;
    }
    const fields = `<p class="muted">${safe(barberName || "Escolha o serviço e o horário desejado.")}</p><div class="field"><label for="booking-service">Serviço</label><select id="booking-service" name="service_id" required>${options}</select></div>${field("date", "Data", "date", { required: true, min: dateToday() })}${field("time", "Horário", "time", { required: true })}`;
    openDialog("Novo agendamento", "ESCOLHA UM HORÁRIO", fields, "Solicitar agendamento", async form => {
        const service = serviceList.find(item => item.id === form.get("service_id"));
        const startsAt = new Date(`${form.get("date")}T${form.get("time")}`);
        if (!service || !Number.isFinite(startsAt.getTime()) || startsAt <= new Date()) {
            throw new Error("Escolha um serviço e um horário futuro válido.");
        }
        const endsAt = new Date(startsAt.getTime() + service.duration_minutes * 60000);
        const { error } = await supabase.from("bookings").insert({
            customer_id: user.id,
            barber_id: service.barber_id,
            service_id: service.id,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            status: "pending"
        });
        if (error) throw error;
        showNotice("Pedido enviado. O barbeiro precisa confirmar o horário.");
        await loadView("bookings");
    });
}

document.addEventListener("click", async event => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
        await loadView(viewButton.dataset.view);
        return;
    }
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;
    const { action, id } = actionButton.dataset;
    try {
        if (action === "close-dialog") dialog.close();
        else if (action === "reload") await loadView(view);
        else if (action === "new-post") {
            const fields = `${field("body", "Texto da postagem", "textarea", { required: true, maxLength: 2000, full: true })}${field("image_url", "Link de imagem (opcional)", "url", { placeholder: "https://...", max: 2048, full: true })}`;
            openDialog("Nova postagem", "COMPARTILHE COM SEUS CLIENTES", fields, "Publicar", async form => {
                const imageUrl = String(form.get("image_url") || "").trim();
                if (imageUrl && !usableImage(imageUrl)) throw new Error("Use um link de imagem HTTP ou HTTPS.");
                const { error } = await supabase.from("posts").insert({
                    barber_id: user.id, body: String(form.get("body")).trim(), image_url: imageUrl || null
                });
                if (error) throw error;
                showNotice("Postagem publicada.");
                await loadView("posts");
            });
        } else if (action === "delete-post") {
            const { error } = await supabase.from("posts").delete().eq("id", id).eq("barber_id", user.id);
            if (error) throw error;
            showNotice("Postagem excluída.");
            await loadView("posts");
        } else if (action === "new-service") {
            const fields = `<div class="form-grid">${field("name", "Nome do serviço", "text", { required: true, max: 100 })}${field("price", "Preço (R$)", "number", { required: true, min: "0", step: "0.01" })}${field("duration_minutes", "Duração (minutos)", "number", { required: true, min: "10", max: "480", step: "5", value: "30" })}${field("description", "Descrição", "textarea", { maxLength: 500, full: true })}</div>`;
            openDialog("Adicionar serviço", "SEU CATÁLOGO", fields, "Salvar serviço", async form => {
                const { error } = await supabase.from("services").insert({
                    barber_id: user.id,
                    name: String(form.get("name")).trim(),
                    description: String(form.get("description") || "").trim(),
                    price: Number(form.get("price")),
                    duration_minutes: Number(form.get("duration_minutes"))
                });
                if (error) throw error;
                showNotice("Serviço cadastrado.");
                await loadView("services");
            });
        } else if (action === "toggle-service") {
            const active = actionButton.dataset.active !== "true";
            const { error } = await supabase.from("services").update({ active }).eq("id", id).eq("barber_id", user.id);
            if (error) throw error;
            await loadView("services");
        } else if (action === "delete-service") {
            const { error } = await supabase.from("services").delete().eq("id", id).eq("barber_id", user.id);
            if (error) throw error;
            showNotice("Serviço excluído.");
            await loadView("services");
        } else if (action === "new-entry") {
            openDialog("Novo lançamento", "FINANCEIRO", financialEntryFields(), "Salvar lançamento", async form => {
                const { error } = await supabase.from("financial_entries").insert({
                    barber_id: user.id,
                    type: String(form.get("type")),
                    category: String(form.get("category")),
                    description: String(form.get("description")).trim(),
                    amount: Number(form.get("amount")),
                    entry_date: String(form.get("entry_date"))
                });
                if (error) throw error;
                showNotice("Lançamento financeiro salvo.");
                await loadView("finance");
            });
        } else if (action === "edit-entry") {
            const entry = financialEntries.find(item => item.id === id);
            if (!entry) throw new Error("Este lançamento não está mais disponível para edição.");
            openDialog("Editar lançamento", "FINANCEIRO", financialEntryFields(entry), "Salvar alterações", async form => {
                const { error } = await supabase.from("financial_entries").update({
                    type: String(form.get("type")),
                    category: String(form.get("category")),
                    description: String(form.get("description")).trim(),
                    amount: Number(form.get("amount")),
                    entry_date: String(form.get("entry_date"))
                }).eq("id", entry.id).eq("barber_id", user.id);
                if (error) throw error;
                showNotice("Lançamento financeiro atualizado.");
                await loadView("finance");
            });
        } else if (action === "new-inventory") {
            const fields = `<div class="form-grid">
                ${field("name", "Nome do item", "text", { required: true, max: 100, placeholder: "Ex.: Pomada modeladora" })}
                ${field("category", "Categoria", "select", { required: true, options: ["Produtos", "Consumíveis", "Ferramentas", "Proteção", "Equipamentos", "Outros"].map(value => ({ value, label: value })) })}
                ${field("quantity", "Quantidade inicial", "number", { required: true, min: "0", step: "0.01", value: "0" })}
                ${field("unit", "Unidade", "select", { required: true, options: ["un.", "caixas", "pacotes", "litros", "frascos", "pares", "rolos"].map(value => ({ value, label: value })) })}
                ${field("unit_cost", "Custo por unidade (R$)", "number", { required: true, min: "0", step: "0.01", value: "0" })}
                ${field("minimum_quantity", "Avisar quando chegar a", "number", { required: true, min: "0", step: "0.01", value: "2" })}
            </div>`;
            openDialog("Adicionar item ao estoque", "ESTOQUE · COMPRAS", fields, "Salvar item", async form => {
                const quantity = Number(form.get("quantity"));
                const unitCost = Number(form.get("unit_cost"));
                const { error } = await supabase.rpc("create_inventory_item", {
                    p_name: String(form.get("name")).trim(),
                    p_category: String(form.get("category")),
                    p_quantity: quantity,
                    p_unit: String(form.get("unit")),
                    p_unit_cost: unitCost,
                    p_minimum_quantity: Number(form.get("minimum_quantity")),
                    p_entry_date: dateToday()
                });
                if (error) throw error;
                showNotice(quantity > 0 && unitCost > 0
                    ? "Item cadastrado e compra lançada no financeiro."
                    : "Item cadastrado no estoque.");
                await loadView("inventory");
            });
        } else if (action === "move-inventory") {
            const item = inventoryItems.find(entry => entry.id === id);
            if (!item) return;
            const isEntry = actionButton.dataset.direction === "entry";
            const fields = `${field("quantity", "Quantidade", "number", { required: true, min: "0.01", step: "0.01" })}${isEntry ? field("unit_cost", "Custo por unidade (R$)", "number", { required: true, min: "0", step: "0.01", value: String(item.unit_cost) }) : ""}`;
            openDialog(
                isEntry ? `Registrar compra: ${item.name}` : `Registrar uso: ${item.name}`,
                isEntry ? "ENTRADA NO ESTOQUE" : "CONSUMO DE MATERIAL",
                fields,
                isEntry ? "Registrar compra" : "Registrar uso",
                async form => {
                    const { error } = await supabase.rpc("move_inventory_item", {
                        p_item_id: item.id,
                        p_direction: isEntry ? "entry" : "use",
                        p_quantity: Number(form.get("quantity")),
                        p_unit_cost: isEntry ? Number(form.get("unit_cost")) : Number(item.unit_cost),
                        p_entry_date: dateToday()
                    });
                    if (error) throw error;
                    showNotice(isEntry
                        ? "Estoque atualizado e despesa registrada."
                        : "Consumo de material registrado.");
                    await loadView("inventory");
                }
            );
        } else if (action === "delete-inventory") {
            const item = inventoryItems.find(entry => entry.id === id);
            if (!item || !window.confirm(`Remover "${item.name}" do estoque?`)) return;
            const { error } = await supabase.from("inventory_items").delete().eq("id", id).eq("barber_id", user.id);
            if (error) throw error;
            showNotice("Item removido do estoque.");
            await loadView("inventory");
        } else if (action === "delete-entry") {
            const entry = financialEntries.find(item => item.id === id);
            if (!entry) throw new Error("Este lançamento não está mais disponível para exclusão.");
            openDialog(
                "Excluir lançamento?",
                "CONFIRME A EXCLUSÃO",
                `<p class="texto-confirmacao">Deseja realmente excluir <strong>${safe(entry.description)}</strong>? Esta ação não pode ser desfeita.</p>`,
                "Excluir lançamento",
                async () => {
                    const { error } = await supabase.from("financial_entries").delete().eq("id", entry.id).eq("barber_id", user.id);
                    if (error) throw error;
                    showNotice("Lançamento removido.");
                    await loadView("finance");
                }
            );
        } else if (action === "like") {
            const post = posts.find(item => item.id === id);
            if (!post) return;
            const request = post.has_liked
                ? supabase.from("post_likes").delete().eq("post_id", id).eq("profile_id", user.id)
                : supabase.from("post_likes").insert({ post_id: id, profile_id: user.id });
            const { error } = await request;
            if (error) throw error;
            await loadView("feed");
        } else if (action === "comments") {
            const { data, error } = await supabase.rpc("get_post_comments", { p_post_id: id });
            if (error) throw error;
            commentsByPost[id] = data || [];
            renderFeed();
        } else if (action === "post-comments") {
            if (commentsByPost[id] !== undefined) {
                delete commentsByPost[id];
            } else {
                const { data, error } = await supabase.rpc("get_post_comments", { p_post_id: id });
                if (error) throw error;
                commentsByPost[id] = data || [];
            }
            renderPosts();
        } else if (action === "post-likes") {
            if (likesByPost[id] !== undefined) {
                delete likesByPost[id];
            } else {
                const { data, error } = await supabase.rpc("get_post_likes", { p_post_id: id });
                if (error) throw error;
                likesByPost[id] = data || [];
            }
            renderPosts();
        } else if (action === "book") {
            const service = services.find(item => item.id === id);
            if (service) bookingDialog(services, service.barber_id, service.barber?.shop_name || service.barber?.full_name);
        } else if (action === "book-barber") {
            bookingDialog(services, id, posts.find(item => item.barber_id === id)?.barber_name);
        } else if (action === "cancel-booking") {
            const { error } = await supabase.rpc("cancel_booking", { p_booking_id: id });
            if (error) throw error;
            showNotice("Agendamento cancelado.");
            await loadView("bookings");
        } else if (action === "booking-status") {
            const { error } = await supabase.from("bookings").update({ status: actionButton.dataset.status }).eq("id", id);
            if (error) throw error;
            showNotice("Status do agendamento atualizado.");
            await loadView("bookings");
        }
    } catch (error) {
        showNotice(error.message || "Não foi possível concluir a ação.", true);
    }
});

document.addEventListener("submit", async event => {
    const form = event.target;
    if (form.matches('[data-form="comment"]')) {
        event.preventDefault();
        const postId = form.dataset.id;
        const body = String(new FormData(form).get("body") || "").trim();
        if (!body) return;
        try {
            const { error } = await supabase.from("post_comments").insert({
                post_id: postId, author_id: user.id, body
            });
            if (error) throw error;
            const { data, error: commentsError } = await supabase.rpc("get_post_comments", { p_post_id: postId });
            if (commentsError) throw commentsError;
            commentsByPost[postId] = data || [];
            showNotice("Comentário enviado.");
            await loadView("feed");
            commentsByPost[postId] = data || [];
            renderFeed();
        } catch (error) {
            showNotice(error.message || "Não foi possível enviar o comentário.", true);
        }
        return;
    }
    if (form.id === "profile-form") {
        event.preventDefault();
        const values = new FormData(form);
        const updates = { full_name: String(values.get("full_name")).trim() };
        const avatarFile = values.get("avatar");
        const removeAvatar = values.get("remove_avatar") === "on";
        const submit = form.querySelector('button[type="submit"]');
        if (isBarber()) {
            updates.shop_name = String(values.get("shop_name")).trim();
            updates.bio = String(values.get("bio") || "").trim();
        }
        submit.disabled = true;
        try {
            if (avatarFile.size > 5 * 1024 * 1024) {
                throw new Error("A foto deve ter no máximo 5 MB.");
            }
            const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
            const extension = extensions[avatarFile.type];
            if (avatarFile.size && !extension) {
                throw new Error("Escolha uma imagem JPG, PNG ou WebP.");
            }
            if (avatarFile.size && removeAvatar) {
                throw new Error("Escolha uma nova foto ou marque a opção para remover a foto atual.");
            }

            const previousAvatarPath = profile.avatar_path;
            let uploadedAvatarPath = null;
            if (avatarFile.size) {
                uploadedAvatarPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
                const { error: uploadError } = await supabase.storage
                    .from("profile-photos")
                    .upload(uploadedAvatarPath, avatarFile, { contentType: avatarFile.type, cacheControl: "0" });
                if (uploadError) throw uploadError;
                updates.avatar_path = uploadedAvatarPath;
            } else if (removeAvatar) {
                updates.avatar_path = null;
            }

            const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
            if (error) {
                if (uploadedAvatarPath) {
                    const { error: cleanupError } = await supabase.storage.from("profile-photos").remove([uploadedAvatarPath]);
                    if (cleanupError) {
                        throw new Error(`${error.message} A foto enviada também não pôde ser removida: ${cleanupError.message}`);
                    }
                }
                throw error;
            }
            profile = { ...profile, ...updates };
            avatarVersion = Date.now();
            let cleanupWarning = "";
            if (previousAvatarPath && previousAvatarPath !== profile.avatar_path) {
                const { error: cleanupError } = await supabase.storage.from("profile-photos").remove([previousAvatarPath]);
                if (cleanupError) cleanupWarning = `Perfil atualizado, mas não foi possível remover a foto anterior: ${cleanupError.message}`;
            }
            updateProfileHeader();
            showNotice(cleanupWarning || "Perfil atualizado.", Boolean(cleanupWarning));
            render();
        } catch (error) {
            showNotice(error.message || "Não foi possível atualizar o perfil.", true);
        } finally {
            submit.disabled = false;
        }
    }
});

async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) showNotice(error.message, true);
    else window.location.assign("index.html");
}

document.querySelector("#sign-out").addEventListener("click", signOut);
document.querySelector("#sign-out-top").addEventListener("click", signOut);

document.addEventListener("error", event => {
    if (event.target instanceof HTMLImageElement && event.target.classList.contains("imagem-perfil")) {
        event.target.remove();
    }
}, true);

dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
});

async function start() {
    try {
        supabase = exigirSupabase();
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) {
            window.location.replace("index.html");
            return;
        }
        user = session.user;
        const { data, error } = await supabase.from("profiles")
            .select("id, role, full_name, shop_name, bio, avatar_path").eq("id", user.id).single();
        if (error) throw error;
        profile = data;
        updateProfileHeader();
        document.querySelector("#today-date").textContent = new Intl.DateTimeFormat("pt-BR", {
            weekday: "long", day: "2-digit", month: "long", year: "numeric"
        }).format(new Date()).toLocaleUpperCase("pt-BR");
        document.querySelector("#role-label").textContent = isBarber() ? "PAINEL DO BARBEIRO" : "ÁREA DO CLIENTE";
        view = isBarber() ? "overview" : "feed";
        await loadView(view);
    } catch (error) {
        renderError(error);
    }
}

start();
