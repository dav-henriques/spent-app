/**
 * Navegação entre telas usando o hash da URL (#/historico, #/analise…).
 *
 * O hash funciona no GitHub Pages sem nenhuma configuração de servidor,
 * mantém o botão "voltar" do navegador coerente e nunca recarrega a página.
 */
import { APP_NAME } from './config.js';

const ROUTES = {
  '': 'home',
  inicio: 'home',
  historico: 'history',
  analise: 'analysis',
  ajustes: 'settings',
};

const TITLES = { home: '', history: 'Histórico', analysis: 'Análise', settings: 'Ajustes' };

export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { name: ROUTES[path] ?? 'home', params: new URLSearchParams(query) };
}

/** views: { home, history, analysis, settings } — cada uma com { el, show(params), render() }. */
export function createRouter(views) {
  let current = null;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  function handle() {
    const { name, params } = parseHash(window.location.hash);
    const isFirstRender = current === null;
    const changed = name !== current;
    for (const [key, view] of Object.entries(views)) view.el.hidden = key !== name;
    current = name;
    views[name].show(params);

    for (const link of document.querySelectorAll('[data-route]')) {
      if (link.dataset.route === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    document.title = TITLES[name] ? `${TITLES[name]} · ${APP_NAME}` : APP_NAME;

    if (changed && !isFirstRender) {
      window.scrollTo(0, 0);
      // Leva o foco ao título da tela (útil para teclado e leitores de tela).
      views[name].el.querySelector('h1')?.focus({ preventScroll: true });
    }
  }

  window.addEventListener('hashchange', handle);
  handle();

  return {
    get current() {
      return current;
    },
    renderCurrent() {
      views[current]?.render();
    },
  };
}
