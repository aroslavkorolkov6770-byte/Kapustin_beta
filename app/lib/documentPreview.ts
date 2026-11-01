export type DocumentPreviewKind = 'docx' | 'pdf' | 'image' | 'video' | 'audio' | 'text' | 'office' | 'unsupported' | 'unknown';

const TEXT_EXTENSIONS = new Set([
    'txt', 'text', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'ndjson',
    'xml', 'xsd', 'xsl', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'config',
    'properties', 'env', 'log', 'sql', 'graphql', 'gql', 'html', 'htm', 'css',
    'scss', 'sass', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'java',
    'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'php', 'rb', 'swift', 'kt',
    'kts', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'dockerfile', 'gitignore',
]);

const OFFICE_TEXT_EXTENSIONS = new Set([
    'xls', 'xlsx', 'xlsm', 'xlsb', 'ods', 'pptx', 'odt', 'odp', 'rtf',
]);

const UNSUPPORTED_BINARY_EXTENSIONS = new Set([
    'doc', 'ppt', 'zip', 'rar', '7z', 'gz', 'tar', 'exe', 'msi', 'dmg', 'iso',
]);

const BINARY_SIGNATURES = [
    [0x25, 0x50, 0x44, 0x46],
    [0x50, 0x4b, 0x03, 0x04],
    [0xd0, 0xcf, 0x11, 0xe0],
    [0x89, 0x50, 0x4e, 0x47],
    [0xff, 0xd8, 0xff],
    [0x47, 0x49, 0x46, 0x38],
    [0x52, 0x49, 0x46, 0x46],
];

export const getFileExtension = (fileName: string) => {
    const normalizedName = String(fileName || '').trim().toLowerCase();
    const lastDotIndex = normalizedName.lastIndexOf('.');
    return lastDotIndex >= 0 ? normalizedName.slice(lastDotIndex + 1) : normalizedName;
};

export const getDocumentPreviewKind = (fileName: string): DocumentPreviewKind => {
    const extension = getFileExtension(fileName);
    if (extension === 'docx') return 'docx';
    if (extension === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(extension)) return 'image';
    if (['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(extension)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(extension)) return 'audio';
    if (TEXT_EXTENSIONS.has(extension)) return 'text';
    if (OFFICE_TEXT_EXTENSIONS.has(extension)) return 'office';
    if (UNSUPPORTED_BINARY_EXTENSIONS.has(extension)) return 'unsupported';
    return 'unknown';
};

const startsWithSignature = (bytes: Uint8Array, signature: number[]) => {
    if (bytes.length < signature.length) return false;
    return signature.every((value, index) => bytes[index] === value);
};

const hasKnownBinarySignature = (bytes: Uint8Array) => BINARY_SIGNATURES.some((signature) => startsWithSignature(bytes, signature));

const isProbablyText = (value: string) => {
    if (!value.trim()) return true;

    const sample = value.slice(0, 50_000);
    let controlCharacters = 0;
    let replacementCharacters = 0;

    for (const character of sample) {
        const code = character.charCodeAt(0);
        if (character === '\uFFFD') replacementCharacters += 1;
        if ((code >= 0 && code < 9) || (code > 13 && code < 32)) controlCharacters += 1;
    }

    return controlCharacters / sample.length < 0.015 && replacementCharacters / sample.length < 0.02;
};

const decodeWithEncoding = (bytes: Uint8Array, encoding: string, fatal = false) => {
    try {
        return new TextDecoder(encoding, { fatal }).decode(bytes);
    } catch {
        return '';
    }
};

export const decodeTextBytes = (bytes: Uint8Array): string | null => {
    if (bytes.length === 0) return '';
    if (hasKnownBinarySignature(bytes)) return null;

    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        const decoded = decodeWithEncoding(bytes.slice(3), 'utf-8');
        return isProbablyText(decoded) ? decoded : null;
    }

    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        const decoded = decodeWithEncoding(bytes.slice(2), 'utf-16le');
        return isProbablyText(decoded) ? decoded : null;
    }

    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        const decoded = decodeWithEncoding(bytes.slice(2), 'utf-16be');
        return isProbablyText(decoded) ? decoded : null;
    }

    const sampleLength = Math.min(bytes.length, 4096);
    let evenZeroes = 0;
    let oddZeroes = 0;
    let suspiciousBytes = 0;

    for (let index = 0; index < sampleLength; index += 1) {
        const value = bytes[index];
        if (value === 0) {
            if (index % 2 === 0) evenZeroes += 1;
            else oddZeroes += 1;
        }
        if ((value >= 0 && value < 9) || (value > 13 && value < 32)) suspiciousBytes += 1;
    }

    const pairs = Math.max(1, Math.floor(sampleLength / 2));
    if (oddZeroes / pairs > 0.2 && evenZeroes / pairs < 0.05) {
        const decoded = decodeWithEncoding(bytes, 'utf-16le');
        return isProbablyText(decoded) ? decoded : null;
    }
    if (evenZeroes / pairs > 0.2 && oddZeroes / pairs < 0.05) {
        const decoded = decodeWithEncoding(bytes, 'utf-16be');
        return isProbablyText(decoded) ? decoded : null;
    }
    if (suspiciousBytes / sampleLength > 0.02) return null;

    const utf8Text = decodeWithEncoding(bytes, 'utf-8', true);
    if (utf8Text && isProbablyText(utf8Text)) return utf8Text;

    const windows1251Text = decodeWithEncoding(bytes, 'windows-1251');
    if (windows1251Text && isProbablyText(windows1251Text)) return windows1251Text;

    const windows1252Text = decodeWithEncoding(bytes, 'windows-1252');
    return windows1252Text && isProbablyText(windows1252Text) ? windows1252Text : null;
};

export const dataUrlToBytes = (dataUrl: string) => {
    const separatorIndex = dataUrl.indexOf(',');
    if (separatorIndex < 0) throw new Error('Некорректные данные файла');

    const metadata = dataUrl.slice(0, separatorIndex);
    const payload = dataUrl.slice(separatorIndex + 1);
    if (metadata.includes(';base64')) {
        const binary = atob(payload);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
    }

    return new TextEncoder().encode(decodeURIComponent(payload));
};

export const decodeTextDataUrl = (dataUrl: string) => decodeTextBytes(dataUrlToBytes(dataUrl));

export const dataUrlToBlobUrl = (dataUrl: string) => {
    const metadata = dataUrl.slice(0, dataUrl.indexOf(','));
    const mimeMatch = metadata.match(/^data:([^;,]+)/i);
    const mimeType = mimeMatch?.[1] || 'application/octet-stream';
    return URL.createObjectURL(new Blob([dataUrlToBytes(dataUrl)], { type: mimeType }));
};

export const getDataUrlMimeType = (dataUrl: string) => {
    const metadata = dataUrl.slice(0, dataUrl.indexOf(','));
    return metadata.match(/^data:([^;,]+)/i)?.[1] || 'application/octet-stream';
};
