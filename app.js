/* ============================================================================
   UX/UI СЛОВАРЬ — ЛОГИКА
   ----------------------------------------------------------------------------
   Все термины лежат в файле data.js (массивы SECTIONS и TERMS).
   Как добавить слово — см. комментарий в начале data.js.
   ========================================================================== */

/* ============================ 1. УТИЛИТЫ ================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const sectionById = (id) => SECTIONS.find((s) => s.id === id);

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Нормализация строки для поиска: нижний регистр, ё→е, лишние пробелы. */
function normalize(str) {
  return String(str).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/** Подсветка найденного фрагмента внутри текста. */
function highlight(text, query) {
  const safe = escapeHtml(text);
  if (!query) return safe;
  const q = normalize(query).split(' ')[0];
  if (!q) return safe;
  const idx = normalize(text).indexOf(q);
  if (idx === -1) return safe;
  return (
    escapeHtml(text.slice(0, idx)) +
    '<mark>' + escapeHtml(text.slice(idx, idx + q.length)) + '</mark>' +
    escapeHtml(text.slice(idx + q.length))
  );
}

/** Русское склонение: 1 термин / 2 термина / 5 терминов */
function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/* ======================= 2. СОСТОЯНИЕ =================================== */

const state = {
  tab: 'ru',
  query: '',
  results: [],
  activeResult: -1,
  lastFocused: null,
};

const terms = TERMS.map((t, i) => ({ ...t, id: i }));

/* ==================== 3. ТЕМА (СВЕТЛАЯ / ТЁМНАЯ) ======================== */

function initTheme() {
  const saved = localStorage.getItem('uxui-theme');
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const theme = saved || (prefersLight ? 'light' : 'dark');
  document.documentElement.dataset.theme = theme;

  $('#themeToggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('uxui-theme', next);
  });
}

/* ======================= 4. БУКВЕННЫЕ ПАНЕЛИ =========================== */

/** Латиница → кириллица, по одной букве (для группировки). */
const LAT_LETTER = {
  A: 'А', B: 'Б', C: 'В', D: 'Д', E: 'Е', F: 'Ф', G: 'Г', H: 'Х',
  I: 'И', J: 'Й', K: 'К', L: 'Л', M: 'М', N: 'Н', O: 'О', P: 'П',
  Q: 'К', R: 'Р', S: 'С', T: 'Т', U: 'У', V: 'В', W: 'В', X: 'К',
  Y: 'И', Z: 'З',
};

/** Полная транслитерация слова (для сортировки). */
const LAT_WORD = {
  A: 'А', B: 'Б', C: 'В', D: 'Д', E: 'Е', F: 'Ф', G: 'Г', H: 'Эч',
  I: 'И', J: 'Дж', K: 'К', L: 'Л', M: 'М', N: 'Н', O: 'О', P: 'П',
  Q: 'Кю', R: 'Р', S: 'С', T: 'Т', U: 'У', V: 'В', W: 'Вэ', X: 'Икс',
  Y: 'Уай', Z: 'З',
};

const collatorRu = new Intl.Collator('ru', { sensitivity: 'base' });
const collatorEn = new Intl.Collator('en', { sensitivity: 'base' });

/**
 * Ключ сортировки русского названия: ведущие латинские буквы
 * приводим к кириллице, чтобы «T-образный» и «UX-дизайнеры»
 * вставали рядом со своими кириллическими соседями.
 */
function ruSortKey(str) {
  return String(str).trim().replace(/^[A-Za-z]+/, (run) =>
    [...run].map((c) => LAT_WORD[c.toUpperCase()] || c).join('')
  );
}

/** Сравнение терминов по выбранному языку. */
function compareTerms(a, b, lang) {
  if (lang === 'en') return collatorEn.compare(a.en, b.en);
  return collatorRu.compare(ruSortKey(a.ru), ruSortKey(b.ru));
}

/**
 * Группирует термины по буквам. Показываются только буквы,
 * у которых есть хотя бы один термин.
 * @param {'ru'|'en'} lang
 */
