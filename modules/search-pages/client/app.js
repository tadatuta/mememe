function element(id) {
    return document.getElementById(id);
}
const form = element('form');
const query = element('query');
const clear = element('clear');
const results = element('results');
const grid = element('grid');
const heading = element('result-title');
const status = element('result-meta');
const dialog = element('preview');
let worker;
let version = 0;
let timer;
function showPreview(item) {
    const image = element('preview-image');
    image.src = item.image;
    image.alt = item.title;
    element('preview-title').textContent = item.title;
    element('preview-why').textContent = item.meaning;
    element('preview-source').href = item.source;
    element('preview-original').href = item.image;
    dialog.showModal();
}
function link(text, href) {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.textContent = text;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
}
function card(item) {
    const article = document.createElement('article');
    article.className = 'result';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'result__open';
    open.setAttribute('aria-label', `Рассмотреть: ${item.title}`);
    open.addEventListener('click', () => showPreview(item));
    const image = document.createElement('img');
    image.className = 'result__image';
    image.alt = item.title;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.src = item.image;
    image.addEventListener('error', () => { open.textContent = 'Изображение недоступно · открыть описание'; });
    open.append(image);
    const title = document.createElement('h3');
    title.className = 'result__title';
    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'result__link';
    name.textContent = item.title;
    name.addEventListener('click', () => showPreview(item));
    title.append(name);
    const meaning = document.createElement('p');
    meaning.className = 'result__why';
    meaning.textContent = item.meaning;
    const source = link('Meming Wiki ↗', item.source);
    source.className = 'result__source';
    article.append(open, title, meaning, source);
    return article;
}
function showError() {
    if (results.hidden)
        return;
    grid.replaceChildren();
    status.textContent = 'Не удалось загрузить каталог. Нажмите «Найти мем», чтобы повторить.';
}
function getWorker() {
    if (worker)
        return worker;
    const instance = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    instance.addEventListener('message', ({ data }) => {
        if (data.id !== version)
            return;
        if (data.type === 'error') {
            showError();
            return;
        }
        status.textContent = data.items.length ? `Показано: ${data.items.length}` : 'Совпадений нет';
        grid.replaceChildren(...data.items.map(card));
        if (!data.items.length) {
            const hint = document.createElement('p');
            hint.className = 'results__empty';
            hint.textContent = 'Попробуйте сократить запрос или ввести название мема.';
            grid.append(hint);
        }
    });
    instance.addEventListener('error', () => {
        instance.terminate();
        worker = undefined;
        showError();
    });
    worker = instance;
    return instance;
}
function search(delay) {
    window.clearTimeout(timer);
    const id = ++version;
    const text = query.value.trim();
    const active = text.length >= 2;
    clear.hidden = !query.value;
    element('main').classList.toggle('search--active', active);
    element('examples').hidden = active;
    results.hidden = !active;
    grid.replaceChildren();
    if (!active)
        return;
    heading.textContent = 'Мемы из каталога';
    status.textContent = 'Ищем…';
    timer = window.setTimeout(() => {
        try {
            getWorker().postMessage({ id, query: text });
        }
        catch (error) {
            console.error('Не удалось запустить поиск', error);
            showError();
        }
    }, delay);
}
function syncQuery() {
    const url = new URL(window.location.href);
    if (query.value)
        url.searchParams.set('query', query.value);
    else
        url.searchParams.delete('query');
    window.history.replaceState(null, '', url);
}
function restoreQuery() {
    query.value = (new URL(window.location.href).searchParams.get('query') ?? '').slice(0, query.maxLength);
    search(0);
}
form.addEventListener('submit', event => {
    event.preventDefault();
    syncQuery();
    search(0);
});
query.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        form.requestSubmit();
    }
});
query.addEventListener('input', () => {
    syncQuery();
    search(160);
});
document.querySelector('.search__field')?.addEventListener('click', () => query.focus());
clear.addEventListener('click', () => {
    query.value = '';
    syncQuery();
    search(0);
    query.focus();
});
for (const example of document.querySelectorAll('.search__examples button')) {
    example.addEventListener('click', () => {
        query.value = example.textContent ?? '';
        syncQuery();
        search(0);
        query.focus();
    });
}
element('close-preview').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
    if (event.target !== dialog)
        return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)
        dialog.close();
});
window.addEventListener('popstate', restoreQuery);
restoreQuery();
query.focus();
try {
    getWorker();
}
catch (error) {
    console.error('Не удалось запустить загрузку каталога', error);
}
export {};
