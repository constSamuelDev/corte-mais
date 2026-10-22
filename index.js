import { exigirSupabase } from "./supabase-client.js";

const form = document.querySelector("#formulario-acesso");
const roleTabs = [...document.querySelectorAll("[data-role]")];
const status = document.querySelector("#status-acesso");
const nameInput = document.querySelector("#full-name");
const shopInput = document.querySelector("#shop-name");
const passwordInput = document.querySelector("#password");
const submitButton = document.querySelector("#botao-acesso");
const resendConfirmationButton = document.querySelector("#reenviar-confirmacao");
let selectedRole = "barber";
let mode = "login";
let confirmationExpired = false;

function authRedirectUrl() {
    return `${window.location.origin}${window.location.pathname}`;
}

function showStatus(message, isError = false) {
    status.textContent = message;
    status.hidden = false;
    status.classList.toggle("status-erro", isError);
}

function formatAuthError(error) {
    const rawMessage = error && (error.message || error.error_description || error.details || error.code || "");
    const normalized = String(rawMessage).toLowerCase();

    if (normalized.includes("rate limit exceeded") || normalized.includes("too many requests") || normalized.includes("email rate limit")) {
        return "Muitas tentativas foram feitas para este e-mail. Aguarde alguns minutos e tente novamente.";
    }

    if (normalized.includes("invalid login credentials") || normalized.includes("user not found") || normalized.includes("invalid_credentials")) {
        return "E-mail ou senha inválidos.";
    }

    if (normalized.includes("email not confirmed") || normalized.includes("not confirmed")) {
        return "Confirme seu e-mail antes de continuar.";
    }

    if (normalized.includes("invalid email") || normalized.includes("email is invalid") || normalized.includes("not an email")) {
        return "Informe um e-mail válido.";
    }

    if (normalized.includes("already registered") || normalized.includes("user already registered") || normalized.includes("already exists")) {
        return "Este e-mail já está cadastrado. Tente entrar ou recuperar sua senha.";
    }

    return rawMessage || "Não foi possível concluir o acesso. Tente novamente.";
}

function setMode(nextMode) {
    mode = nextMode;
    const signup = mode === "signup";
    const recovery = mode === "recovery";
    resendConfirmationButton.hidden = !signup && !confirmationExpired;
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
                    emailRedirectTo: authRedirectUrl(),
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
        showStatus(formatAuthError(error), true);
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
            redirectTo: `${authRedirectUrl()}?reset=1`
        });
        if (error) throw error;
        showStatus("Se houver uma conta com esse e-mail, enviaremos as instruções de recuperação.");
    } catch (error) {
        showStatus(formatAuthError(error) || "Não foi possível enviar o e-mail de recuperação.", true);
    }
});

resendConfirmationButton.addEventListener("click", async () => {
    const email = form.elements.email.value.trim();
    if (!email) {
        showStatus("Informe seu e-mail para reenviar a confirmação.", true);
        form.elements.email.focus();
        return;
    }
    resendConfirmationButton.disabled = true;
    try {
        const client = exigirSupabase();
        const { error } = await client.auth.resend({
            type: "signup",
            email,
            options: { emailRedirectTo: authRedirectUrl() }
        });
        if (error) throw error;
        showStatus("Se a conta ainda precisar de confirmação, enviaremos um novo link para esse e-mail.");
        resendConfirmationButton.hidden = true;
    } catch (error) {
        showStatus(formatAuthError(error) || "Não foi possível reenviar a confirmação.", true);
    } finally {
        resendConfirmationButton.disabled = false;
    }
});

const authError = new URLSearchParams(window.location.hash.slice(1));
if (authError.get("error_code") === "otp_expired" || authError.get("error") === "access_denied") {
    const expiredConfirmation = authError.get("error_code") === "otp_expired";
    window.history.replaceState({}, "", window.location.pathname);
    confirmationExpired = expiredConfirmation;
    setMode("login");
    if (expiredConfirmation) {
        showStatus("Esse link de confirmação expirou ou já foi usado. Informe seu e-mail e solicite um novo link.", true);
        resendConfirmationButton.hidden = false;
    } else {
        showStatus("Não foi possível confirmar este acesso. Solicite um novo link de confirmação.", true);
    }
} else if (new URLSearchParams(window.location.search).has("reset")) {
    setMode("recovery");
} else {
    setMode("login");
    try {
        exigirSupabase().auth.getSession().then(({ data, error }) => {
            if (error) throw error;
            if (data.session) window.location.replace("home.html");
        }).catch(error => showStatus(formatAuthError(error), true));
    } catch (error) {
        showStatus(formatAuthError(error), true);
    }
}