function groupByLetter(lang) {
  const key = lang === 'ru' ? 'ru' : 'en';
  const groups = new Map();

  const sorted = [...terms].sort((a, b) => compareTerms(a, b, lang));

  for (const term of sorted) {
    let letter = term[key].trim().charAt(0).toUpperCase();

    // «T-образный» → Т, «UX-дизайнеры» → У
    if (lang === 'ru' && LAT_LETTER[letter]) letter = LAT_LETTER[letter];

    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(term);
  }

  // Буквы без терминов не показываем
  return [...groups.entries()].filter(([, list]) => list.length > 0);
}

/**
 * Элемент списка терминов: только название слова.
 * Никаких определений и переводов — они появляются в модалке по клику.
 */
function wordHTML(term, lang) {
  const title = lang === 'ru' ? term.ru : term.en;
  return `
    <button class="word" type="button" data-id="${term.id}" title="${escapeHtml(title)}">
      <span class="word__title">${escapeHtml(title)}</span>
      <span class="word__arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>
      </span>
    </button>`;
}

/* --------------------- Адаптивное число колонок словаря ------------------ */

/** Границы: узкий экран → 1 колонка, средний → 2, широкий → 3. */
const COL_BREAKPOINTS = [
  { query: '(max-width: 620px)', cols: 1 },
  { query: '(min-width: 621px) and (max-width: 900px)', cols: 2 },
  { query: '(min-width: 901px)', cols: 3 },
];

/** Функции, которые нужно вызвать при смене числа колонок. */
const colPainters = [];
let colListenersBound = false;

/** Сколько колонок словаря показывать при текущей ширине окна. */
function currentCols() {
  for (const bp of COL_BREAKPOINTS) {
    if (window.matchMedia(bp.query).matches) return bp.cols;
  }
  return 3;
}

/**
 * Регистрирует перерисовку панели на смену числа колонок.
 * @param {() => void} paint
 */
function onColsChange(paint) {
  colPainters.push(paint);
  if (colListenersBound) return;
  colListenersBound = true;

  COL_BREAKPOINTS.forEach((bp) => {
    const mq = window.matchMedia(bp.query);
    const handler = () => colPainters.forEach((fn) => fn());
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
  });
}

