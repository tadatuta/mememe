import { normalize, tokens } from '../../src/memes/search.js';
// Bounded edit distance, including adjacent swapped letters.
function distance(a, b, limit) {
    if (Math.abs(a.length - b.length) > limit)
        return limit + 1;
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    let before = previous;
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        for (let j = 1; j <= b.length; j++) {
            row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1]));
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
                row[j] = Math.min(row[j], before[j - 2] + 1);
        }
        before = previous;
        previous = row;
    }
    return previous[b.length];
}
export class FuzzyCatalog {
    documents;
    vocabulary;
    constructor(cards) {
        const vocabulary = new Set();
        this.documents = cards.map(card => {
            const terms = new Map();
            const fields = [
                [[card.title, ...card.aliases].join(' '), 3], [card.meaning, 1.5],
                [card.mechanism, 1], [card.situations.join(' '), 1],
            ];
            for (const [field, weight] of fields)
                for (const term of tokens(field)) {
                    terms.set(term, Math.max(weight, terms.get(term) ?? 0));
                    vocabulary.add(term);
                }
            return { card, terms, names: [card.title, ...card.aliases].map(normalize) };
        });
        this.vocabulary = [...vocabulary];
    }
    search(query, limit = 12) {
        const text = normalize(query);
        if (text.length < 2)
            return [];
        const parts = [...new Set(tokens(query))].slice(0, 32);
        const matches = parts.map(part => {
            const values = new Map();
            for (const term of this.vocabulary) {
                if (term === part)
                    values.set(term, 1);
                else if (part.length >= 2 && term.startsWith(part))
                    values.set(term, 0.8);
                else if (part.length >= 4 && part.length <= 64) {
                    const tolerance = part.length >= 8 ? 2 : 1;
                    const edits = distance(part, term, tolerance);
                    if (edits <= tolerance)
                        values.set(term, 0.65 - (edits - 1) * 0.15);
                }
            }
            return values;
        });
        return this.documents.map(doc => {
            let score = 0;
            let supported = 0;
            for (const match of matches) {
                let best = 0;
                for (const [term, weight] of doc.terms)
                    best = Math.max(best, (match.get(term) ?? 0) * weight);
                if (best)
                    supported++;
                score += best;
            }
            const exact = doc.names.includes(text);
            const prefix = doc.names.some(name => name.startsWith(text));
            const coverage = supported / Math.max(1, parts.length);
            return { card: doc.card, score: exact ? 1000 : prefix ? 100 + score : score * coverage,
                eligible: exact || prefix || (supported > 0 && coverage >= 0.5) };
        }).filter(item => item.eligible).sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id)).slice(0, limit).map(item => item.card);
    }
}
