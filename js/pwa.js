/**
 * Recursos de PWA: registro do service worker e ciclo de atualização.
 *
 * Uma nova versão é baixada em segundo plano e fica "aguardando". O app avisa
 * o usuário, que decide quando recarregar — assim uma atualização nunca
 * interrompe um cadastro em andamento nem mistura arquivos de versões
 * diferentes na mesma página.
 */
import { showToast } from './ui.js';

let waitingWorker = null;
let updateRequested = false;
const listeners = new Set();

export const getUpdateState = () => (waitingWorker ? 'waiting' : 'none');
export const onUpdateStateChange = (fn) => listeners.add(fn);

function setWaiting(worker) {
  waitingWorker = worker;
  listeners.forEach((fn) => fn());
  showToast('Nova versão disponível', { actionLabel: 'Atualizar', onAction: applyUpdate, duration: 10_000 });
}

export function applyUpdate() {
  if (!waitingWorker) return;
  updateRequested = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  // Quando a nova versão assume o controle, recarrega para usar só arquivos dela.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) window.location.reload();
  });

  const register = async () => {
    try {
      // Caminho relativo: funciona na raiz do domínio e em subpastas do GitHub Pages.
      const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
      if (registration.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker);
        });
      });
      // Apps instalados no iPhone podem ficar dias abertos: verifica atualizações ao voltar para o app.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
    } catch (error) {
      console.warn('Service worker não registrado:', error);
    }
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });

  // Pede ao navegador que não apague os dados locais por falta de espaço (quando suportado).
  navigator.storage?.persist?.().catch(() => {});
}
