export const SEARCH_VERSION = 'lexical-semantic-cards-v1';
const stopwords = new Set(('и в во на по к ко из за от до для с со у о об а но или как что это этот эта эти того тот та те то ' +
    'я ты он она мы вы они мне меня мой моя мои его ее их себя свой свои уже еще же бы быт быть был была были есть ' +
    'когда где который которая которые только очень все весь вся вот там тут теперь чем чем-то кто кто-то ' +
    'мем мемы нужен нужна нужно найди покажи пожалуйста про ситуацию ситуации').split(' '));
export function normalize(text) {
    return text.normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
// Conservative suffix heuristic, not a full morphological analyser. Negation is preserved.
export function stem(word) {
    if (!/^[а-я]+$/.test(word) || word.length < 5)
        return word;
    const stripped = word.replace(/(?:иями|ями|ами|ого|ему|ому|ыми|ими|ая|яя|ое|ее|ые|ие|ый|ий|ой|ую|юю|ов|ев|ах|ях|ам|ям|ом|ем|ть|ти|ся|сь|ла|ли|ло|ет|ют|ут|ит|ат|ят|ил|ать|ить|ы|и|а|я|у|ю|е|о|ь)$/u, '');
    return stripped.length >= 3 ? stripped : word;
}
export function tokens(text) {
    return normalize(text).split(' ').filter(word => word.length > 1 && !stopwords.has(word)).map(stem);
}
export class MemeSearch {
    concepts = new Map();
    documents;
    frequencies = new Map();
    averageLength;
    constructor(cards, vocabulary) {
        vocabulary.groups.forEach((group, i) => group.forEach(word => tokens(word).forEach(token => {
            const concepts = this.concepts.get(token) ?? new Set();
            concepts.add(`concept:${i}`);
            this.concepts.set(token, concepts);
        })));
        this.documents = cards.map(card => {
            const terms = new Map();
            const fields = [
                [[card.title, ...card.aliases].join(' '), 1.5], [card.meaning, 2], [card.mechanism, 1.5],
                [card.situations.join(' '), 1], [card.roles.map(role => role.meaning).join(' '), 0.5],
            ];
            for (const [text, weight] of fields)
                for (const token of tokens(text)) {
                    terms.set(token, (terms.get(token) ?? 0) + weight);
                    for (const concept of this.concepts.get(token) ?? [])
                        terms.set(concept, (terms.get(concept) ?? 0) + weight * 0.5);
                }
            for (const term of terms.keys())
                this.frequencies.set(term, (this.frequencies.get(term) ?? 0) + 1);
            return { card, terms, length: [...terms.values()].reduce((a, b) => a + b, 0) };
        });
        this.averageLength = this.documents.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, cards.length);
    }
    idf(term) {
        const df = this.frequencies.get(term) ?? 0;
        return Math.log(1 + (this.documents.length - df + 0.5) / (df + 0.5));
    }
    search(query, limit = 5) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 50)
            throw new Error('limit must be an integer from 1 to 50');
        if (query.length > 4000)
            throw new Error('Query exceeds 4000 characters');
        const queryTokens = [...new Set(tokens(query))];
        const scored = this.documents.map(doc => {
            let score = 0;
            let supported = 0;
            const matched = [];
            for (const token of queryTokens) {
                const options = [[token, 1], ...[...(this.concepts.get(token) ?? [])].map(c => [c, 0.65])];
                let best = 0;
                for (const [term, weight] of options) {
                    const tf = doc.terms.get(term) ?? 0;
                    const value = weight * this.idf(term) * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * doc.length / (this.averageLength || 1)));
                    best = Math.max(best, value);
                }
                if (best > 0) {
                    matched.push(token);
                    supported += 1;
                }
                score += best;
            }
            const coverage = supported / Math.max(1, queryTokens.length);
            const exactAlias = normalize(query).length > 1 && [doc.card.title, ...doc.card.aliases].some(alias => normalize(alias) === normalize(query));
            // Retrieval gate detects lexical evidence only; it does not certify semantic relevance.
            const eligible = exactAlias || (supported >= 2 && coverage >= 0.2 && score >= 2.5);
            const rankedSituations = doc.card.situations.map(situation => ({ situation,
                overlap: tokens(situation).filter(token => queryTokens.includes(token) || [...(this.concepts.get(token) ?? [])].some(c => queryTokens.some(q => this.concepts.get(q)?.has(c)))).length,
            })).sort((a, b) => b.overlap - a.overlap);
            const result = { meme_id: doc.card.id, title: doc.card.title,
                score: Number((score + (exactAlias ? 100 : 0)).toFixed(4)), coverage: Number(coverage.toFixed(4)),
                why: doc.card.meaning, matched_terms: matched,
                matched_situations: rankedSituations.filter(s => s.overlap > 0).slice(0, 2).map(s => s.situation),
                roles: doc.card.roles, not_for: doc.card.not_for, template_path: doc.card.primary_template_path,
                card_path: doc.card.card_path ?? `index/pilot/cards/${doc.card.id}.json`, review_status: doc.card.review_status };
            return { eligible, result };
        });
        const results = scored.filter(s => s.eligible).map(s => s.result)
            .sort((a, b) => b.score - a.score || a.meme_id.localeCompare(b.meme_id)).slice(0, limit);
        return { query, status: results.length ? 'candidates' : 'no_match', method: SEARCH_VERSION,
            note: results.length ? 'Кандидаты по словам и словарю понятий; проверьте роли, not_for и изображение. Score не является вероятностью релевантности.' :
                'Недостаточно лексических совпадений в пилоте. Это не доказывает отсутствие подходящего мема. Сформулируйте механизм ситуации и повторите поиск.', results };
    }
}
