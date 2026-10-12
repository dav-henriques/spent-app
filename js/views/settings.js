/**
 * Ajustes: categorias, dados (privacidade, backup, restauração), informações
 * do app e, separado de tudo, a opção de apagar os dados.
 */
import * as store from '../store.js';
import {
  APP_NAME, APP_VERSION, CATEGORY_PALETTE, CATEGORY_ICONS, FALLBACK_ICON, LIMITS,
} from '../config.js';
import {
  exportJSON, exportCSV, analyzeBackup, applyImport, deliverFile, ImportError,
} from '../backup.js';
import { formatLongDate, timestampToLocalDate, timestampToLocalTime } from '../dates.js';
import {
  esc, icon, colorStyle, categoryIconHTML, openSheet, closeSheet, showToast, confirmTwoStep,
} from '../ui.js';
import { getUpdateState, applyUpdate } from '../pwa.js';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Ícone em quadrado arredondado, como no app Ajustes do iPhone. */
const symbol = (name, variant = '') => `<span class="row-symbol${variant ? ` row-symbol-${variant}` : ''}" aria-hidden="true">${icon(name)}</span>`;

export function createSettingsView(root) {
  root.innerHTML = `
    <header class="page-header">
      <h1 class="large-title" tabindex="-1">Ajustes</h1>
    </header>
    <div class="settings-body"></div>
    <input type="file" class="visually-hidden" id="import-file" accept=".json,application/json" tabindex="-1" aria-hidden="true">`;

  const body = root.querySelector('.settings-body');
  const fileInput = root.querySelector('#import-file');

  root.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-settings]');
    if (!target) return;
    const action = target.dataset.settings;
    switch (action) {
      case 'new-category': openCategoryEditor(null); break;
      case 'edit-category': openCategoryEditor(target.dataset.id); break;
      case 'export-json': await runExport(exportJSON, 'Backup exportado'); break;
      case 'export-csv': await runExport(exportCSV, 'Planilha exportada'); break;
      case 'import':
        fileInput.value = '';
        fileInput.click();
        break;
      case 'erase': openEraseConfirm(); break;
      case 'recovery-download': {
        const raw = localStorage.getItem(target.dataset.key) ?? '';
        await deliverFile(`gastos-recuperacao-${Date.now()}.json`, raw, 'application/json');
        break;
      }
      case 'recovery-discard':
        if (confirmTwoStep(target, 'Confirmar')) {
          store.discardRecoveryEntry(target.dataset.key);
          showToast('Cópia descartada');
        }
        break;
      case 'update': applyUpdate(); break;
      default: break;
    }
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new ImportError('O arquivo é grande demais para ser um backup deste app.');
      const text = await file.text();
      openImportConfirm(file.name, analyzeBackup(text));
    } catch (error) {
      const message = error instanceof ImportError ? error.message : 'Não foi possível ler o arquivo.';
      openSheet({
        title: 'Não foi possível restaurar',
        body: `<p class="sheet-text">${esc(message)}</p><p class="sheet-text muted">Nenhum dado foi alterado.</p>`,
        footer: '<button type="button" class="btn btn-secondary btn-block" data-sheet-close>Entendi</button>',
      });
    }
  });

  async function runExport(fn, message) {
    try {
      const result = await fn();
      if (result !== 'cancelled') showToast(message);
    } catch {
      showToast('Não foi possível exportar.');
    }
  }

  function render() {
    const categories = store.getCategories();
    const counts = store.countByCategory();
    const expenseCount = store.getExpenses().length;
    const recovery = store.listRecoveryEntries();
    const update = getUpdateState();

    const categoryRows = categories.map((c) => `
      <li>
        <button type="button" class="row" data-settings="edit-category" data-id="${esc(c.id)}">
          ${categoryIconHTML(c, 'sm')}
          <span class="row-main">${esc(c.name)}</span>
          <span class="row-detail">${counts.get(c.id) ?? 0}</span>
          ${icon('chevron-right', 'icon-sm row-chevron')}
        </button>
      </li>`).join('');

    const storageWarning = store.isPersistent() ? '' : `
      <p class="notice">Este navegador não permite salvar dados. As despesas serão perdidas ao fechar a página.</p>`;

    const recoveryGroup = recovery.length ? `
      <section class="settings-section" aria-labelledby="st-recovery">
        <h2 class="group-title" id="st-recovery">Cópias de recuperação</h2>
        <p class="section-note">Alguns dados não puderam ser lidos ou foram convertidos. Uma cópia original foi guardada; baixe-a antes de descartar.</p>
        <ul class="card list-inset">${recovery.map((r) => `
          <li class="row row-static">
            <span class="row-main">${esc(describeRecovery(r.key))}<span class="row-sub">${Math.max(1, Math.round(r.size / 1024))} KB</span></span>
            <button type="button" class="btn btn-secondary btn-small" data-settings="recovery-download" data-key="${esc(r.key)}">Baixar</button>
            <button type="button" class="btn btn-danger btn-small" data-settings="recovery-discard" data-key="${esc(r.key)}">Descartar</button>
          </li>`).join('')}
        </ul>
      </section>` : '';

    const installHint = isStandalone() ? '' : `
      <li class="row row-static row-multiline">
        ${symbol('share')}
        <span class="row-main">Instalar na tela de início
          <span class="row-sub">${isIOS()
            ? 'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”. Instalado, o app abre em tela cheia e funciona sem internet.'
            : 'Use a opção “Instalar app” ou “Adicionar à tela inicial” do navegador para abrir em tela cheia e usar sem internet.'}</span>
        </span>
      </li>`;

    body.innerHTML = `
      ${storageWarning}
      <section class="settings-section" aria-labelledby="st-categories">
        <h2 class="group-title" id="st-categories">Categorias</h2>
        <ul class="card list-inset">
          ${categoryRows}
          <li>
            <button type="button" class="row row-action" data-settings="new-category">
              <span class="cat-icon cat-icon-sm cat-icon-add" aria-hidden="true">${icon('plus')}</span>
              <span class="row-main">Nova categoria</span>
            </button>
          </li>
        </ul>
      </section>

      <section class="settings-section" aria-labelledby="st-data">
        <h2 class="group-title" id="st-data">Dados</h2>
        <ul class="card list-inset">
          <li><button type="button" class="row" data-settings="export-json">
            ${symbol('download')}<span class="row-main">Exportar backup<span class="row-sub">Arquivo JSON para restaurar depois</span></span>
          </button></li>
          <li><button type="button" class="row" data-settings="export-csv"${expenseCount ? '' : ' disabled'}>
            ${symbol('table')}<span class="row-main">Exportar planilha<span class="row-sub">CSV para Excel, Numbers ou Planilhas</span></span>
          </button></li>
          <li><button type="button" class="row" data-settings="import">
            ${symbol('upload')}<span class="row-main">Restaurar backup<span class="row-sub">Importar um JSON exportado antes</span></span>
          </button></li>
        </ul>
        <p class="group-footer">${icon('lock', 'icon-xs')} ${plural(expenseCount, 'despesa', 'despesas')} e ${plural(categories.length, 'categoria', 'categorias')} ficam salvas só neste aparelho. Nada é enviado para servidores e não há sincronização entre aparelhos. Limpar os dados do navegador ou remover o app apaga os registros — exporte um backup de vez em quando.</p>
      </section>

      ${recoveryGroup}

      <section class="settings-section" aria-labelledby="st-app">
        <h2 class="group-title" id="st-app">Aplicativo</h2>
        <ul class="card list-inset">
          ${installHint}
          ${update === 'waiting' ? `
            <li><button type="button" class="row" data-settings="update">
              ${symbol('download')}<span class="row-main">Atualização disponível<span class="row-sub">Toque para carregar a nova versão</span></span>
            </button></li>` : ''}
          <li class="row row-static">
            ${symbol('info')}
            <span class="row-main"><span data-app-name>${esc(APP_NAME)}</span></span>
            <span class="row-detail">${esc(APP_VERSION)}</span>
          </li>
        </ul>
      </section>

      <section class="settings-section settings-danger" aria-label="Apagar dados">
        <ul class="card list-inset">
          <li><button type="button" class="row row-danger" data-settings="erase">
            <span class="row-main">Apagar todos os dados</span>
          </button></li>
        </ul>
      </section>`;
  }

  return { el: root, render, show: render };
}

