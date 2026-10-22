import { exigirSupabase } from "./supabase-client.js";

const form = document.querySelector("#formulario-acesso");
const roleTabs = [...document.querySelectorAll("[data-role]")];
const status = document.querySelector("#status-acesso");
const nameInput = document.querySelector("#full-name");
const shopInput = document.querySelector("#shop-name");
const passwordInput = document.querySelector("#password");
const submitButton = document.querySelector("#botao-acesso");
let selectedRole = "barber";
let mode = "login";

function showStatus(message, isError = false) {
    status.textContent = message;
    status.hidden = false;
    status.classList.toggle("status-erro", isError);
}

function setMode(nextMode) {
    mode = nextMode;
    const signup = mode === "signup";
    const recovery = mode === "recovery";
    document.querySelector("#modo-entrar").classList.toggle("modo-acesso-ativo", !signup);
    document.querySelector("#modo-criar").classList.toggle("modo-acesso-ativo", signup);
    document.querySelector(".tipo-acesso").hidden = recovery || !signup;
    document.querySelector(".modo-acesso").hidden = recovery;
    document.querySelector("#campo-nome").hidden = !signup;
    document.querySelector("#campo-barbearia").hidden = !signup || selectedRole !== "barber";
    nameInput.required = signup;
    shopInput.required = signup && selectedRole === "barber";
    passwordInput.autocomplete = signup || recovery ? "new-password" : "current-password";
    passwordInput.required = true;
    passwordInput.disabled = false;
    form.elements.email.disabled = recovery;
    form.elements.email.required = !recovery;
    document.querySelector("#opcoes-login").hidden = signup || recovery;
    document.querySelector("#botao-acesso span:first-child").textContent = signup
        ? "Criar minha conta"
        : recovery ? "Salvar nova senha" : "Entrar no Corte Mais";
    document.querySelector("#titulo-acesso").innerHTML = recovery
        ? "Crie uma<br><span>nova senha.</span>"
        : signup
        ? "Faça parte,<br><span>do seu jeito.</span>"
        : "Sua rotina,<br><span>no seu ritmo.</span>";
    document.querySelector("#descricao-acesso").textContent = signup
        ? selectedRole === "barber"
            ? "Crie seu perfil profissional e comece a divulgar seus serviços."
            : "Crie sua conta para acompanhar barbeiros, interagir e agendar."
        : recovery
            ? "Escolha uma nova senha para voltar a acessar sua conta."
            : "Entre para encontrar barbeiros, acompanhar novidades e organizar seus horários.";
    document.querySelector('label[for="password"]').textContent = recovery ? "Nova senha" : "Senha";
    passwordInput.placeholder = recovery ? "Digite sua nova senha" : "Mínimo de 8 caracteres";
    status.hidden = true;
}

roleTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        selectedRole = tab.dataset.role;
        roleTabs.forEach(option => {
            const selected = option === tab;
            option.classList.toggle("ativo", selected);
            option.setAttribute("aria-selected", String(selected));
        });
        setMode(mode);
    });
});

document.querySelector("#modo-entrar").addEventListener("click", () => setMode("login"));
document.querySelector("#modo-criar").addEventListener("click", () => setMode("signup"));

form.addEventListener("submit", async event => {
    event.preventDefault();
    status.hidden = true;
    submitButton.disabled = true;

    try {
        const client = exigirSupabase();
        const email = form.elements.email.value.trim();
        const password = form.elements.password.value;

        if (mode === "recovery") {
            const { error } = await client.auth.updateUser({ password });
            if (error) throw error;
            window.history.replaceState({}, "", window.location.pathname);
            setMode("login");
            showStatus("Senha atualizada. Agora você já pode entrar com a nova senha.");
            return;
        }

        if (mode === "signup") {
            const { data, error } = await client.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        role: selectedRole,
                        full_name: nameInput.value.trim(),
                        shop_name: selectedRole === "barber" ? shopInput.value.trim() : null
                    }
                }
            });
            if (error) throw error;
            if (!data.session) {
                showStatus("Conta criada. Confirme seu e-mail pelo link enviado para concluir o cadastro.");
                return;
            }
        } else {
            const { error } = await client.auth.signInWithPassword({ email, password });
            if (error) throw error;
        }
        window.location.assign("home.html");
    } catch (error) {
        showStatus(error.message || "Não foi possível concluir o acesso. Tente novamente.", true);
    } finally {
        submitButton.disabled = false;
    }
});

document.querySelector("#recuperar-senha").addEventListener("click", async () => {
    const email = form.elements.email.value.trim();
    if (!email) {
        showStatus("Informe seu e-mail para receber o link de recuperação.", true);
        form.elements.email.focus();
        return;
    }
    try {
        const client = exigirSupabase();
        const { error } = await client.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}${window.location.pathname}?reset=1`
        });
        if (error) throw error;
        showStatus("Se houver uma conta com esse e-mail, enviaremos as instruções de recuperação.");
    } catch (error) {
        showStatus(error.message || "Não foi possível enviar o e-mail de recuperação.", true);
    }
});

if (new URLSearchParams(window.location.search).has("reset")) {
    setMode("recovery");
} else {
    setMode("login");
    try {
        exigirSupabase().auth.getSession().then(({ data, error }) => {
            if (error) throw error;
            if (data.session) window.location.replace("home.html");
        }).catch(error => showStatus(error.message, true));
    } catch (error) {
        showStatus(error.message, true);
    }
}
