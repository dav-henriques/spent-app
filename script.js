/**
 * Ponto de entrada do app: carrega os dados, monta as telas, liga a
 * navegação e trata as ações globais (adicionar/editar despesa e navegar
 * entre períodos).
 *
 * Organização do código (pasta js/):
 *   config.js        nome do app, categorias padrão, paleta, limites
 *   dates.js         datas locais, limites de períodos, formatação pt-BR
 *   money.js         valores em centavos: leitura e formatação
 *   model.js         validação, normalização e migração dos dados
 *   storage.js       leitura/gravação no localStorage
 *   store.js         estado do app e operações sobre os dados
 *   calc.js          cálculos (totais, categorias, comparações…)
 *   charts.js        gráficos SVG
 *   ui.js            componentes: painel inferior, toast, confirmações
 *   expense-form.js  formulário de despesa (criar e editar)
 *   backup.js        exportação JSON/CSV e restauração
 *   router.js        navegação entre telas
 *   pwa.js           service worker e atualizações
 *   views/           telas: início, histórico, análise, ajustes
 */
import { APP_NAME } from './js/config.js';
import * as store from './js/store.js';
import { todayISO } from './js/dates.js';
import { createRouter } from './js/router.js';
import { initUI, isSheetOpen, showToast } from './js/ui.js';
import { openExpenseForm } from './js/expense-form.js';
import { registerServiceWorker, onUpdateStateChange } from './js/pwa.js';
import { createHomeView } from './js/views/home.js';
import { createHistoryView } from './js/views/history.js';
import { createAnalysisView } from './js/views/analysis.js';
import { createSettingsView } from './js/views/settings.js';

store.init();
initUI();

document.querySelectorAll('[data-app-name]').forEach((el) => { el.textContent = APP_NAME; });
document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', APP_NAME);

const views = {
  home: createHomeView(document.getElementById('view-home')),
  history: createHistoryView(document.getElementById('view-history')),
  analysis: createAnalysisView(document.getElementById('view-analysis')),
  settings: createSettingsView(document.getElementById('view-settings')),
};
const router = createRouter(views);

// Qualquer mudança nos dados ou no período atualiza a tela visível na hora.
store.subscribe(() => router.renderCurrent());
onUpdateStateChange(() => router.renderCurrent());

/* ------------------------------------------------------------------ ações */

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el || el.disabled) return;
  switch (el.dataset.action) {
    case 'add-expense':
      openExpenseForm();
      break;
    case 'edit-expense': {
      const expense = store.getExpense(el.dataset.id);
      if (expense) openExpenseForm({ expense });
      break;
    }
    case 'period-mode':
      store.setPeriod({ mode: el.dataset.mode });
      break;
    case 'period-prev':
      store.shiftPeriod(-1);
      break;
    case 'period-next':
      store.shiftPeriod(1);
      break;
    case 'period-today':
      store.goToToday();
      break;
    case 'open-month':
      store.setPeriod({ mode: 'month', anchor: el.dataset.anchor });
      break;
    case 'timeline-select':
      store.setPeriod({ anchor: el.dataset.anchor });
      break;
    default:
      break;
  }
});

/* -------------------------------------------------------------- teclado */

const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  if (isSheetOpen() || isTyping(document.activeElement)) return;
  if (event.key === 'n' || event.key === 'N') {
    event.preventDefault();
    openExpenseForm();
  } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && ['home', 'analysis'].includes(router.current)) {
    event.preventDefault();
    store.shiftPeriod(event.key === 'ArrowLeft' ? -1 : 1);
  }
});

/* ------------------------------------------------------- virada do dia */

// Se o app ficar aberto de um dia para o outro, "hoje" acompanha a data real.
let knownToday = todayISO();
function checkDayChange() {
  const now = todayISO();
  if (now === knownToday) return;
  const followingToday = store.getPeriod().anchor === knownToday;
  knownToday = now;
  if (followingToday) store.goToToday();
  else router.renderCurrent();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkDayChange();
});
setInterval(checkDayChange, 60_000);

/* ------------------------------------------------- avisos de inicialização */

const issues = store.getIssues();
if (issues.includes('unavailable')) {
  showToast('Este navegador não permite salvar dados. Os registros serão perdidos ao fechar.', { duration: 8000 });
} else if (issues.some((issue) => ['corrupted', 'invalid-records', 'migration'].includes(issue))) {
  showToast('Alguns dados não puderam ser lidos. Uma cópia foi guardada em Ajustes.', {
    actionLabel: 'Ver',
    duration: 8000,
    onAction: () => { window.location.hash = '#/ajustes'; },
  });
}

registerServiceWorker();
