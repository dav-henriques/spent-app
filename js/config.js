/**
 * Configuração central do aplicativo.
 *
 * Nome do app: APP_NAME controla o nome exibido na interface e no título da
 * página. O nome usado na instalação (ícone da tela de início) também aparece
 * em manifest.webmanifest ("name"/"short_name") e na meta tag
 * "apple-mobile-web-app-title" de index.html, porque o sistema lê esses
 * arquivos estáticos antes de qualquer JavaScript rodar.
 */
export const APP_NAME = 'Gastos';

/** Versão exibida em Ajustes. Mantenha igual à VERSION de service-worker.js. */
export const APP_VERSION = '1.0.0';

/**
 * Versão do formato dos dados salvos. Ao mudar a estrutura das despesas ou
 * categorias, incremente este número e adicione um passo em MIGRATIONS
 * (js/model.js).
 */
export const SCHEMA_VERSION = 1;

/**
 * Prefixo fixo das chaves do localStorage. Não depende de APP_NAME, para que
 * renomear o app não "esconda" os dados já gravados.
 */
export const STORAGE_PREFIX = 'gastos';

export const STORAGE_KEYS = Object.freeze({
  meta: `${STORAGE_PREFIX}.meta`,
  expenses: `${STORAGE_PREFIX}.expenses`,
  categories: `${STORAGE_PREFIX}.categories`,
  prefs: `${STORAGE_PREFIX}.prefs`,
});

/** Cópias de dados que não puderam ser lidos ficam em chaves com este prefixo. */
export const RECOVERY_PREFIX = `${STORAGE_PREFIX}.recovery.`;

export const LIMITS = Object.freeze({
  titleMax: 60,
  noteMax: 280,
  categoryNameMax: 24,
  maxCents: 99_999_999_999, // R$ 999.999.999,99
});

/** Cor usada quando uma categoria não tem cor válida. */
export const FALLBACK_COLOR = '#8E8E93';

/**
 * Paleta oferecida para categorias: tons distintos entre si e legíveis sobre
 * o fundo preto. A ordem segue o círculo cromático.
 */
export const CATEGORY_PALETTE = Object.freeze([
  { color: '#F2C14E', name: 'Amarelo' },
  { color: '#FF9A57', name: 'Laranja' },
  { color: '#FF5C5C', name: 'Vermelho' },
  { color: '#FF6EB4', name: 'Rosa' },
  { color: '#D98BFF', name: 'Orquídea' },
  { color: '#9D7BFF', name: 'Roxo' },
  { color: '#4F8BFF', name: 'Azul' },
  { color: '#56C2F0', name: 'Azul-claro' },
  { color: '#2BC4B4', name: 'Verde-água' },
  { color: '#34C77B', name: 'Verde' },
  { color: '#C3DD5A', name: 'Lima' },
  { color: '#B9875F', name: 'Caramelo' },
  { color: '#E5E5E5', name: 'Gelo' },
  { color: '#8E8E93', name: 'Cinza' },
]);

/** Categorias criadas na primeira utilização. Os ids são estáveis. */
export const DEFAULT_CATEGORIES = Object.freeze([
  { id: 'alimentacao', name: 'Alimentação', color: '#F2C14E' },
  { id: 'transporte', name: 'Transporte', color: '#4F8BFF' },
  { id: 'compras', name: 'Compras', color: '#FF5C5C' },
  { id: 'entretenimento', name: 'Entretenimento', color: '#9D7BFF' },
  { id: 'saude', name: 'Saúde', color: '#34C77B' },
  { id: 'educacao', name: 'Educação', color: '#56C2F0' },
  { id: 'assinaturas', name: 'Assinaturas', color: '#FF6EB4' },
  { id: 'casa', name: 'Casa', color: '#2BC4B4' },
  { id: 'cuidados', name: 'Cuidados pessoais', color: '#FF9A57' },
  { id: 'presentes', name: 'Presentes', color: '#C3DD5A' },
  { id: 'viagens', name: 'Viagens', color: '#B9875F' },
  { id: 'outros', name: 'Outros', color: '#8E8E93' },
]);