const RECOVERY_LABELS = {
  despesas: 'Despesas ilegíveis',
  categorias: 'Categorias ilegíveis',
  'registros-invalidos': 'Registros inválidos',
};

function describeRecovery(key) {
  const match = /recovery\.(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\.(.+)$/.exec(key);
  if (!match) return 'Cópia guardada';
  const migration = /^antes-da-migracao-v(\d+)$/.exec(match[2]);
  const label = RECOVERY_LABELS[match[2]] ?? (migration ? `Dados anteriores à atualização (v${migration[1]})` : 'Cópia guardada');
  const date = timestampToLocalDate(match[1]);
  return date ? `${label} · ${formatLongDate(date)} às ${timestampToLocalTime(match[1])}` : label;
}

/* ------------------------------------------------------------------------ */
/* Categorias                                                                */
/* ------------------------------------------------------------------------ */

function swatchesHTML(selected) {
  return CATEGORY_PALETTE.map((p) => `
    <button type="button" class="swatch" data-color="${p.color}" style="${colorStyle(p.color)}"
      aria-label="${esc(p.name)}" aria-pressed="${p.color === selected}">${icon('check', 'swatch-check')}</button>`).join('');
}

function iconGridHTML(selected) {
  return CATEGORY_ICONS.map((i) => `
    <button type="button" class="icon-choice" data-icon="${i.id}" aria-label="${esc(i.name)}" aria-pressed="${i.id === selected}">
      <svg aria-hidden="true" focusable="false"><use href="#c-${i.id}"></use></svg>
    </button>`).join('');
}

function openCategoryEditor(id) {
  const category = id ? store.getCategories().find((c) => c.id === id) : null;
  if (id && !category) return;
  const isEdit = Boolean(category);
  let color = isEdit ? category.color : store.suggestCategoryColor();
  let iconId = isEdit ? category.icon : FALLBACK_ICON;
  const usage = isEdit ? store.countByCategory().get(id) ?? 0 : 0;
  const isLast = store.getCategories().length <= 1;

  const body = `
    <form id="category-form" class="category-form" novalidate>
      <div class="cat-preview" style="${colorStyle(color)}">
        <span class="cat-icon cat-icon-xl" aria-hidden="true"><svg focusable="false"><use href="#c-${esc(iconId)}"></use></svg></span>
      </div>
      <div class="form-card">
        <label class="visually-hidden" for="c-name">Nome</label>
        <input class="form-input form-input-center" id="c-name" maxlength="${LIMITS.categoryNameMax}" autocomplete="off"
          autocapitalize="sentences" enterkeyhint="done" value="${isEdit ? esc(category.name) : ''}" placeholder="Nome da categoria">
      </div>
      <p class="field-error" id="c-name-error" hidden></p>

      <fieldset class="form-fieldset">
        <legend class="form-label">Cor</legend>
        <div class="swatches">${swatchesHTML(color)}</div>
      </fieldset>
      <fieldset class="form-fieldset">
        <legend class="form-label">Ícone</legend>
        <div class="icon-grid" style="${colorStyle(color)}">${iconGridHTML(iconId)}</div>
      </fieldset>

      ${isEdit ? `
        <div class="form-danger">
          <button type="button" class="btn btn-danger-plain btn-block" data-delete-category${isLast ? ' disabled' : ''}>
            Excluir categoria
          </button>
          <p class="form-meta">${isLast ? 'É preciso manter ao menos uma categoria.'
            : usage ? `Usada em ${plural(usage, 'despesa', 'despesas')}. Elas serão movidas, nunca apagadas.` : 'Nenhuma despesa usa esta categoria.'}</p>
        </div>` : ''}
    </form>`;
  const footer = `<button type="submit" form="category-form" class="btn btn-primary btn-block" data-save>${isEdit ? 'Salvar' : 'Criar categoria'}</button>`;

  const panel = openSheet({
    title: isEdit ? 'Editar categoria' : 'Nova categoria',
    body,
    footer,
  });
  const form = panel.querySelector('#category-form');
  const nameInput = form.querySelector('#c-name');
  const error = form.querySelector('#c-name-error');
  const saveButton = panel.querySelector('[data-save]');
  const preview = form.querySelector('.cat-preview');
  const grid = form.querySelector('.icon-grid');

  const validate = () => {
    const name = nameInput.value.trim();
    let message = '';
    if (name && store.isCategoryNameTaken(name, id)) message = 'Já existe uma categoria com esse nome.';
    error.textContent = message;
    error.hidden = !message;
    saveButton.disabled = !name || Boolean(message);
  };

  const updatePreview = () => {
    preview.setAttribute('style', colorStyle(color));
    grid.setAttribute('style', colorStyle(color));
    preview.querySelector('use').setAttribute('href', `#c-${iconId}`);
  };

  nameInput.addEventListener('input', validate);
  form.addEventListener('click', (event) => {
    const swatch = event.target.closest('[data-color]');
    if (swatch) {
      color = swatch.dataset.color;
      form.querySelectorAll('[data-color]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.color === color)));
      updatePreview();
      return;
    }
    const choice = event.target.closest('[data-icon]');
    if (choice) {
      iconId = choice.dataset.icon;
      form.querySelectorAll('[data-icon]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.icon === iconId)));
      updatePreview();
      return;
    }
    const del = event.target.closest('[data-delete-category]');
    if (!del) return;
    if (usage > 0) openReassign(category, usage);
    else if (confirmTwoStep(del, 'Toque de novo para excluir')) {
      try {
        store.deleteCategory(id);
        closeSheet();
        showToast('Categoria excluída');
      } catch (err) {
        showToast(err.message);
      }
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    validate();
    if (saveButton.disabled) return;
    try {
      if (isEdit) store.updateCategory(id, { name: nameInput.value, color, icon: iconId });
      else store.addCategory({ name: nameInput.value, color, icon: iconId });
      closeSheet();
      showToast(isEdit ? 'Categoria atualizada' : 'Categoria criada');
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });
  validate();
}

/** Antes de excluir uma categoria em uso, o usuário escolhe para onde mover as despesas. */
function openReassign(category, usage) {
  let target = '';
  const others = store.getCategories().filter((c) => c.id !== category.id);
  const body = `
    <p class="sheet-text">${esc(plural(usage, 'despesa usa', 'despesas usam'))} “${esc(category.name)}”.
      Escolha para qual categoria ${usage === 1 ? 'ela será movida' : 'elas serão movidas'} antes da exclusão. Nenhuma despesa será apagada.</p>
    <div class="chip-wrap">${others.map((c) => `
      <button type="button" class="cat-chip" data-target="${esc(c.id)}" style="${colorStyle(c.color)}" aria-pressed="false">
        <svg class="cat-chip-icon" aria-hidden="true" focusable="false"><use href="#c-${esc(c.icon)}"></use></svg>${esc(c.name)}
      </button>`).join('')}
    </div>`;
  const footer = `
    <div class="btn-row">
      <button type="button" class="btn btn-secondary" data-reassign-cancel>Cancelar</button>
      <button type="button" class="btn btn-danger-solid" data-reassign-confirm disabled>Mover e excluir</button>
    </div>`;
  const panel = openSheet({ title: `Excluir “${category.name}”`, body, footer });
  const confirm = panel.querySelector('[data-reassign-confirm]');
  panel.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-target]');
    if (chip) {
      target = chip.dataset.target;
      panel.querySelectorAll('[data-target]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.target === target)));
      confirm.disabled = false;
      return;
    }
    if (event.target.closest('[data-reassign-cancel]')) {
      openCategoryEditor(category.id);
      return;
    }
    if (event.target.closest('[data-reassign-confirm]') && target) {
      try {
        const destination = store.getCategory(target).name;
        store.deleteCategory(category.id, target);
        closeSheet();
        showToast(`Categoria excluída · despesas movidas para ${destination}`, { duration: 4500 });
      } catch (err) {
        showToast(err.message);
      }
    }
  });
}

/* ------------------------------------------------------------------------ */
/* Importação                                                                */
/* ------------------------------------------------------------------------ */

function openImportConfirm(fileName, analysis) {
  const current = store.snapshot();
  const hasCurrentData = current.expenses.length > 0;
  const { incoming, merge, invalidCount } = analysis;
  const exported = analysis.exportedAt ? timestampToLocalDate(analysis.exportedAt) : null;
  let mode = hasCurrentData ? 'merge' : 'replace';
  let includeDuplicates = false;

  const summary = `
    <div class="import-file card card-pad">
      <p class="import-name">${icon('document', 'icon-sm')} ${esc(fileName)}</p>
      <p class="import-meta">${plural(incoming.expenses.length, 'despesa', 'despesas')} · ${plural(incoming.categories.length, 'categoria', 'categorias')}${exported ? ` · exportado em ${esc(formatLongDate(exported))}` : ''}</p>
      ${invalidCount ? `<p class="import-warning">${plural(invalidCount, 'registro inválido será ignorado', 'registros inválidos serão ignorados')}.</p>` : ''}
    </div>`;

  const mergeDetails = [
    merge.toAdd.length
      ? `Seus dados atuais são mantidos e ${plural(merge.toAdd.length, 'despesa nova é adicionada', 'despesas novas são adicionadas')}.`
      : 'Seus dados atuais são mantidos; não há despesas novas no backup.',
    merge.alreadyPresent ? `${plural(merge.alreadyPresent, 'despesa já existe', 'despesas já existem')} neste aparelho e ${merge.alreadyPresent === 1 ? 'fica como está' : 'ficam como estão'}.` : '',
    merge.newCategories.length ? `${plural(merge.newCategories.length, 'categoria nova', 'categorias novas')}.` : '',
  ].filter(Boolean).join(' ');

  const options = hasCurrentData ? `
    <fieldset class="field">
      <legend class="field-label">Como restaurar?</legend>
      <div class="choice-list">
        <label class="choice">
          <input type="radio" name="import-mode" value="merge" checked>
          <span class="choice-body"><span class="choice-title">Mesclar com os dados atuais</span>
          <span class="choice-text">${esc(mergeDetails)}</span></span>
        </label>
        <label class="choice">
          <input type="radio" name="import-mode" value="replace">
          <span class="choice-body"><span class="choice-title">Substituir tudo</span>
          <span class="choice-text">Apaga as ${plural(current.expenses.length, 'despesa', 'despesas')} e ${plural(current.categories.length, 'categoria', 'categorias')} atuais e usa somente as do backup.</span></span>
        </label>
      </div>
    </fieldset>
    ${merge.duplicates.length ? `
      <label class="check-row" data-dup-row>
        <input type="checkbox" data-include-duplicates>
        <span>${plural(merge.duplicates.length, 'despesa parece duplicada', 'despesas parecem duplicadas')} (mesma data, valor e descrição de uma existente) e ${merge.duplicates.length === 1 ? 'será ignorada' : 'serão ignoradas'}. Marque para importar mesmo assim.</span>
      </label>` : ''}` : `
    <p class="sheet-text">As despesas e categorias do backup serão carregadas neste aparelho.</p>`;

  const footer = `
    <div class="btn-row">
      <button type="button" class="btn btn-secondary" data-sheet-close>Cancelar</button>
      <button type="button" class="btn btn-primary" data-import-confirm>Restaurar</button>
    </div>`;
  const panel = openSheet({ title: 'Restaurar backup', body: `${summary}${options}`, footer });
  const confirm = panel.querySelector('[data-import-confirm]');
  const dupRow = panel.querySelector('[data-dup-row]');

  const syncMode = () => {
    confirm.textContent = mode === 'replace' && hasCurrentData ? 'Substituir dados' : 'Restaurar';
    confirm.classList.toggle('btn-danger-solid', mode === 'replace' && hasCurrentData);
    confirm.classList.toggle('btn-primary', !(mode === 'replace' && hasCurrentData));
    confirm.dataset.armed = 'false';
    if (dupRow) dupRow.hidden = mode !== 'merge';
  };
  panel.addEventListener('change', (event) => {
    if (event.target.name === 'import-mode') {
      mode = event.target.value;
      syncMode();
    }
    if (event.target.matches('[data-include-duplicates]')) includeDuplicates = event.target.checked;
  });
  confirm.addEventListener('click', () => {
    // Substituir apaga os dados atuais: exige um segundo toque.
    if (mode === 'replace' && hasCurrentData && !confirmTwoStep(confirm, 'Toque de novo para substituir')) return;
    try {
      const before = applyImport(analysis, { mode, includeDuplicates });
      closeSheet();
      showToast('Backup restaurado', {
        actionLabel: 'Desfazer',
        duration: 8000,
        onAction: () => {
          try {
            store.replaceAll(before);
            showToast('Restauração desfeita');
          } catch (err) {
            showToast(err.message);
          }
        },
      });
    } catch (err) {
      showToast(err.message || 'Não foi possível restaurar o backup.', { duration: 5000 });
    }
  });
  syncMode();
}

/* ------------------------------------------------------------------------ */
/* Apagar tudo                                                               */
/* ------------------------------------------------------------------------ */

function openEraseConfirm() {
  const count = store.getExpenses().length;
  const body = `
    <p class="sheet-text">Isso apaga ${count ? `as <strong>${plural(count, 'despesa', 'despesas')}</strong> registradas` : 'todos os registros'} e restaura as categorias padrão.</p>
    <p class="sheet-text"><strong>Não é possível desfazer.</strong> Se quiser guardar uma cópia, exporte um backup antes.</p>
    ${count ? `<button type="button" class="btn btn-secondary btn-block" data-erase-export>${icon('download')} Exportar backup antes</button>` : ''}`;
  const footer = `
    <div class="btn-row">
      <button type="button" class="btn btn-secondary" data-sheet-close>Cancelar</button>
      <button type="button" class="btn btn-danger-solid" data-erase-confirm>Apagar tudo</button>
    </div>`;
  const panel = openSheet({ title: 'Apagar todos os dados?', body, footer });
  panel.addEventListener('click', async (event) => {
    if (event.target.closest('[data-erase-export]')) {
      await exportJSON();
      return;
    }
    const confirm = event.target.closest('[data-erase-confirm]');
    if (!confirm || !confirmTwoStep(confirm, 'Toque de novo para apagar')) return;
    try {
      store.resetAll();
      closeSheet();
      showToast('Todos os dados foram apagados');
    } catch (err) {
      showToast(err.message);
    }
  });
}