/** Рендерит панель алфавита (по-русски или по-английски). */
function renderAlphabetPanel(lang, mount) {
  const groups = groupByLetter(lang);
  const barId = `letterbar-${lang}`;

  const chips = groups
    .map(([letter, list]) => `
      <button class="letter-chip" type="button" data-target="group-${lang}-${encodeURIComponent(letter)}">
        <span>${escapeHtml(letter)}</span>
        <span class="letter-chip__count">${list.length}</span>
      </button>`)
    .join('');

  const barHtml = `<nav class="letterbar" id="${barId}" aria-label="Буквы алфавита">${chips}</nav>`;

  const groupsHtml = groups
    .map(([letter, list]) => `
      <section class="letter-group" id="group-${lang}-${encodeURIComponent(letter)}">
        <h2 class="letter-title">
          <span class="letter-title__badge">${escapeHtml(letter)}</span>
          <span class="letter-title__line"></span>
          <span class="letter-title__count">${list.length} ${plural(list.length, 'термин', 'термина', 'терминов')}</span>
        </h2>
        <div class="wordlist">${list.map((t) => wordHTML(t, lang)).join('')}</div>
      </section>`)
    .join('');

  let lastCols = 0;

  function paint() {
    const cols = currentCols();
    if (cols === lastCols) return;
    lastCols = cols;

    // Буквы идут списком: сначала первая колонка, потом вторая, потом третья.
    // grid-auto-flow: column раскладывает элементы сверху вниз, затем вправо.
    const rows = Math.ceil(groups.length / cols);

    mount.innerHTML = `
      ${barHtml}
      <div class="colgrid" style="--cols:${cols}; --rows:${rows}">${groupsHtml}</div>`;

    // Клик по букве — плавный скролл к группе
    $$('.letter-chip', mount).forEach((chip) => {
      chip.addEventListener('click', () => {
        const group = document.getElementById(chip.dataset.target);
        if (group) group.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  paint();
  onColsChange(paint);
}

/** Панель «по разделам»: разделы — в порядке из data.js, термины внутри — по алфавиту. */
function renderSectionsPanel(mount) {
  const sections = SECTIONS.map((sec) => {
    const list = terms
      .filter((t) => t.section === sec.id)
      .sort((a, b) => compareTerms(a, b, 'ru'));

    return `
      <section class="section-group" id="section-${sec.id}">
        <div class="section-head">
          <div>
            <h2 class="section-head__title">${escapeHtml(sec.title)}</h2>
            <p class="section-head__meta">${list.length} ${plural(list.length, 'термин', 'термина', 'терминов')}</p>
          </div>
        </div>
        <div class="wordlist">${list.map((t) => wordHTML(t, 'ru')).join('')}</div>
      </section>`;
  });

  let lastCols = 0;

  function paint() {
    const cols = currentCols();
    if (cols === lastCols) return;
    lastCols = cols;

    const rows = Math.ceil(sections.length / cols);
    mount.innerHTML = `
      <div class="colgrid" style="--cols:${cols}; --rows:${rows}">${sections.join('')}</div>`;
  }

  paint();
  onColsChange(paint);
}

/* ========================= 5. ВКЛАДКИ (ТАБЫ) =========================== */

function initTabs() {
  const tabs = $$('.tab');
  const pill = $('#tabsPill');

  function movePill(tab) {
    if (!tab) return;
    pill.style.width = `${tab.offsetWidth}px`;
    pill.style.transform = `translateX(${tab.offsetLeft - 5}px)`;
  }

  function selectTab(name, focus = false) {
    state.tab = name;
    tabs.forEach((t) => {
      const active = t.dataset.panel === name;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', String(active));
      t.tabIndex = active ? 0 : -1;
      if (active) {
        movePill(t);
        if (focus) t.focus();
      }
    });

    $$('.panel').forEach((p) => {
      const active = p.id === `panel-${name}`;
      p.hidden = !active;
      p.classList.toggle('is-active', active);
    });

    history.replaceState(null, '', `#${name}`);
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.panel));

    // Стрелки переключают вкладки (WAI-ARIA pattern)
    tab.addEventListener('keydown', (e) => {
      let next = null;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (e.key === 'Home') next = tabs[0];
      if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) {
        e.preventDefault();
        selectTab(next.dataset.panel, true);
      }
    });
  });

  window.addEventListener('resize', () => movePill($('.tab.is-active')));

  // Шрифты могут примениться позже — пересчитать позицию «пилюли»
  if (document.fonts?.ready) document.fonts.ready.then(() => movePill($('.tab.is-active')));

  return selectTab;
}

/* =========================== 6. ПОИСК ==================================== */

function initSearch() {
  const input = $('#searchInput');
  const resultsBox = $('#searchResults');
  const clearBtn = $('#searchClear');
  const kbd = $('#searchKbd');

  function findMatches(query) {
    const q = normalize(query);
    const tokens = q.split(' ').filter(Boolean);
    if (!tokens.length) return [];

    const scored = [];
    for (const term of terms) {
      const ru = normalize(term.ru);
      const en = normalize(term.en);
      const def = normalize(term.def);
      const haystack = `${ru} ${en} ${def}`;

      if (!tokens.every((t) => haystack.includes(t))) continue;

      let score = 0;
      let field = 'ru';
      if (ru.startsWith(q)) { score = 10; field = 'ru'; }
      else if (en.startsWith(q)) { score = 9; field = 'en'; }
      else if (ru.includes(q)) { score = 7; field = 'ru'; }
      else if (en.includes(q)) { score = 6; field = 'en'; }
      else if (def.includes(q)) { score = 3; field = 'def'; }

      scored.push({ term, score, field });
    }

    return scored.sort((a, b) => b.score - a.score || a.term.ru.localeCompare(b.term.ru, 'ru'));
  }

  function renderResults() {
    if (!state.query) {
      resultsBox.hidden = true;
      resultsBox.innerHTML = '';
      input.setAttribute('aria-expanded', 'false');
      state.results = [];
      state.activeResult = -1;
      return;
    }

    state.results = findMatches(state.query);
    state.activeResult = state.results.length ? 0 : -1;

    if (!state.results.length) {
      resultsBox.innerHTML = `
        <div class="sr-empty">
          Ничего не найдено по запросу «${escapeHtml(state.query)}»
        </div>`;
    } else {
      resultsBox.innerHTML = state.results
        .map(({ term, field }, i) => {
          const sec = sectionById(term.section);
          const title = field === 'en' ? term.en : term.ru;
          return `
            <button class="sr-item${i === 0 ? ' is-active' : ''}" type="button" role="option" aria-selected="${i === 0}" data-index="${i}">
              <span class="sr-item__text">
                <span class="sr-item__title">${highlight(title, state.query)}</span>
                ${field === 'def' ? '<span class="sr-item__meta">найдено в определении</span>' : ''}
              </span>
              <span class="sr-item__section">${escapeHtml(sec.title)}</span>
            </button>`;
        })
        .join('');
    }

    resultsBox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function closeResults() {
    resultsBox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  }

  function openActive() {
    const item = state.results[state.activeResult];
    if (!item) return;
    closeResults();
    openModal(item.term.id, state.tab);
  }

  function syncActive() {
    $$('.sr-item', resultsBox).forEach((el, i) => {
      const on = i === state.activeResult;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', String(on));
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
  }

  input.addEventListener('input', () => {
    state.query = input.value.trim();
    clearBtn.hidden = !input.value;
    renderResults();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!resultsBox.hidden) closeResults();
      else { input.value = ''; state.query = ''; clearBtn.hidden = true; input.blur(); }
      return;
    }
    if (resultsBox.hidden || !state.results.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.activeResult = (state.activeResult + 1) % state.results.length;
      syncActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.activeResult = (state.activeResult - 1 + state.results.length) % state.results.length;
      syncActive();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      openActive();
    }
  });

  resultsBox.addEventListener('click', (e) => {
    const btn = e.target.closest('.sr-item');
    if (!btn) return;
    const { term } = state.results[Number(btn.dataset.index)];
    closeResults();
    openModal(term.id, state.tab);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    state.query = '';
    clearBtn.hidden = true;
    closeResults();
    input.focus();
  });

  // Клик вне — закрыть выпадающий список
  document.addEventListener('click', (e) => {
    if (!$('#searchBox').contains(e.target)) closeResults();
  });

  // «/» или Ctrl+K — фокус в поиск
  document.addEventListener('keydown', (e) => {
    const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
    if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  kbd.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : '/';
}

/* ========================== 7. МОДАЛЬНОЕ ОКНО =========================== */

function openModal(id, lang = 'ru') {
  const term = terms.find((t) => t.id === id);
  if (!term) return;

  const modal = $('#modal');
  const body = $('#modalBody');
  const sec = sectionById(term.section);
  const primary = lang === 'en' ? term.en : term.ru;
  const translation = lang === 'en' ? term.ru : term.en;

  state.lastFocused = document.activeElement;

  body.innerHTML = `
    <h3 class="m-title" id="modalTitle">${escapeHtml(primary)}</h3>
    <p class="m-en">${escapeHtml(translation)}</p>
    <span class="m-tag">${escapeHtml(sec.title)}</span>
    <div class="m-divider"></div>
    <p class="m-label">Определение</p>
    <p class="m-def">${escapeHtml(term.def)}</p>
    <div class="m-actions">
      <button class="m-btn m-btn--primary" type="button" data-copy>Скопировать определение</button>
      <button class="m-btn" type="button" data-goto="en">Смотреть по-английски</button>
      <button class="m-btn" type="button" data-goto="sections">Раздел: ${escapeHtml(sec.title)}</button>
    </div>`;

  modal.hidden = false;
  document.body.classList.add('is-locked');
  $('.modal__close').focus();

  // Копирование
  $('[data-copy]', body).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const text = `${term.ru} (${term.en}) — ${term.def}`;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Скопировано';
    } catch {
      btn.textContent = 'Не удалось скопировать';
    }
    setTimeout(() => { btn.textContent = 'Скопировать определение'; }, 1800);
  });

  // Переход к другой вкладке
  $$('[data-goto]', body).forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.goto;
      closeModal();
      switchTab(target);
      const anchor = target === 'en'
        ? document.getElementById(`group-en-${encodeURIComponent(term.en.charAt(0).toUpperCase())}`)
        : document.getElementById(`section-${term.section}`);
      setTimeout(() => {
        if (!anchor) return;
        anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const card = $$('.word', anchor).find((c) => Number(c.dataset.id) === term.id);
        if (card) {
          card.classList.add('is-highlight');
          setTimeout(() => card.classList.remove('is-highlight'), 1600);
        }
      }, 120);
    });
  });
}

