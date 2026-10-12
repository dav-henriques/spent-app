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
export const APP_VERSION = '1.1.1';

/**
 * Versão do formato dos dados salvos. Ao mudar a estrutura das despesas ou
 * categorias de forma incompatível, incremente este número e adicione um
 * passo em MIGRATIONS (js/model.js). Campos novos e opcionais — como o
 * `icon` das categorias, preenchido na normalização — não exigem migração.
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
 * Paleta oferecida para categorias, baseada nas cores do sistema da Apple no
 * modo escuro: tons distintos entre si e legíveis sobre o fundo preto.
 */
export const CATEGORY_PALETTE = Object.freeze([
  { color: '#FF453A', name: 'Vermelho' },
  { color: '#FF9F0A', name: 'Laranja' },
  { color: '#FFD60A', name: 'Amarelo' },
  { color: '#30D158', name: 'Verde' },
  { color: '#63E6E2', name: 'Menta' },
  { color: '#64D2FF', name: 'Ciano' },
  { color: '#0A84FF', name: 'Azul' },
  { color: '#5E5CE6', name: 'Índigo' },
  { color: '#BF5AF2', name: 'Roxo' },
  { color: '#FF6AB5', name: 'Rosa' },
  { color: '#AC8E68', name: 'Marrom' },
  { color: '#8E8E93', name: 'Cinza' },
  { color: '#D1D1D6', name: 'Prata' },
  { color: '#636366', name: 'Grafite' },
]);

/**
 * Ícones disponíveis para categorias (símbolos em index.html, com o prefixo
 * "c-"). A ordem é a da grade de escolha em Ajustes.
 */
export const CATEGORY_ICONS = Object.freeze([
  { id: 'food', name: 'Refeição' },
  { id: 'coffee', name: 'Café' },
  { id: 'cart', name: 'Mercado' },
  { id: 'bag', name: 'Compras' },
  { id: 'shirt', name: 'Roupas' },
  { id: 'bus', name: 'Ônibus' },
  { id: 'car', name: 'Carro' },
  { id: 'plane', name: 'Viagem' },
  { id: 'house', name: 'Casa' },
  { id: 'bolt', name: 'Energia' },
  { id: 'phone', name: 'Celular' },
  { id: 'heart', name: 'Saúde' },
  { id: 'pill', name: 'Remédio' },
  { id: 'sparkles', name: 'Cuidados' },
  { id: 'dumbbell', name: 'Academia' },
  { id: 'book', name: 'Estudos' },
  { id: 'ticket', name: 'Ingresso' },
  { id: 'game', name: 'Jogos' },
  { id: 'music', name: 'Música' },
  { id: 'gift', name: 'Presente' },
  { id: 'repeat', name: 'Assinatura' },
  { id: 'paw', name: 'Pet' },
  { id: 'tag', name: 'Etiqueta' },
  { id: 'dots', name: 'Outros' },
]);

export const FALLBACK_ICON = 'tag';

/** Categorias criadas na primeira utilização. Os ids são estáveis. */
export const DEFAULT_CATEGORIES = Object.freeze([
  { id: 'alimentacao', name: 'Alimentação', color: '#FFD60A', icon: 'food' },
  { id: 'transporte', name: 'Transporte', color: '#0A84FF', icon: 'bus' },
  { id: 'compras', name: 'Compras', color: '#FF453A', icon: 'bag' },
  { id: 'entretenimento', name: 'Entretenimento', color: '#BF5AF2', icon: 'ticket' },
  { id: 'saude', name: 'Saúde', color: '#30D158', icon: 'heart' },
  { id: 'educacao', name: 'Educação', color: '#64D2FF', icon: 'book' },
  { id: 'assinaturas', name: 'Assinaturas', color: '#FF6AB5', icon: 'repeat' },
  { id: 'casa', name: 'Casa', color: '#63E6E2', icon: 'house' },
  { id: 'cuidados', name: 'Cuidados pessoais', color: '#FF9F0A', icon: 'sparkles' },
  { id: 'presentes', name: 'Presentes', color: '#5E5CE6', icon: 'gift' },
  { id: 'viagens', name: 'Viagens', color: '#AC8E68', icon: 'plane' },
  { id: 'outros', name: 'Outros', color: '#8E8E93', icon: 'dots' },
]);

/**
 * Cores padrão da versão 1.0. Categorias padrão que ainda usam essas cores
 * (ou seja, que o usuário não personalizou) recebem as cores novas.
 */
export const LEGACY_DEFAULT_COLORS = Object.freeze({
  alimentacao: '#F2C14E',
  transporte: '#4F8BFF',
  compras: '#FF5C5C',
  entretenimento: '#9D7BFF',
  saude: '#34C77B',
  educacao: '#56C2F0',
  assinaturas: '#FF6EB4',
  casa: '#2BC4B4',
  cuidados: '#FF9A57',
  presentes: '#C3DD5A',
  viagens: '#B9875F',
  outros: '#8E8E93',
});

/**
 * Descrições sugeridas por categoria, para registrar um gasto só com toques
 * (sem abrir o teclado do celular). As descrições já usadas aparecem antes.
 */
export const QUICK_TITLES = Object.freeze({
  alimentacao: ['Lanche', 'Almoço', 'Café', 'Mercado', 'Jantar'],
  transporte: ['Ônibus', 'Metrô', 'Uber', 'Combustível'],
  compras: ['Roupa', 'Tênis', 'Eletrônico', 'Presente para mim'],
  entretenimento: ['Cinema', 'Show', 'Jogo', 'Passeio'],
  saude: ['Farmácia', 'Consulta', 'Exame'],
  educacao: ['Livro', 'Material escolar', 'Curso'],
  assinaturas: ['Streaming', 'Música', 'Celular', 'Nuvem'],
  casa: ['Contas', 'Limpeza', 'Decoração'],
  cuidados: ['Cabelo', 'Cosméticos', 'Higiene'],
  presentes: ['Aniversário', 'Lembrancinha'],
  viagens: ['Passagem', 'Hospedagem', 'Passeio'],
  outros: [],
});
