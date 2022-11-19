import * as translationsStore from './data';

import { IDBFactory } from 'fake-indexeddb';
const wipeIDB = () => {
	// Whenever you want a fresh indexedDB
	indexedDB = new IDBFactory();
};

// Close IDB and wipe to clear test
beforeEach(() => {
	translationsStore.closeDB();
	wipeIDB();
});

test('translations model CRUD operations', async () => {
	const translations = Array(5)
		.fill(null)
		.map((_, index) => ({
			timestamp: new Date().getTime(),
			translation: {
				from: 'en',
				to: 'de',
				originalText: 'text ' + (index + 1),
				translatedText: 'text ' + (index + 1),
			},
		}));

	// TODO: report to `fake-indexeddb` bug about concurrent inserting problems
	const identifiers: number[] = [];
	for (const translation of translations) {
		const id = await translationsStore.addEntry(translation);
		identifiers.push(id);
	}

	const expectedIdentifiersList = translations.map((_, index) => index + 1);
	expect(identifiers).toEqual(expectedIdentifiersList);

	const entriesWithKeys = await translationsStore.getEntries(undefined, undefined, {
		order: 'asc',
	});
	expect(typeof entriesWithKeys).toBe('object');
	expect(Array.isArray(entriesWithKeys)).toBe(true);

	// TODO: report to `idb` bug about invalid type of cursor value (not include a key property name)
	// Remove `id` key
	const entries = (entriesWithKeys as any[]).map(
		({ data: { id, ...anotherProps } }) => anotherProps,
	);

	// Check equality with original data
	expect(entries).toEqual(translations);
});

test('TODO: translations model migrations', async () => {
	expect(true).toEqual(true);
});