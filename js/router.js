/**
 * Navegação entre telas usando o hash da URL (#/historico, #/analise…).
 *
 * O hash funciona no GitHub Pages sem nenhuma configuração de servidor,
 * mantém o botão "voltar" do navegador coerente e nunca recarrega a página.
 * Quando o navegador oferece a View Transitions API, a troca de tela é
 * animada: o conteúdo desliza na direção da aba escolhida enquanto a barra
 * de abas permanece no lugar.
 */
import { APP_NAME } from './config.js';
import { prefersReducedMotion } from './ui.js';
import { bindView, setTopbar } from './atmosphere.js';

const ROUTES = {
  '': 'home',
  inicio: 'home',
  historico: 'history',
  analise: 'analysis',
  ajustes: 'settings',
};

const ORDER = ['home', 'history', 'analysis', 'settings'];
const TITLES = { home: '', history: 'Histórico', analysis: 'Análise', settings: 'Ajustes' };

export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { name: ROUTES[path] ?? 'home', params: new URLSearchParams(query) };
}

/** views: { home, history, analysis, settings } — cada uma com { el, show(params), render(), topbar?() }. */
export function createRouter(views) {
  let current = null;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  function updateTopbar() {
    const custom = views[current].topbar?.();
    setTopbar(custom?.title || TITLES[current] || APP_NAME, custom?.detail || '');
  }

  function apply(name, params) {
    const isFirstRender = current === null;
    const changed = name !== current;
    for (const [key, view] of Object.entries(views)) view.el.hidden = key !== name;
    current = name;
    if (changed) {
      window.scrollTo(0, 0);
      document.documentElement.classList.remove('is-scrolled');
    }
    views[name].show(params);
    bindView(views[name].el);
    updateTopbar();

    for (const link of document.querySelectorAll('[data-route]')) {
      if (link.dataset.route === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    document.querySelector('.tabbar')?.style.setProperty('--tab-index', ORDER.indexOf(name));
    document.title = TITLES[name] ? `${TITLES[name]} · ${APP_NAME}` : APP_NAME;

    if (changed && !isFirstRender) {
      // Leva o foco ao título da tela (útil para teclado e leitores de tela).
      views[name].el.querySelector('h1')?.focus({ preventScroll: true });
    }
  }

  function handle() {
    const { name, params } = parseHash(window.location.hash);
    const switching = current !== null && name !== current;
    if (!switching || !document.startViewTransition || prefersReducedMotion()) {
      apply(name, params);
      return;
    }
    // Direção do deslize: para a direita ao avançar nas abas, para a esquerda ao voltar.
    const forward = ORDER.indexOf(name) > ORDER.indexOf(current);
    document.documentElement.dataset.navDirection = forward ? 'forward' : 'back';
    const transition = document.startViewTransition(() => apply(name, params));
    transition.finished.finally(() => { delete document.documentElement.dataset.navDirection; });
  }

  window.addEventListener('hashchange', handle);
  handle();

  return {
    get current() {
      return current;
    },
    renderCurrent() {
      views[current]?.render();
      updateTopbar();
    },
  };
}
