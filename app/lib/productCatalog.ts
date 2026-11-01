export type CatalogProduct = {
    id: string;
    code: string;
    groupPath: string;
    category: string;
    subcategory: string;
    name: string;
    priority: string;
    desc: string;
    isHit: boolean;
    isHidden: boolean;
    dateAdded: string;
};

type HeaderMap = Partial<Record<"code" | "groupPath" | "name" | "priority" | "desc" | "category" | "subcategory" | "isHit" | "isHidden" | "dateAdded", number>>;

const HEADER_ALIASES: Record<keyof HeaderMap, string[]> = {
    code: ["код", "артикул"],
    groupPath: ["группы", "группа", "путь группы", "группировка"],
    name: ["наименование", "название", "название товара"],
    priority: ["приоритет"],
    desc: ["описание", "desc"],
    category: ["категория"],
    subcategory: ["подкатегория", "субкатегория"],
    isHit: ["хит", "хит продаж", "обязательно к продаже"],
    isHidden: ["скрыт", "скрытый", "скрыто"],
    dateAdded: ["дата добавления", "дата"],
};

const cleanString = (value: unknown) => (value ?? "").toString().trim();

const normalizeBoolean = (value: unknown) => {
    const normalized = cleanString(value).toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "да" || normalized === "yes";
};

const stripOrderPrefix = (value: string) => value.replace(/^\d+\s*/u, "").trim();

export const parseGroupPath = (groupPath: string) => {
    const segments = cleanString(groupPath)
        .split("/")
        .map((segment) => stripOrderPrefix(segment))
        .filter(Boolean);

    const withoutRoot = segments[0]?.toLowerCase() === "товары" ? segments.slice(1) : segments;
    const category = withoutRoot[0] || "";
    const subcategorySegments = withoutRoot.slice(1);
    const subcategory = subcategorySegments.join(" / ");

    return {
        segments,
        category,
        subcategory,
        shortPath: withoutRoot.join(" / "),
    };
};

export const normalizeProduct = (rawProduct: any): CatalogProduct => {
    const legacyGroupPath = cleanString(rawProduct.groupPath || rawProduct.groups || rawProduct.group || "");
    const groupMeta = parseGroupPath(legacyGroupPath);

    const legacyCategory = cleanString(rawProduct.category);
    const legacySubcategory = cleanString(rawProduct.subcategory);
    const productName = cleanString(rawProduct.name || rawProduct.title);
    const categoryLooksLikeGroupPath = legacyCategory === legacyGroupPath && Boolean(legacyGroupPath);
    const subcategoryLooksLikeProductName = legacySubcategory === productName && Boolean(productName);

    const category = cleanString(
        categoryLooksLikeGroupPath
            ? (groupMeta.category || "")
            : (rawProduct.category || groupMeta.category || ""),
    );
    const subcategory = cleanString(
        subcategoryLooksLikeProductName
            ? (groupMeta.subcategory || "")
            : (rawProduct.subcategory || groupMeta.subcategory || (category && legacyCategory && legacyCategory !== category ? legacyCategory : "")),
    );

    return {
        id: cleanString(rawProduct.id),
        code: cleanString(rawProduct.code),
        groupPath: legacyGroupPath,
        category: category || (categoryLooksLikeGroupPath ? groupMeta.category : legacyCategory),
        subcategory: subcategory || (subcategoryLooksLikeProductName ? groupMeta.subcategory : legacySubcategory),
        name: productName,
        priority: cleanString(rawProduct.priority),
        desc: cleanString(rawProduct.desc || rawProduct.description),
        isHit: Boolean(rawProduct.isHit),
        isHidden: Boolean(rawProduct.isHidden),
        dateAdded: cleanString(rawProduct.dateAdded) || new Date().toLocaleDateString("ru-RU"),
    };
};

const findHeaderMap = (headers: string[]): HeaderMap => {
    const normalizedHeaders = headers.map((header) => cleanString(header).toLowerCase());
    const map: HeaderMap = {};

    (Object.keys(HEADER_ALIASES) as Array<keyof HeaderMap>).forEach((fieldName) => {
        const matchIndex = normalizedHeaders.findIndex((header) => HEADER_ALIASES[fieldName].includes(header));
        if (matchIndex !== -1) {
            map[fieldName] = matchIndex;
        }
    });

    return map;
};

