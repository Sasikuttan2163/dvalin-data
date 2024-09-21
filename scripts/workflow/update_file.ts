import { join, resolve } from 'path';
import { readJsonFile, writeJsonFile } from '../utils/fileUtils';
import { toPascalCase, replaceRomanNumeralsPascalCased } from '../utils/stringUtils';
import { langMapping, folderMapping } from '../utils/mappings';
import { stripHtml } from 'string-strip-html';

const baseDir = resolve('./');
const version = Bun.argv[2] || '0.0';

if (version === '0.0') {
	console.warn('No version provided. Using fallback version: 0.0');
}

console.log(`Processing version: ${version}`);

const filePath = join(baseDir, 'changed_files.txt');
const file = await Bun.file(filePath).text();

const lines = file.split('\n').filter((line) => line.startsWith('src/data'));

const fileListCreated: string[] = [];
const updatedFileList: string[] = [];
const errorFileList: Array<{ error: any; key: string; obj: any }> = [];

async function processLines() {
	for (const line of lines) {
		try {
			const [, , lang, folder, file] = line.split('/');
			const newLang = langMapping[lang];
			const newFolder = folderMapping[folder];

			if (folder === 'Domains.json' || folder === 'Domains') {
				const link = join(baseDir, 'genshin-data/', line);
				const newPath = join(baseDir, `data/${newLang}/${folder.split('.')[0]}.json`);
				const newData = await readJsonFile(link);
				await writeJsonFile(newPath, newData);
				continue;
			}

			const fileName = file.split('.')[0];
			let newFile = toPascalCase(fileName);
			if (newFolder === 'AchievementCategory') {
				newFile = replaceRomanNumeralsPascalCased(newFile);
			}

			const dvalinPath = join(baseDir, `data/${newLang}/${newFolder}/${newFile}.json`);
			const genshinDataPath = join(baseDir, 'genshin-data/', line);
			const fileContent = await handleFile(genshinDataPath, dvalinPath);
			await writeJsonFile(dvalinPath, fileContent);
			updatedFileList.push(dvalinPath);
		} catch (error) {
			errorFileList.push({ error, key: line, obj: error });
		}
	}
}

const handleFile = async (genshinDataPath: string, currentDataPath: string) => {
	const genshinData = await readJsonFile(genshinDataPath);
	const currentData = await readJsonFile(currentDataPath);
	const savedVersion = currentData.version ?? undefined;
	const processObject = (obj: any): any => {
		if (Array.isArray(obj)) {
			return obj.map((item) => processObject(item));
		} else if (typeof obj === 'object' && obj !== null) {
			const newObj: any = {};
			for (const [key, value] of Object.entries(obj)) {
				if (key !== '_id') {
					if (key.toLowerCase().includes('id') && typeof value === 'string') {
						if (genshinData.contains('achievement')) {
							newObj[key] = replaceRomanNumeralsPascalCased(toPascalCase(value));
						}
						newObj[key] = toPascalCase(value);
					} else {
						newObj[key] = processObject(value);
					}
					if (
						[
							'description',
							'name',
							'title',
							'desc',
							'inPlayDescription',
							'bonus'
						].includes(key)
					) {
						newObj[key] = stripHtml(value as string).result;
					}
				}
			}
			return newObj;
		}
		return obj;
	};

	const processedData = processObject(genshinData);

	// Add version to root
	processedData.version = savedVersion ?? version;
	return processedData;
};

await processLines();

console.log('Processing complete');
console.log('Files created:', fileListCreated.length);
console.log('Files updated:', updatedFileList.length);
console.log('Errors:', errorFileList.length);

if (errorFileList.length > 0) {
	console.error('Errors occurred during processing:');
	console.error(JSON.stringify(errorFileList, null, 2));
}
