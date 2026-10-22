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
let commentsByPost = {};

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
const usableImage = value => {
    if (!value) return "";
    try {
        const url = new URL(value);
        return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch {
        return "";
    }
};

function showNotice(message, isError = false) {
    notice.textContent = message;
    notice.classList.add("visible");
    notice.style.background = isError ? "#9c3e32" : "";
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(() => notice.classList.remove("visible"), 3500);
}

function renderError(error) {
    console.error(error);
    main.innerHTML = `<div class="error-state"><strong>Não foi possível carregar esta página.</strong><p>${safe(error.message || "Verifique a conexão e a configuração do Supabase.")}</p><button class="button" data-action="reload" type="button">Tentar novamente</button></div>`;
}

function navigation() {
    const pages = isBarber()
        ? [["posts", "Conteúdo"], ["services", "Serviços"], ["bookings", "Agenda"], ["profile", "Meu perfil"]]
        : [["feed", "Feed"], ["bookings", "Meus agendamentos"], ["profile", "Meu perfil"]];
    nav.innerHTML = pages.map(([id, label]) =>
        `<button class="nav-button ${view === id ? "active" : ""}" data-view="${id}" type="button" ${view === id ? 'aria-current="page"' : ""}>${label}</button>`
    ).join("");
}

function pageHeading(eyebrow, title, description, action = "") {
    return `<header class="page-heading"><div><span class="eyebrow">${safe(eyebrow)}</span><h1>${safe(title)}</h1><p>${safe(description)}</p></div>${action}</header>`;
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
    return `<div class="field ${options.full ? "field-full" : ""}"><label for="${id}">${safe(label)}</label><input id="${id}" name="${safe(name)}" type="${safe(type)}" ${value} ${placeholder} ${min} ${max} ${maxLength} ${step} ${required}></div>`;
}

function render() {
    navigation();
    if (view === "feed") renderFeed();
    else if (view === "posts") renderPosts();
    else if (view === "services") renderServices();
    else if (view === "bookings") renderBookings();
    else renderProfile();
}

async function loadView(nextView) {
    view = nextView;
    main.innerHTML = '<p class="loading-state">Carregando...</p>';
    try {
        if (view === "feed") await loadFeed();
        if (view === "posts") await loadPosts();
        if (view === "services") await loadServices(true);
        if (view === "bookings") await loadBookings();
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

function renderFeed() {
    const serviceCards = services.length ? `<section><div class="card-header"><div><span class="eyebrow">ENCONTRE SEU PRÓXIMO CORTE</span><h2>Serviços</h2></div></div><div class="grid-cards">${services.map(service => `<article class="card"><span class="eyebrow">${safe(service.barber?.shop_name || service.barber?.full_name || "Barbearia")}</span><h3>${safe(service.name)}</h3><p class="muted">${safe(service.description || "Serviço disponível para agendamento.")}</p><p class="muted">${safe(service.duration_minutes)} min</p><strong class="price">${money(service.price)}</strong><div class="feed-actions"><button class="button button-primary" type="button" data-action="book" data-id="${safe(service.id)}">Agendar</button></div></article>`).join("")}</div></section>` : '<p class="empty-state">Ainda não há serviços publicados. Volte em breve para conhecer as barbearias.</p>';
    const postCards = posts.length ? posts.map(post => {
        const image = usableImage(post.image_url);
        const comments = commentsByPost[post.id];
        return `<article class="card feed-card"><div class="card-header"><div><span class="eyebrow">${safe(post.shop_name || "Barbearia")}</span><h3>${safe(post.barber_name)}</h3></div><time class="muted">${dateTime(post.created_at)}</time></div><p class="feed-copy">${safe(post.body)}</p>${image ? `<img class="feed-image" src="${safe(image)}" alt="Imagem publicada por ${safe(post.barber_name)}" loading="lazy">` : ""}<div class="feed-actions"><button class="button" type="button" data-action="like" data-id="${safe(post.id)}">${post.has_liked ? "♥ Curtido" : "♡ Curtir"} · ${safe(post.likes_count)}</button><button class="button" type="button" data-action="comments" data-id="${safe(post.id)}">Comentários · ${safe(post.comments_count)}</button><button class="button" type="button" data-action="book-barber" data-id="${safe(post.barber_id)}">Ver horários e agendar</button></div>${comments ? `<div class="comments">${comments.map(comment => `<div class="comment-item"><strong>${safe(comment.author_name)}</strong><span>${safe(comment.body)}</span></div>`).join("") || '<p class="muted">Nenhum comentário ainda.</p>'}<form class="inline-form" data-form="comment" data-id="${safe(post.id)}"><input name="body" maxlength="1000" placeholder="Escreva um comentário..." aria-label="Escreva um comentário" required><button class="button" type="submit">Enviar</button></form></div>` : ""}</article>`;
    }).join("") : '<p class="empty-state">Os barbeiros ainda não publicaram novidades.</p>';
    main.innerHTML = `${pageHeading("COMUNIDADE", "Feed dos barbeiros", "Acompanhe as novidades, curta, comente e agende seu próximo atendimento.")}<section><div class="card-header"><div><span class="eyebrow">NOVIDADES</span><h2>Postagens</h2></div></div>${postCards}</section><section>${serviceCards}</section>`;
}

function renderPosts() {
    const action = '<button class="button button-primary" type="button" data-action="new-post">Nova postagem</button>';
    const cards = posts.length ? posts.map(post => {
        const image = usableImage(post.image_url);
        return `<article class="card"><div class="card-header"><div><span class="eyebrow">${safe(post.shop_name || profile.shop_name)}</span><time class="muted">${dateTime(post.created_at)}</time></div><button class="button button-danger" type="button" data-action="delete-post" data-id="${safe(post.id)}">Excluir</button></div><p class="feed-copy">${safe(post.body)}</p>${image ? `<img class="feed-image" src="${safe(image)}" alt="Imagem da postagem" loading="lazy">` : ""}<p class="muted">♥ ${safe(post.likes_count)} curtidas · ${safe(post.comments_count)} comentários</p></article>`;
    }).join("") : '<p class="empty-state">Compartilhe seu primeiro trabalho, novidade ou aviso com os clientes.</p>';
    main.innerHTML = `${pageHeading("CONTEÚDO", "Suas postagens", "Publique novidades para os clientes que acompanham a comunidade.", action)}${cards}`;
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
    }).join("") : '<p class="empty-state">Nenhum agendamento por aqui ainda.</p>';
    main.innerHTML = `${pageHeading(isBarber() ? "ROTINA" : "SUA AGENDA", isBarber() ? "Agenda da barbearia" : "Meus agendamentos", isBarber() ? "Confirme e acompanhe os pedidos de horário dos clientes." : "Consulte o status dos seus próximos atendimentos.")}${cards}`;
}

function renderProfile() {
    const role = isBarber() ? "BARBEIRO" : "CLIENTE";
    main.innerHTML = `${pageHeading("SUA CONTA", "Meu perfil", "Atualize as informações que aparecem na plataforma.")}<form class="card" id="profile-form"><span class="eyebrow">${role}</span>${field("full_name", "Nome", "text", { value: profile.full_name, required: true, max: 100 })}${isBarber() ? field("shop_name", "Nome da barbearia", "text", { value: profile.shop_name, required: true, max: 100 }) + field("bio", "Sobre", "textarea", { value: profile.bio, maxLength: 500, full: true }) : ""}<div class="field"><label>E-mail da conta</label><input type="email" value="${safe(user.email)}" disabled></div><button class="button button-primary" type="submit">Salvar perfil</button></form>`;
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
        if (isBarber()) {
            updates.shop_name = String(values.get("shop_name")).trim();
            updates.bio = String(values.get("bio") || "").trim();
        }
        try {
            const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
            if (error) throw error;
            profile = { ...profile, ...updates };
            document.querySelector("#user-name").textContent = profile.full_name;
            showNotice("Perfil atualizado.");
            render();
        } catch (error) {
            showNotice(error.message || "Não foi possível atualizar o perfil.", true);
        }
    }
});

document.querySelector("#sign-out").addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    if (error) showNotice(error.message, true);
    else window.location.assign("index.html");
});

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
            .select("id, role, full_name, shop_name, bio").eq("id", user.id).single();
        if (error) throw error;
        profile = data;
        document.querySelector("#user-name").textContent = profile.full_name;
        view = isBarber() ? "posts" : "feed";
        await loadView(view);
    } catch (error) {
        renderError(error);
    }
}

start();