function closeModal() {
  const modal = $('#modal');
  if (modal.hidden) return;
  modal.hidden = true;
  document.body.classList.remove('is-locked');
  state.lastFocused?.focus?.();
}

function initModal() {
  const modal = $('#modal');
  const dialog = $('#modalDialog');

  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (modal.hidden) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
      return;
    }

    // Ловушка фокуса
    if (e.key === 'Tab') {
      const focusables = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', dialog)
        .filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

/* ==================== 8. ВЗАИМОДЕЙСТВИЕ С КАРТОЧКАМИ =================== */

function initCards() {
  document.addEventListener('click', (e) => {
    const word = e.target.closest('.word');
    if (!word) return;
    openModal(Number(word.dataset.id), state.tab === 'en' ? 'en' : 'ru');
  });
}

/* ================= 9. SCROLL-SPY ДЛЯ БУКВЕННЫХ ЧИПОВ ================== */

function initScrollSpy() {
  let ticking = false;

  function update() {
    const panel = $('.panel:not([hidden])');
    if (!panel) return;
    const bar = $('.letterbar', panel);
    if (!bar) return;

    const groups = $$('.letter-group', panel);

    // Сетка заполняется по колонкам: строки выровнены, поэтому
    // «текущая» буква — самая нижняя из тех, что дошли до линии,
    // а при равенстве — самая левая (первая колонка).
    let current = null;
    let bestTop = -Infinity;

    for (const g of groups) {
      const { top, left } = g.getBoundingClientRect();
      if (top > 190) continue;
      if (top > bestTop + 2) {
        bestTop = top;
        current = g;
      } else if (current && Math.abs(top - bestTop) <= 2 && left < current.getBoundingClientRect().left) {
        current = g;
        bestTop = top;
      }
    }

    const letter = current ? decodeURIComponent(current.id.split('-').pop()) : null;
    $$('.letter-chip', bar).forEach((chip) => {
      const target = decodeURIComponent(chip.dataset.target);
      chip.classList.toggle('is-current', target.endsWith(`-${letter}`));
    });

    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
}

/* ============================ 10. СТАРТ ================================== */

let switchTab = () => {};

function init() {
  initTheme();
  switchTab = initTabs();

  renderAlphabetPanel('ru', $('#panel-ru'));
  renderAlphabetPanel('en', $('#panel-en'));
  renderSectionsPanel($('#panel-sections'));

  initSearch();
  initModal();
  initCards();
  initScrollSpy();

  // Счётчики
  const counter = $('#counter');
  const footerCount = $('#footerCount');
  counter.textContent = `${terms.length} ${plural(terms.length, 'термин', 'термина', 'терминов')}`;
  footerCount.textContent = String(terms.length);

  // Открытие конкретной вкладки по хэшу
  const hash = location.hash.replace('#', '');
  if (['ru', 'en', 'sections'].includes(hash)) switchTab(hash);
}

document.addEventListener('DOMContentLoaded', init);
