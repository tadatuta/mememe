import { FuzzyCatalog } from './fuzzy.js';
const worker = self;
let index;
function loadIndex() {
    index ??= (async () => {
        const response = await fetch(new URL('../../../catalog.json', import.meta.url));
        if (!response.ok)
            throw new Error(`Каталог недоступен: HTTP ${response.status}`);
        const cards = await response.json();
        return new FuzzyCatalog(cards);
    })().catch((error) => {
        index = undefined;
        throw error;
    });
    return index;
}
void loadIndex().catch(() => { });
let latest = 0;
worker.addEventListener('message', async ({ data }) => {
    const { id, query } = data;
    latest = id;
    try {
        const catalog = await loadIndex();
        if (id !== latest)
            return;
        const items = catalog.search(query).map(({ title, meaning, image, source }) => ({ title, meaning, image, source }));
        worker.postMessage({ id, type: 'results', items });
    }
    catch (error) {
        if (id !== latest)
            return;
        console.error('Не удалось выполнить поиск по каталогу', error);
        worker.postMessage({ id, type: 'error' });
    }
});
