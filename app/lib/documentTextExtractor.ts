import path from 'node:path';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import readExcelFile from 'read-excel-file/node';
import { decodeTextBytes } from '@/app/lib/documentPreview';
import { extractTextWithOcr, isOcrImage } from '@/app/lib/documentOcr';

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_EXTRACTED_CHARACTERS_PER_FILE = 30_000;

const PLAIN_TEXT_EXTENSIONS = new Set([
    '.txt',
    '.text',
    '.md',
    '.markdown',
    '.csv',
    '.tsv',
    '.json',
    '.jsonl',
    '.ndjson',
    '.xml',
    '.xsd',
    '.xsl',
    '.html',
    '.htm',
    '.yaml',
    '.yml',
    '.toml',
    '.ini',
    '.cfg',
    '.conf',
    '.config',
    '.properties',
    '.env',
    '.log',
    '.sql',
    '.graphql',
    '.gql',
    '.css',
    '.scss',
    '.sass',
    '.less',
    '.js',
    '.mjs',
    '.cjs',
    '.jsx',
    '.ts',
    '.tsx',
    '.py',
    '.java',
    '.c',
    '.cc',
    '.cpp',
    '.h',
    '.hpp',
    '.cs',
    '.go',
    '.rs',
    '.php',
    '.rb',
    '.swift',
    '.kt',
    '.kts',
    '.sh',
    '.bash',
    '.zsh',
    '.ps1',
    '.bat',
    '.cmd',
]);

const SPREADSHEET_EXTENSIONS = new Set(['.xlsx', '.xlsm', '.ods']);
const UNSUPPORTED_LEGACY_SPREADSHEET_EXTENSIONS = new Set(['.xls', '.xlsb']);

type DocumentExtractionOptions = {
    maxSizeBytes?: number;
    maxCharacters?: number;
    enableOcr?: boolean;
};

const MIN_USEFUL_PDF_TEXT_CHARACTERS = 120;

function normalizeExtractedText(value: string, maxCharacters: number): string {
    return value
        .replace(/\0/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{4,}/g, '\n\n\n')
        .trim()
        .slice(0, maxCharacters);
}

function decodeXmlEntities(value: string): string {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

function extractTextFromXml(xml: string): string {
    return decodeXmlEntities(
        xml
            .replace(/<w:tab\s*\/?\s*>/gi, '\t')
            .replace(/<w:br\s*\/?\s*>/gi, '\n')
            .replace(/<text:tab\s*\/?\s*>/gi, '\t')
            .replace(/<text:line-break\s*\/?\s*>/gi, '\n')
            .replace(/<\/w:p>/gi, '\n')
            .replace(/<\/text:p>/gi, '\n')
            .replace(/<\/draw:page>/gi, '\n')
            .replace(/<[^>]+>/g, ' '),
    );
}

function naturalSlideOrder(left: string, right: string): number {
    const leftNumber = Number(left.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
    const rightNumber = Number(right.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
    return leftNumber - rightNumber;
}

async function extractPresentationText(buffer: Buffer): Promise<string> {
    const archive = await JSZip.loadAsync(buffer);
    const slidePaths = Object.keys(archive.files)
        .filter((filePath) => /^ppt\/slides\/slide\d+\.xml$/i.test(filePath))
        .sort(naturalSlideOrder);

    const slides: string[] = [];
    for (const slidePath of slidePaths) {
        const xml = await archive.file(slidePath)?.async('string');
        if (!xml) {
            continue;
        }

        const textRuns = Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/gi))
            .map((match) => decodeXmlEntities(match[1]).trim())
            .filter(Boolean);

        if (textRuns.length > 0) {
            slides.push(textRuns.join(' '));
        }
    }

    return slides.join('\n\n');
}

async function extractOpenDocumentText(buffer: Buffer): Promise<string> {
    const archive = await JSZip.loadAsync(buffer);
    const contentXml = await archive.file('content.xml')?.async('string');
    return contentXml ? extractTextFromXml(contentXml) : '';
}

async function extractSpreadsheetText(buffer: Buffer): Promise<string> {
    const sheets = await readExcelFile(buffer);
    return sheets.map(({ sheet, data }) => {
        const rows = data
            .map((row) => row.map((cell) => {
                if (cell instanceof Date) {
                    return cell.toLocaleDateString('ru-RU');
                }
                return String(cell ?? '').trim();
            }).join('\t'))
            .filter((row) => row.trim());

        return `Лист: ${sheet}\n${rows.join('\n')}`;
    }).join('\n\n');
}

function extractRtfText(buffer: Buffer): string {
    const source = buffer.toString('latin1');
    return source
        .replace(/\\u(-?\d+)\??/gi, (_match, value: string) => {
            const codePoint = Number(value);
            return String.fromCharCode(codePoint < 0 ? codePoint + 65_536 : codePoint);
        })
        .replace(/\\'([0-9a-f]{2})/gi, (_match, value: string) => {
            return new TextDecoder('windows-1251').decode(Uint8Array.of(Number.parseInt(value, 16)));
        })
        .replace(/\\par[d]?/gi, '\n')
        .replace(/\\[a-z]+-?\d* ?/gi, '')
        .replace(/\\[{}\\]/g, '')
        .replace(/[{}]/g, ' ');
}

