import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const DEFAULT_OCR_LANGUAGES = 'rus+eng';
const DEFAULT_MAX_PDF_PAGES = 60;
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;
const MAX_COMMAND_OUTPUT_BYTES = 16 * 1024 * 1024;

const IMAGE_EXTENSIONS = new Set([
    '.bmp',
    '.gif',
    '.heic',
    '.heif',
    '.jpeg',
    '.jpg',
    '.png',
    '.tif',
    '.tiff',
    '.webp',
]);

type OcrOptions = {
    fileName: string;
    mimeType: string;
    maxCharacters: number;
};

type CommandResult = {
    stdout: string;
    stderr: string;
};

let ocrQueue: Promise<void> = Promise.resolve();

const getPositiveInteger = (value: string | undefined, fallback: number): number => {
    const parsedValue = Number(value);
    return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

const isOcrEnabled = (): boolean => {
    return !['false', '0', 'no'].includes((process.env.OCR_ENABLED || 'true').trim().toLowerCase());
};

const runCommand = (command: string, args: string[]): Promise<CommandResult> => {
    const timeout = getPositiveInteger(process.env.OCR_COMMAND_TIMEOUT_MS, DEFAULT_COMMAND_TIMEOUT_MS);

    return new Promise((resolve, reject) => {
        execFile(command, args, {
            encoding: 'utf8',
            maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
            timeout,
            windowsHide: true,
        }, (error, stdout, stderr) => {
            if (!error) {
                resolve({ stdout, stderr });
                return;
            }

            const commandError = error as NodeJS.ErrnoException & { killed?: boolean };
            if (commandError.code === 'ENOENT') {
                reject(new Error(`OCR-команда ${command} не установлена на сервере`));
                return;
            }

            if (commandError.killed) {
                reject(new Error(`OCR-команда ${command} превысила лимит времени`));
                return;
            }

            const details = String(stderr || commandError.message).trim().slice(0, 500);
            reject(new Error(`Ошибка OCR-команды ${command}: ${details}`));
        });
    });
};

const normalizeOcrText = (value: string, maxCharacters: number): string => {
    return value
        .replace(/\0/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{4,}/g, '\n\n\n')
        .trim()
        .slice(0, maxCharacters);
};

const recognizeImage = async (imagePath: string): Promise<string> => {
    const languages = (process.env.OCR_LANGUAGES || DEFAULT_OCR_LANGUAGES).trim() || DEFAULT_OCR_LANGUAGES;
    const { stdout } = await runCommand('tesseract', [
        imagePath,
        'stdout',
        '-l',
        languages,
        '--psm',
        '6',
    ]);
    return stdout;
};

const getPdfPageCount = async (pdfPath: string): Promise<number> => {
    const { stdout } = await runCommand('pdfinfo', [pdfPath]);
    const pageCount = Number(stdout.match(/^Pages:\s+(\d+)$/im)?.[1]);
    if (!Number.isInteger(pageCount) || pageCount < 1) {
        throw new Error('Не удалось определить количество страниц PDF для OCR');
    }
    return pageCount;
};

const extractPdfTextWithOcr = async (
    buffer: Buffer,
    temporaryDirectory: string,
    maxCharacters: number,
): Promise<string> => {
    const pdfPath = path.join(temporaryDirectory, 'source.pdf');
    await writeFile(pdfPath, buffer);

    const totalPages = await getPdfPageCount(pdfPath);
    const maxPages = getPositiveInteger(process.env.OCR_MAX_PDF_PAGES, DEFAULT_MAX_PDF_PAGES);
    const pagesToProcess = Math.min(totalPages, maxPages);
    const extractedPages: string[] = [];
    let currentLength = 0;

    for (let pageNumber = 1; pageNumber <= pagesToProcess && currentLength < maxCharacters; pageNumber += 1) {
        const outputPrefix = path.join(temporaryDirectory, `page-${pageNumber}`);
        const imagePath = `${outputPrefix}.png`;
        await runCommand('pdftoppm', [
            '-f', String(pageNumber),
            '-l', String(pageNumber),
            '-singlefile',
            '-png',
            '-r', '160',
            '-scale-to', '2200',
            pdfPath,
            outputPrefix,
        ]);

        try {
            const pageText = (await recognizeImage(imagePath)).trim();
            if (pageText) {
                extractedPages.push(`Страница ${pageNumber}\n${pageText}`);
                currentLength += pageText.length;
            }
        } finally {
            await rm(imagePath, { force: true });
        }
    }

    if (totalPages > pagesToProcess && currentLength < maxCharacters) {
        extractedPages.push(`OCR обработал первые ${pagesToProcess} из ${totalPages} страниц из-за серверного лимита.`);
    }

    return extractedPages.join('\n\n');
};

const extractImageTextWithOcr = async (
    buffer: Buffer,
    temporaryDirectory: string,
): Promise<string> => {
    const imagePath = path.join(temporaryDirectory, 'source.png');
    await sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 })
        .rotate()
        .flatten({ background: '#ffffff' })
        .png()
        .toFile(imagePath);
    return recognizeImage(imagePath);
};

const removeTemporaryDirectory = async (temporaryDirectory: string): Promise<void> => {
    const resolvedDirectory = path.resolve(temporaryDirectory);
    const resolvedTemporaryRoot = path.resolve(os.tmpdir());
    if (!resolvedDirectory.startsWith(`${resolvedTemporaryRoot}${path.sep}`)) {
        throw new Error('Отказано в очистке OCR-каталога вне системной временной папки');
    }
    await rm(resolvedDirectory, { recursive: true, force: true });
};

const runOcr = async (buffer: Buffer, options: OcrOptions): Promise<string> => {
    if (!isOcrEnabled()) {
        throw new Error('OCR-распознавание отключено в конфигурации сервера');
    }

    const extension = path.extname(options.fileName).toLowerCase();
    const isPdf = extension === '.pdf' || options.mimeType === 'application/pdf';
    const isImage = IMAGE_EXTENSIONS.has(extension) || options.mimeType.startsWith('image/');
    if (!isPdf && !isImage) {
        throw new Error(`OCR не поддерживает формат ${extension || options.mimeType || 'не определен'}`);
    }

    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'tea-hub-ocr-'));
    try {
        const text = isPdf
            ? await extractPdfTextWithOcr(buffer, temporaryDirectory, options.maxCharacters)
            : await extractImageTextWithOcr(buffer, temporaryDirectory);
        return normalizeOcrText(text, options.maxCharacters);
    } finally {
        await removeTemporaryDirectory(temporaryDirectory);
    }
};

export const isOcrImage = (fileName: string, mimeType: string): boolean => {
    return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase()) || mimeType.startsWith('image/');
};

export function extractTextWithOcr(buffer: Buffer, options: OcrOptions): Promise<string> {
    const task = ocrQueue.then(() => runOcr(buffer, options));
    ocrQueue = task.then(() => undefined, () => undefined);
    return task;
}
