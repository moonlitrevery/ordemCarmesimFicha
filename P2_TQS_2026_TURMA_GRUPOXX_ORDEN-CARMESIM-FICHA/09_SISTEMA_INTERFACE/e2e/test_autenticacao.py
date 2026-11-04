"""End-to-end tests for the authentication flows of Ordem Carmesim.

Covers: sign-up, login (valid/invalid credentials), logout and access
control on a protected route. Run with:

    pytest tests/e2e/test_autenticacao.py -v

See tests/e2e/README.md for environment setup (env vars, Supabase test
project, dev server).
"""

import re

from playwright.sync_api import Page, expect

INVALID_LOGIN_MESSAGE = "E-mail ou senha inválidos."
# O middleware redireciona para /login?next=<rota>, então a query string é opcional.
LOGIN_URL = re.compile(r"/login(\?.*)?$")
# Navegação pós-submit depende de Supabase + Next (cold start na Vercel).
NAV_TIMEOUT = 15_000


def goto_login(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/login")
    expect(page.get_by_role("heading", name="Entrar")).to_be_visible()


def goto_signup(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/cadastro")
    expect(page.get_by_role("heading", name="Criar conta")).to_be_visible()


def submit_login(page: Page, email: str, password: str) -> None:
    page.get_by_label("E-mail").fill(email)
    page.get_by_label("Senha").fill(password)
    page.get_by_role("button", name="Entrar").click()


def submit_signup(page: Page, display_name: str, email: str, password: str) -> None:
    page.get_by_label("Nome de exibição").fill(display_name)
    page.get_by_label("E-mail").fill(email)
    page.get_by_label("Senha").fill(password)
    page.get_by_role("button", name="Cadastrar").click()


def test_cadastro_com_dados_validos_autentica_o_usuario(page: Page, base_url, new_signup):
    goto_signup(page, base_url)
    submit_signup(
        page,
        new_signup["display_name"],
        new_signup["email"],
        new_signup["password"],
    )

    expect(page).to_have_url(f"{base_url}/fichas", timeout=NAV_TIMEOUT)
    expect(page.get_by_role("heading", name="Fichas")).to_be_visible()
    expect(page.get_by_role("button", name="Sair")).to_be_visible()


def test_login_com_credenciais_validas(page: Page, base_url, test_user):
    goto_login(page, base_url)
    submit_login(page, test_user["email"], test_user["password"])

    expect(page).to_have_url(f"{base_url}/fichas", timeout=NAV_TIMEOUT)
    expect(page.get_by_role("heading", name="Fichas")).to_be_visible()


def test_login_com_senha_incorreta_mostra_erro(page: Page, base_url, test_user):
    goto_login(page, base_url)
    submit_login(page, test_user["email"], "senha-errada-123")

    expect(page.get_by_text(INVALID_LOGIN_MESSAGE)).to_be_visible()
    expect(page).to_have_url(f"{base_url}/login")


def test_login_com_email_nao_cadastrado_mostra_erro(page: Page, base_url):
    goto_login(page, base_url)
    submit_login(page, "usuario.inexistente@example.com", "qualquer-senha")

    expect(page.get_by_text(INVALID_LOGIN_MESSAGE)).to_be_visible()
    expect(page).to_have_url(f"{base_url}/login")


def test_logout_encerra_a_sessao_e_redireciona_para_login(page: Page, base_url, test_user):
    goto_login(page, base_url)
    submit_login(page, test_user["email"], test_user["password"])
    expect(page).to_have_url(f"{base_url}/fichas", timeout=NAV_TIMEOUT)

    page.get_by_role("button", name="Sair").click()
    expect(page).to_have_url(LOGIN_URL, timeout=NAV_TIMEOUT)

    # Sessão realmente encerrada: rota protegida volta a exigir login.
    page.goto(f"{base_url}/fichas")
    expect(page).to_have_url(LOGIN_URL)


def test_acesso_a_rota_protegida_sem_sessao_redireciona_para_login(page: Page, base_url):
    page.context.clear_cookies()
    page.goto(f"{base_url}/fichas")

    expect(page).to_have_url(LOGIN_URL)
