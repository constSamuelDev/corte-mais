const formularioLogin = document.querySelector(".formulario-login");
const credenciaisDemo = document.querySelectorAll(".acesso-demonstracao strong");
const campoEmail = formularioLogin.querySelector("#email");
const campoSenha = formularioLogin.querySelector("#password");
const erroLogin = document.querySelector("#erro-login");

formularioLogin.addEventListener("submit", evento => {
    evento.preventDefault();

    const emailValido = campoEmail.value.trim().toLocaleLowerCase("pt-BR") === credenciaisDemo[0].textContent.trim().toLocaleLowerCase("pt-BR");
    const senhaValida = campoSenha.value === credenciaisDemo[1].textContent.trim();

    if (emailValido && senhaValida) {
        window.location.href = "home.html";
        return;
    }

    erroLogin.textContent = "E-mail ou senha inválidos. Confira os dados de demonstração.";
    erroLogin.hidden = false;
    campoEmail.setAttribute("aria-invalid", String(!emailValido));
    campoSenha.setAttribute("aria-invalid", String(!senhaValida));
});

for (const campo of [campoEmail, campoSenha]) {
    campo.addEventListener("input", () => {
        erroLogin.hidden = true;
        campoEmail.removeAttribute("aria-invalid");
        campoSenha.removeAttribute("aria-invalid");
    });
}