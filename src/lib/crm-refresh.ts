export const CRM_RELOAD_EVENT = "crm:reload";

export function dispatchCrmReload() {
  window.dispatchEvent(new CustomEvent(CRM_RELOAD_EVENT));
}

export function onCrmReload(callback: () => void) {
  window.addEventListener(CRM_RELOAD_EVENT, callback);

  return () => {
    window.removeEventListener(CRM_RELOAD_EVENT, callback);
  };
}
