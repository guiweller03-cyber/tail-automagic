// A loja é validada pelo servidor. Este identificador serve somente para separar
// preferências locais; nunca concede acesso a dados ou credenciais.
function chave(key: string): string {
  const loja = window.sessionStorage.getItem("crm_loja") === "loja2" ? "loja2" : "loja1";
  return `crm:${loja}:${key}`;
}

export const lojaStorage = {
  getItem(key: string): string | null {
    return window.localStorage.getItem(chave(key)) ??
      (window.sessionStorage.getItem("crm_loja") === "loja2" ? null : window.localStorage.getItem(key));
  },
  setItem(key: string, value: string): void { window.localStorage.setItem(chave(key), value); },
  removeItem(key: string): void {
    window.localStorage.removeItem(chave(key));
    if (window.sessionStorage.getItem("crm_loja") !== "loja2") window.localStorage.removeItem(key);
  },
};