const getCellByMap = (row: string[], map: HeaderMap, fieldName: keyof HeaderMap, fallbackIndex: number) => {
    const index = map[fieldName];
    if (typeof index === "number" && index >= 0) {
        return cleanString(row[index]);
    }
    return cleanString(row[fallbackIndex]);
};

export const importProductsFromRows = (rows: string[][], currentProducts: any[]) => {
    const normalizedCurrent = currentProducts.map((product) => normalizeProduct(product));
    const nextProducts = [...normalizedCurrent];

    if (rows.length === 0) {
        return { products: nextProducts, addedCount: 0, updatedCount: 0, skippedCount: 0 };
    }

    const headerMap = findHeaderMap(rows[0] || []);
    const dataRows = rows.slice(1);

    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    dataRows.forEach((row, index) => {
        const name = getCellByMap(row, headerMap, "name", 2);
        if (!name) {
            skippedCount += 1;
            return;
        }

        const importedDraft = normalizeProduct({
            code: getCellByMap(row, headerMap, "code", 0),
            groupPath: getCellByMap(row, headerMap, "groupPath", 1),
            name,
            priority: getCellByMap(row, headerMap, "priority", 4),
            desc: getCellByMap(row, headerMap, "desc", 5),
            category: getCellByMap(row, headerMap, "category", 1),
            subcategory: getCellByMap(row, headerMap, "subcategory", 2),
            isHit: normalizeBoolean(getCellByMap(row, headerMap, "isHit", 7)),
            isHidden: normalizeBoolean(getCellByMap(row, headerMap, "isHidden", 8)),
            dateAdded: getCellByMap(row, headerMap, "dateAdded", 9),
        });

        const existingIndex = nextProducts.findIndex((product) => {
            const sameCode = importedDraft.code && product.code && importedDraft.code === product.code;
            const sameName = importedDraft.name.toLowerCase() === product.name.toLowerCase();
            return sameCode || sameName;
        });

        if (existingIndex !== -1) {
            const existingProduct = nextProducts[existingIndex];
            nextProducts[existingIndex] = normalizeProduct({
                ...existingProduct,
                code: importedDraft.code || existingProduct.code,
                groupPath: importedDraft.groupPath || existingProduct.groupPath,
                category: importedDraft.category || existingProduct.category,
                subcategory: importedDraft.subcategory || existingProduct.subcategory,
                name: importedDraft.name || existingProduct.name,
                priority: importedDraft.priority || existingProduct.priority,
                desc: importedDraft.desc || existingProduct.desc,
                isHit: importedDraft.isHit || existingProduct.isHit,
                isHidden: importedDraft.isHidden || existingProduct.isHidden,
                dateAdded: existingProduct.dateAdded || importedDraft.dateAdded,
            });
            updatedCount += 1;
            return;
        }

        nextProducts.unshift(
            normalizeProduct({
                ...importedDraft,
                id: `prod_${Date.now()}_${index}`,
                dateAdded: importedDraft.dateAdded || new Date().toLocaleDateString("ru-RU"),
            }),
        );
        addedCount += 1;
    });

    return {
        products: nextProducts,
        addedCount,
        updatedCount,
        skippedCount,
    };
};

const escapeCsvValue = (value: unknown) => `"${cleanString(value).replace(/"/g, "\"\"")}"`;

export const exportProductsToCsv = (products: any[]) => {
    const normalizedProducts = products.map((product) => normalizeProduct(product));
    const header = [
        "Код",
        "Группы",
        "Категория",
        "Подкатегория",
        "Наименование",
        "Приоритет",
        "Описание",
        "Хит",
        "Скрыт",
    ].join(";");

    const body = normalizedProducts.map((product) =>
        [
            product.code,
            product.groupPath,
            product.category,
            product.subcategory,
            product.name,
            product.priority,
            product.desc,
            product.isHit ? "Да" : "Нет",
            product.isHidden ? "Да" : "Нет",
        ].map(escapeCsvValue).join(";"),
    );

    return `\uFEFF${[header, ...body].join("\n")}`;
};