export async function extractTextFromDocument(file: File, options: DocumentExtractionOptions = {}): Promise<string> {
    const maxSizeBytes = options.maxSizeBytes ?? MAX_DOCUMENT_SIZE_BYTES;
    const maxCharacters = options.maxCharacters ?? MAX_EXTRACTED_CHARACTERS_PER_FILE;

    if (file.size > maxSizeBytes) {
        const maxSizeMegabytes = Math.floor(maxSizeBytes / (1024 * 1024));
        throw new Error(`Файл превышает лимит ${maxSizeMegabytes} МБ: ${file.name}`);
    }

    const extension = path.extname(file.name).toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    const enableOcr = options.enableOcr !== false;
    let extractedText = '';

    if (PLAIN_TEXT_EXTENSIONS.has(extension) || file.type.startsWith('text/')) {
        extractedText = decodeTextBytes(new Uint8Array(buffer)) ?? '';
    } else if (extension === '.docx') {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
    } else if (extension === '.pdf') {
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        try {
            const result = await parser.getText();
            extractedText = result.text;
        } finally {
            await parser.destroy();
        }
        const nativeTextLength = extractedText.replace(/\s/g, '').length;
        if (enableOcr && nativeTextLength < MIN_USEFUL_PDF_TEXT_CHARACTERS) {
            try {
                const ocrText = await extractTextWithOcr(buffer, {
                    fileName: file.name,
                    mimeType: file.type,
                    maxCharacters,
                });
                if (ocrText) {
                    extractedText = ocrText;
                }
            } catch (error) {
                if (!extractedText.trim()) {
                    throw error;
                }
            }
        }
    } else if (isOcrImage(file.name, file.type)) {
        if (!enableOcr) {
            throw new Error(`Для изображения ${file.name} требуется OCR-распознавание`);
        }
        extractedText = await extractTextWithOcr(buffer, {
            fileName: file.name,
            mimeType: file.type,
            maxCharacters,
        });
    } else if (extension === '.ods') {
        extractedText = await extractOpenDocumentText(buffer);
    } else if (SPREADSHEET_EXTENSIONS.has(extension)) {
        extractedText = await extractSpreadsheetText(buffer);
    } else if (UNSUPPORTED_LEGACY_SPREADSHEET_EXTENSIONS.has(extension)) {
        throw new Error(`Формат ${extension} устарел. Сохраните таблицу как .xlsx и загрузите повторно`);
    } else if (extension === '.pptx') {
        extractedText = await extractPresentationText(buffer);
    } else if (extension === '.odt' || extension === '.odp') {
        extractedText = await extractOpenDocumentText(buffer);
    } else if (extension === '.rtf') {
        extractedText = extractRtfText(buffer);
    } else {
        const decodedText = decodeTextBytes(new Uint8Array(buffer));
        if (decodedText === null) {
            throw new Error(`Формат ${extension || file.type || 'не определен'} пока не поддерживается`);
        }
        extractedText = decodedText;
    }

    const normalizedText = normalizeExtractedText(extractedText, maxCharacters);
    if (!normalizedText) {
        throw new Error(`В файле ${file.name} не найден текст`);
    }

    return normalizedText;
}
