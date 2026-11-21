// Converte erros do Supabase / da rede em mensagens amigáveis.
// As mensagens devolvidas são chaves em português, traduzidas por `t()` (src/i18n).

type AnyError = {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  name?: unknown;
} | null | undefined;

const text = (v: unknown) => (typeof v === "string" ? v : "");

/** Relógio do servidor de login à frente do servidor do banco ("JWT issued at future"). */
export const isClockSkewMessage = (message: string) => /issued at future|iat.*future|token.*not yet valid/i.test(message);

export const isNetworkError = (err: unknown) => {
  const e = err as AnyError;
  const msg = text(e?.message);
  const name = text(e?.name);
  return (
    name === "AuthRetryableFetchError" ||
    /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg) ||
    (typeof navigator !== "undefined" && navigator.onLine === false)
  );
};

/** Login recusado por e-mail ou senha errados (e não por rede, limite etc.). */
export const isInvalidCredentials = (err: unknown) => {
  const e = err as AnyError;
  return text(e?.code) === "invalid_credentials" || /invalid login credentials/i.test(text(e?.message));
};

export function friendlyError(err: unknown, fallback = "Algo deu errado. Tente novamente."): string {
  if (!err) return fallback;
  if (isNetworkError(err)) return "Sem conexão com a internet. Verifique e tente novamente.";

  const e = err as AnyError;
  const code = text(e?.code);
  const msg = text(e?.message);
  const status = typeof e?.status === "number" ? e.status : 0;

  if (isClockSkewMessage(msg)) return "O relógio do servidor está fora de sincronia. Tente novamente em instantes.";

  switch (code) {
    // Supabase Auth
    case "invalid_credentials": return "E-mail ou senha incorretos.";
    case "email_not_confirmed": return "Confirme seu e-mail antes de entrar.";
    case "user_already_exists":
    case "email_exists": return "Já existe uma conta com este e-mail.";
    case "weak_password": return "Senha muito fraca. Use pelo menos 6 caracteres.";
    case "same_password": return "A nova senha deve ser diferente da atual.";
    case "email_address_invalid":
    case "validation_failed": return "Verifique os dados informados.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
    case "over_sms_send_rate_limit": return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
    case "session_not_found":
    case "session_expired":
    case "refresh_token_not_found":
    case "refresh_token_already_used":
    case "bad_jwt":
    // PostgREST
    case "PGRST301":
    case "PGRST302":
    case "PGRST303": return "Sua sessão expirou. Entre novamente.";
    case "42501": return "Você não tem permissão para fazer isso.";
    case "23505": return "Esse registro já existe.";
    case "23503": return "Esse item está em uso e não pode ser alterado.";
    case "23514":
    case "22P02":
    case "22003": return "Verifique os dados informados.";
  }

  if (/jwt expired|invalid jwt|session.*(missing|expired)/i.test(msg)) return "Sua sessão expirou. Entre novamente.";
  if (/rate limit|too many requests/i.test(msg) || status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (status >= 500) return "O servidor está indisponível no momento. Tente novamente em instantes.";

  return fallback;
}

/**
 * fetch usado pelo cliente do Supabase: quando o servidor recusa o token por
 * diferença de relógio ("JWT issued at future"), espera um pouco e repete a
 * requisição sozinho — normalmente passa na segunda tentativa.
 */
export function createRetryingFetch(baseFetch: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  const delays = [1000, 2000];
  return async (input, init) => {
    let response = await baseFetch(input, init);
    for (const delay of delays) {
      if (response.status !== 401 && response.status !== 403) break;
      let body = "";
      try { body = await response.clone().text(); } catch { break; }
      if (!isClockSkewMessage(body)) break;
      await new Promise(resolve => setTimeout(resolve, delay));
      response = await baseFetch(input, init);
    }
    return response;
  };
}
