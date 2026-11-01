"use client";
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import readExcelFile from "read-excel-file/browser";
import CustomIcon from "../../components/CustomIcon";
import { saveDataToServer } from "@/app/lib/storageClient";
import {
    exportProductsToCsv,
    importProductsFromRows,
    normalizeProduct,
    parseGroupPath,
    type CatalogProduct,
} from "@/app/lib/productCatalog";

const STORAGE_KEYS = {
    PRODUCTS: "tea_hub_products_v1",
};
const PRODUCTS_CACHE_KEY = "tea_hub_products_cache_v1";
const PRODUCTS_VIEW_STATE_KEY = "tea_hub_products_view_state_v1";
const AI_SITE_CONTEXT_CACHE_KEY = "th_ai_site_context_v2";

const extractSegmentOrder = (value: string) => {
    const match = value.trim().match(/^(\d+)/u);
    return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
};

const compareOrderedLabels = (leftLabel: string, rightLabel: string, leftOrder?: number, rightOrder?: number) => {
    const leftRank = typeof leftOrder === "number" ? leftOrder : extractSegmentOrder(leftLabel);
    const rightRank = typeof rightOrder === "number" ? rightOrder : extractSegmentOrder(rightLabel);

    if (leftRank !== rightRank) {
        return leftRank - rightRank;
    }

    return leftLabel.localeCompare(rightLabel, "ru", { numeric: true });
};

const buildProductSearchText = (product: CatalogProduct) =>
    [
        product.name,
        product.code,
        product.category,
        product.subcategory,
        product.groupPath,
        product.priority,
        product.desc,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

const getCategoryLabel = (product: CatalogProduct) => product.category || "Без категории";

const getProductSecondaryLine = (product: CatalogProduct) => product.subcategory || product.groupPath || "Группа не указана";

const getMetaItems = (product: CatalogProduct) =>
    [
        product.code ? { label: "Код", value: product.code } : null,
        product.priority ? { label: "Приоритет", value: product.priority } : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;

type ProductTreeNode = {
    label: string;
    key: string;
    path: string[];
    count: number;
    sortIndex?: number;
    children: ProductTreeNode[];
};

type PreparedCatalogProduct = CatalogProduct & {
    searchText: string;
    pathSegments: string[];
    rawPathSegments: string[];
};

const getProductPathSegments = (product: CatalogProduct) => {
    const parsedGroup = parseGroupPath(product.groupPath);
    return [parsedGroup.category, ...parsedGroup.subcategory.split(" / ")].map((segment) => segment.trim()).filter(Boolean);
};

const getProductRawPathSegments = (product: CatalogProduct) =>
    String(product.groupPath || "")
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean)
        .slice(1);

const prepareProduct = (product: CatalogProduct): PreparedCatalogProduct => ({
    ...product,
    searchText: buildProductSearchText(product),
    pathSegments: getProductPathSegments(product),
    rawPathSegments: getProductRawPathSegments(product),
});

const parseDelimitedText = (source: string) => {
    const firstLine = source.split(/\r?\n/u).find((line) => line.trim()) || "";
    const delimiterCandidates = ["\t", ";", ","];
    const delimiter = delimiterCandidates.reduce((best, candidate) => {
        return firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best;
    }, ",");

    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let insideQuotes = false;

    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        const nextCharacter = source[index + 1];

        if (character === '"') {
            if (insideQuotes && nextCharacter === '"') {
                cell += '"';
                index += 1;
            } else {
                insideQuotes = !insideQuotes;
            }
            continue;
        }

        if (!insideQuotes && character === delimiter) {
            row.push(cell.trim());
            cell = "";
            continue;
        }

        if (!insideQuotes && (character === "\n" || character === "\r")) {
            if (character === "\r" && nextCharacter === "\n") {
                index += 1;
            }
            row.push(cell.trim());
            if (row.some(Boolean)) {
                rows.push(row);
            }
            row = [];
            cell = "";
            continue;
        }

        cell += character;
    }

    row.push(cell.trim());
    if (row.some(Boolean)) {
        rows.push(row);
    }

    return rows;
};

const insertTreeNode = (nodes: ProductTreeNode[], path: string[], rawPath: string[], depth = 0): ProductTreeNode[] => {
    if (depth >= path.length) {
        return nodes;
    }

    const label = path[depth];
    const sortIndex = extractSegmentOrder(rawPath[depth] || label);
    const existingNode = nodes.find((node) => node.label === label);

    if (existingNode) {
        existingNode.count += 1;
        if (typeof existingNode.sortIndex !== "number" || sortIndex < existingNode.sortIndex) {
            existingNode.sortIndex = sortIndex;
        }
        existingNode.children = insertTreeNode(existingNode.children, path, rawPath, depth + 1);
        return nodes;
    }

    const nextPath = path.slice(0, depth + 1);
    const newNode: ProductTreeNode = {
        label,
        key: nextPath.join("::"),
        path: nextPath,
        count: 1,
        sortIndex,
        children: insertTreeNode([], path, rawPath, depth + 1),
    };

    return [...nodes, newNode];
};

const sortTreeNodes = (nodes: ProductTreeNode[]): ProductTreeNode[] =>
    nodes
        .map((node) => ({ ...node, children: sortTreeNodes(node.children) }))
        .sort((left, right) => compareOrderedLabels(left.label, right.label, left.sortIndex, right.sortIndex));

const buildProductTree = (products: PreparedCatalogProduct[]) => {
    let tree: ProductTreeNode[] = [];

    products.forEach((product) => {
        const path = product.pathSegments;
        if (path.length > 0) {
            tree = insertTreeNode(tree, path, product.rawPathSegments);
        }
    });

    return sortTreeNodes(tree);
};

const isPathSelected = (candidatePath: string[], selectedPath: string[]) =>
    candidatePath.length === selectedPath.length && candidatePath.every((segment, index) => selectedPath[index] === segment);

const isPathPrefix = (candidatePath: string[], selectedPath: string[]) =>
    selectedPath.length > 0 && candidatePath.every((segment, index) => selectedPath[index] === segment);

const matchesSelectedPath = (product: PreparedCatalogProduct, selectedPath: string[]) =>
    selectedPath.length === 0 || selectedPath.every((segment, index) => product.pathSegments[index] === segment);

export default function Products({
    isAdmin,
}: {
    isAdmin: boolean;
    userId: string;
}) {
    const searchParams = useSearchParams();
    const [products, setProducts] = useState<CatalogProduct[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [successModal, setSuccessModal] = useState({ show: false, title: "", text: "" });
    const [errorModal, setErrorModal] = useState({ show: false, text: "" });
    const [selectedTreePath, setSelectedTreePath] = useState<string[]>([]);
    const [isSectionMenuOpen, setIsSectionMenuOpen] = useState(false);
    const [selectedHitPriority, setSelectedHitPriority] = useState<string>("all");
    const [showProductForm, setShowProductForm] = useState(false);
    const [productFormData, setProductFormData] = useState<CatalogProduct>(normalizeProduct({}));
    const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
    const [confirmClearAll, setConfirmClearAll] = useState(false);
    const [viewProduct, setViewProduct] = useState<CatalogProduct | null>(null);
    const [visibleCatalogCount, setVisibleCatalogCount] = useState(60);
    const hitScrollRef = useRef<HTMLDivElement | null>(null);
    const catalogScrollPositionRef = useRef(0);
    const handledProductParamRef = useRef("");
    const isViewStateHydratedRef = useRef(false);
    const deferredSearchQuery = useDeferredValue(searchQuery);

    const persistProducts = async (nextProducts: CatalogProduct[]) => {
        setProducts(nextProducts);

        if (typeof window !== "undefined") {
            window.localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(nextProducts));
            window.localStorage.removeItem(AI_SITE_CONTEXT_CACHE_KEY);
        }

        try {
            await saveDataToServer(STORAGE_KEYS.PRODUCTS, nextProducts);
        } catch (error) {
            console.error("Ошибка сохранения каталога товаров", error);
            setErrorModal({
                show: true,
                text: "Каталог сохранился только локально в браузере. Повторите действие, когда соединение станет стабильным.",
            });
        }
    };

    useEffect(() => {
        const loadProducts = async () => {
            try {
                if (typeof window !== "undefined") {
                    const cachedProducts = window.localStorage.getItem(PRODUCTS_CACHE_KEY);
                    if (cachedProducts) {
                        const parsedCache = JSON.parse(cachedProducts);
                        if (Array.isArray(parsedCache)) {
                            setProducts(parsedCache.map((product) => normalizeProduct(product)));
                        }
                    }

                    const cachedViewState = window.localStorage.getItem(PRODUCTS_VIEW_STATE_KEY);
                    if (cachedViewState) {
                        const parsedViewState = JSON.parse(cachedViewState);
                        if (parsedViewState && typeof parsedViewState === "object") {
                            if (typeof parsedViewState.searchQuery === "string") {
                                setSearchQuery(parsedViewState.searchQuery);
                            }
                            if (Array.isArray(parsedViewState.selectedTreePath)) {
                                setSelectedTreePath(parsedViewState.selectedTreePath.filter((segment: unknown) => typeof segment === "string"));
                            }
                            if (typeof parsedViewState.selectedHitPriority === "string") {
                                setSelectedHitPriority(parsedViewState.selectedHitPriority);
                            }
                        }
                    }

                    isViewStateHydratedRef.current = true;
                }

                const response = await fetch(`/api/storage?key=${STORAGE_KEYS.PRODUCTS}`, { cache: "no-store" });
                if (!response.ok) {
                    return;
                }

                const data = await response.json();
                if (Array.isArray(data)) {
                    const normalizedProducts = data.map((product) => normalizeProduct(product));
                    setProducts(normalizedProducts);
                    if (typeof window !== "undefined") {
                        window.localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(normalizedProducts));
                    }
                }
            } catch (error) {
                console.error("Ошибка загрузки продуктов", error);
            }
        };

        loadProducts();
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        setIsSectionMenuOpen(window.innerWidth > 768);
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        if (!isViewStateHydratedRef.current) {
            return;
        }

        window.localStorage.setItem(PRODUCTS_VIEW_STATE_KEY, JSON.stringify({
            searchQuery,
            selectedTreePath,
            selectedHitPriority,
        }));
    }, [searchQuery, selectedTreePath, selectedHitPriority]);

    const handleSaveProduct = async () => {
        if (!productFormData.name.trim()) {
            setErrorModal({ show: true, text: "Введите название товара." });
            return;
        }

        const normalizedProduct = normalizeProduct({
            ...productFormData,
            id: productFormData.id || `prod_${Date.now()}`,
            dateAdded: productFormData.dateAdded || new Date().toLocaleDateString("ru-RU"),
        });

        const nextProducts = productFormData.id
            ? products.map((product) => (product.id === productFormData.id ? normalizedProduct : product))
            : [normalizedProduct, ...products];

        await persistProducts(nextProducts);
        setShowProductForm(false);
        setProductFormData(normalizeProduct({}));
    };

    const executeDelete = async () => {
        const nextProducts = products.filter((product) => product.id !== confirmDelete.id);
        await persistProducts(nextProducts);
        setConfirmDelete({ isOpen: false, id: "", name: "" });
    };

    const executeClearAll = async () => {
        await persistProducts([]);
        setSelectedTreePath([]);
        setSelectedHitPriority("all");
        setConfirmClearAll(false);
        setSuccessModal({
            show: true,
            title: "Каталог очищен",
            text: "Все товары удалены из раздела продуктов. Данные выгрузки теперь можно загрузить заново.",
        });
    };

    const toggleHit = async (event: React.MouseEvent, id: string) => {
        event.stopPropagation();
        const nextProducts = products.map((product) => (product.id === id ? normalizeProduct({ ...product, isHit: !product.isHit }) : product));
        const changedProduct = nextProducts.find((product) => product.id === id);
        if (changedProduct) {
            setViewProduct((currentProduct) => currentProduct?.id === id ? changedProduct : currentProduct);
        }
        await persistProducts(nextProducts);
    };

    const toggleHidden = async (event: React.MouseEvent, id: string) => {
        event.stopPropagation();
        const nextProducts = products.map((product) => (product.id === id ? normalizeProduct({ ...product, isHidden: !product.isHidden }) : product));
        const changedProduct = nextProducts.find((product) => product.id === id);
        if (changedProduct) {
            setViewProduct((currentProduct) => currentProduct?.id === id ? changedProduct : currentProduct);
        }
        await persistProducts(nextProducts);
    };

    const openProductWorkspace = (product: CatalogProduct) => {
        if (typeof window !== "undefined") {
            catalogScrollPositionRef.current = window.scrollY;
        }
        setViewProduct(product);
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
    };

    const closeProductWorkspace = () => {
        setViewProduct(null);
        window.requestAnimationFrame(() => {
            window.scrollTo({ top: catalogScrollPositionRef.current, behavior: "auto" });
        });
    };

    const exportToCSV = () => {
        const csvContent = exportProductsToCsv(products);
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `products_export_${new Date().toLocaleDateString("ru-RU").replace(/\./g, "-")}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    };

    const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        try {
            const fileName = file.name.toLocaleLowerCase("ru-RU");
            const rows = fileName.endsWith(".csv")
                ? parseDelimitedText(await file.text())
                : (await readExcelFile(file))[0]?.data.map((row) => row.map((cell) => String(cell ?? "").trim())) || [];

            if (rows.length === 0) {
                setErrorModal({ show: true, text: "Не удалось найти строки с товарами в файле." });
                return;
            }

            const importResult = importProductsFromRows(rows, products);
            await persistProducts(importResult.products);

            setSuccessModal({
                show: true,
                title: "Импорт завершён",
                text: `Добавлено новых товаров: ${importResult.addedCount}. Обновлено существующих: ${importResult.updatedCount}. Пропущено пустых строк: ${importResult.skippedCount}.`,
            });
        } catch (error) {
            console.error("Ошибка импорта файла товаров", error);
            setErrorModal({
                show: true,
                text: "Не удалось обработать файл. Используйте .xlsx, .xlsm или CSV с колонками из выгрузки.",
            });
        } finally {
            event.target.value = "";
        }
    };

    const preparedProducts = useMemo(() => {
        const prepared = products.map((product) => prepareProduct(product));
        return prepared.sort((left, right) => {
            const leftSegments = left.rawPathSegments.length > 0 ? left.rawPathSegments : left.pathSegments;
            const rightSegments = right.rawPathSegments.length > 0 ? right.rawPathSegments : right.pathSegments;
            const maxLength = Math.max(leftSegments.length, rightSegments.length);

            for (let index = 0; index < maxLength; index += 1) {
                const leftSegment = leftSegments[index];
                const rightSegment = rightSegments[index];

                if (!leftSegment && rightSegment) {
                    return -1;
                }

                if (leftSegment && !rightSegment) {
                    return 1;
                }

                if (leftSegment && rightSegment) {
                    const result = compareOrderedLabels(leftSegment, rightSegment);
                    if (result !== 0) {
                        return result;
                    }
                }
            }

            const priorityResult = compareOrderedLabels(left.priority || "", right.priority || "");
            if (priorityResult !== 0) {
                return priorityResult;
            }

            return left.name.localeCompare(right.name, "ru");
        });
    }, [products]);

    const baseFiltered = useMemo(() => preparedProducts.filter((product) => isAdmin || !product.isHidden), [isAdmin, preparedProducts]);

    const categoryTree = useMemo(() => buildProductTree(baseFiltered), [baseFiltered]);

    const searchedProducts = useMemo(() => {
        const search = deferredSearchQuery.trim().toLowerCase();
        return baseFiltered.filter((product) => {
            const matchesSearch = !search || product.searchText.includes(search);
            const matchesCategory = matchesSelectedPath(product, selectedTreePath);
            return matchesSearch && matchesCategory;
        });
    }, [baseFiltered, deferredSearchQuery, selectedTreePath]);

    const visibleCatalogProducts = useMemo(() => searchedProducts.slice(0, visibleCatalogCount), [searchedProducts, visibleCatalogCount]);

    useEffect(() => {
        setVisibleCatalogCount(60);
    }, [deferredSearchQuery, selectedTreePath]);

    useEffect(() => {
        const targetProductId = searchParams.get("productId");
        if (!targetProductId || handledProductParamRef.current === targetProductId || preparedProducts.length === 0) {
            return;
        }

        const decodedTarget = decodeURIComponent(targetProductId).toLowerCase();
        const targetProduct = preparedProducts.find((product) => {
            return [product.id, product.code, product.name]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase() === decodedTarget);
        });

        if (!targetProduct) {
            return;
        }

        handledProductParamRef.current = targetProductId;
        setSelectedTreePath(targetProduct.pathSegments);
        setViewProduct(targetProduct);
    }, [preparedProducts, searchParams]);

    const hitProducts = useMemo(() => {
        const search = deferredSearchQuery.trim().toLowerCase();
        return baseFiltered.filter((product) => product.isHit && (!search || product.searchText.includes(search)));
    }, [baseFiltered, deferredSearchQuery]);

    const hitPriorityOptions = useMemo(() => {
        const priorities = Array.from(new Set(hitProducts.map((product) => product.priority).filter(Boolean)));
        return priorities.sort((left, right) => {
            const leftNum = Number(left);
            const rightNum = Number(right);
            if (!Number.isNaN(leftNum) && !Number.isNaN(rightNum)) {
                return leftNum - rightNum;
            }
            return left.localeCompare(right, "ru");
        });
    }, [hitProducts]);

    const visibleHitProducts = useMemo(() => {
        if (selectedHitPriority === "all") {
            return hitProducts;
        }
        return hitProducts.filter((product) => product.priority === selectedHitPriority);
    }, [hitProducts, selectedHitPriority]);

    useEffect(() => {
        if (selectedHitPriority !== "all" && !hitPriorityOptions.includes(selectedHitPriority)) {
            setSelectedHitPriority("all");
        }
    }, [hitPriorityOptions, selectedHitPriority]);

    const scrollHitProducts = (direction: "prev" | "next") => {
        if (!hitScrollRef.current) {
            return;
        }

        const firstCard = hitScrollRef.current.querySelector<HTMLElement>(".hit-card");
        const containerStyles = window.getComputedStyle(hitScrollRef.current);
        const gapValue = Number.parseFloat(containerStyles.columnGap || containerStyles.gap || "0");
        const fallbackStep = typeof window !== "undefined" && window.innerWidth <= 768 ? 272 : 340;
        const scrollStep = firstCard ? firstCard.offsetWidth + gapValue : fallbackStep;

        hitScrollRef.current.scrollBy({
            left: direction === "next" ? scrollStep : -scrollStep,
            behavior: "smooth",
        });
    };

    const selectedSectionLabel = selectedTreePath[selectedTreePath.length - 1] || "Все разделы";
    const hiddenProductsCount = isAdmin ? preparedProducts.filter((product) => product.isHidden).length : 0;
    const catalogOverview = [
        { label: "Всего товаров", value: baseFiltered.length, icon: "material" as const },
        { label: "Разделов", value: categoryTree.length, icon: "folder" as const },
        { label: "Обязательных", value: hitProducts.length, icon: "flame" as const },
        ...(isAdmin ? [{ label: "Скрыто", value: hiddenProductsCount, icon: "hidden" as const }] : []),
    ];

    if (viewProduct && !showProductForm) {
        const productStatus = viewProduct.isHidden
            ? "Скрыт от сотрудников"
            : viewProduct.isHit
                ? "Обязательный товар"
                : "Доступен команде";

        return (
            <section className="vates-products-screen vates-product-workspace">
                <header className="vates-product-workspace-header">
                    <button type="button" className="hover-unified-app vates-button secondary vates-product-workspace-back" onClick={closeProductWorkspace}>
                        <CustomIcon name="arrow-left" size={17} color="currentColor" accent="none" />
                        К товарам
                    </button>
                    <span className={`vates-product-workspace-status ${viewProduct.isHidden ? "is-hidden" : viewProduct.isHit ? "is-required" : ""}`}>
                        {productStatus}
                    </span>
                </header>

                <section className="vates-product-workspace-hero">
                    <span className="vates-eyebrow">Карточка товара</span>
                    <p>{getCategoryLabel(viewProduct)}</p>
                    <h1>{viewProduct.name}</h1>
                    <span>{getProductSecondaryLine(viewProduct)}</span>
                </section>

                <div className="vates-product-workspace-layout">
                    <main className="vates-product-workspace-main">
                        <section className="vates-product-workspace-card">
                            <span className="vates-eyebrow">Описание</span>
                            <h2>Информация для команды</h2>
                            <p>{viewProduct.desc || "Описание товара пока не заполнено."}</p>
                        </section>

                        <section className="vates-product-workspace-card">
                            <span className="vates-eyebrow">Размещение в каталоге</span>
                            <h2>Путь и группа</h2>
                            <p>{viewProduct.groupPath || "Группа для этого товара пока не указана."}</p>
                        </section>
                    </main>

                    <aside className="vates-product-workspace-aside">
                        <section className="vates-product-workspace-card vates-product-workspace-facts">
                            <span className="vates-eyebrow">Параметры</span>
                            <h2>Сводка</h2>
                            <dl>
                                <div><dt>Код</dt><dd>{viewProduct.code || "Не указан"}</dd></div>
                                <div><dt>Приоритет</dt><dd>{viewProduct.priority || "Не указан"}</dd></div>
                                <div><dt>Категория</dt><dd>{getCategoryLabel(viewProduct)}</dd></div>
                                <div><dt>Статус</dt><dd>{productStatus}</dd></div>
                            </dl>
                        </section>

                        {isAdmin && (
                            <section className="vates-product-workspace-card vates-product-workspace-actions">
                                <span className="vates-eyebrow">Управление</span>
                                <h2>Действия администратора</h2>
                                <button
                                    type="button"
                                    className="hover-unified-app vates-button primary"
                                    onClick={() => {
                                        setProductFormData(normalizeProduct(viewProduct));
                                        setViewProduct(null);
                                        setShowProductForm(true);
                                    }}
                                >
                                    <CustomIcon name="edit" size={16} color="currentColor" />
                                    Редактировать товар
                                </button>
                                <button type="button" className="hover-unified-app vates-button secondary" onClick={(event) => toggleHit(event, viewProduct.id)}>
                                    <CustomIcon name={viewProduct.isHit ? "flame" : "star"} size={16} color="currentColor" />
                                    {viewProduct.isHit ? "Убрать из обязательных" : "Добавить в обязательные"}
                                </button>
                                <button type="button" className="hover-unified-app vates-button secondary" onClick={(event) => toggleHidden(event, viewProduct.id)}>
                                    <CustomIcon name={viewProduct.isHidden ? "eye" : "hidden"} size={16} color="currentColor" />
                                    {viewProduct.isHidden ? "Показать сотрудникам" : "Скрыть от сотрудников"}
                                </button>
                            </section>
                        )}
                    </aside>
                </div>
            </section>
        );
    }

    return (
        <section className="vates-products-screen">
            <div className="vates-page-heading vates-products-heading">
                <div>
                    <span className="vates-eyebrow">Каталог компании</span>
                    <h1>Товары</h1>
                    <p>Управляйте каталогом, категориями и приоритетами для команды.</p>
                </div>

                {isAdmin && (
                    <div className="vates-products-heading-actions">
                        <button className="hover-unified-app vates-button secondary" onClick={exportToCSV}>
                            <CustomIcon name="download" size={16} color="currentColor" /> Экспорт CSV
                        </button>
                        <input type="file" accept=".csv,.xlsx,.xlsm" id="products-upload" style={{ display: "none" }} onChange={handleImportFile} />
                        <button className="hover-unified-app vates-button secondary" onClick={() => document.getElementById("products-upload")?.click()}>
                            <CustomIcon name="upload" size={16} color="currentColor" /> Импорт файла
                        </button>
                        <button
                            onClick={() => {
                                setProductFormData(normalizeProduct({}));
                                setShowProductForm(true);
                            }}
                            className="hover-unified-app vates-button primary"
                        >
                            <CustomIcon name="material" size={16} color="currentColor" accent="none" /> Новый товар
                        </button>
                        <button
                            onClick={() => setConfirmClearAll(true)}
                            className="hover-unified-app vates-button secondary danger"
                        >
                            <CustomIcon name="close" size={15} color="currentColor" /> Очистить
                        </button>
                    </div>
                )}
            </div>

            <div className="vates-products-overview" aria-label="Сводка по каталогу">
                {catalogOverview.map((item) => (
                    <div className="vates-products-overview-item" key={item.label}>
                        <span className="vates-products-overview-icon">
                            <CustomIcon name={item.icon} size={19} color="currentColor" accent="none" />
                        </span>
                        <span>
                            <strong>{item.value.toLocaleString("ru-RU")}</strong>
                            <small>{item.label}</small>
                        </span>
                    </div>
                ))}
            </div>

            <div className="vates-products-toolbar">
                <label className="vates-products-search">
                    <span className="vates-products-search-icon">
                        <SearchIcon />
                    </span>
                    <input
                        type="text"
                        placeholder="Найти товар, код или категорию"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="vates-products-search-input"
                    />
                </label>
                <div className="vates-products-result-summary">
                    <span>{selectedSectionLabel}</span>
                    <strong>{searchedProducts.length.toLocaleString("ru-RU")}</strong>
                </div>
            </div>

            <div className="products-layout-shell" style={{ display: "grid", gridTemplateColumns: categoryTree.length > 0 ? "280px minmax(0, 1fr)" : "1fr", gap: "24px", alignItems: "start" }}>
                {categoryTree.length > 0 && (
                    <aside className="products-sidebar">
                        <div className="products-sidebar-head" style={{ marginBottom: isSectionMenuOpen ? "12px" : 0 }}>
                            <button
                                className="hover-unified-app products-sidebar-toggle"
                                onClick={() => setIsSectionMenuOpen((prev) => !prev)}
                            >
                                <div className="products-sidebar-title">
                                    <span className="products-sidebar-title-icon"><CustomIcon name="folder" size={18} color="currentColor" accent="none" /></span>
                                    <span>
                                        <small>Разделы каталога</small>
                                        <strong>{selectedSectionLabel}</strong>
                                    </span>
                                </div>
                                <span className="products-sidebar-state" aria-hidden="true">{isSectionMenuOpen ? "−" : "+"}</span>
                            </button>
                        </div>

                        <div className={`products-sidebar-content ${isSectionMenuOpen ? "open" : ""}`} style={{ display: isSectionMenuOpen ? "block" : "none" }}>
                            <button
                                className={`products-category-button hover-unified-app ${selectedTreePath.length === 0 ? "is-selected" : ""}`}
                                onClick={() => setSelectedTreePath([])}
                            >
                                <span>Все разделы</span>
                                <strong>{baseFiltered.length.toLocaleString("ru-RU")}</strong>
                            </button>

                            <div className="products-sidebar-tree">
                                {categoryTree.map((node) => (
                                    <SidebarSectionNode key={node.key} node={node} selectedTreePath={selectedTreePath} setSelectedTreePath={setSelectedTreePath} />
                                ))}
                            </div>
                        </div>
                    </aside>
                )}

                <div className="vates-products-catalog" style={{ minWidth: 0 }}>
                    {hitProducts.length > 0 && (
                        <div
                            className="products-hit-section"
                            style={{
                                background: "linear-gradient(135deg, rgba(255,215,0,0.05) 0%, rgba(0,0,0,0) 100%)",
                                border: "1px solid rgba(255,215,0,0.2)",
                                borderRadius: "25px",
                                padding: "30px",
                                marginBottom: "40px",
                                boxShadow: "0 10px 30px rgba(255,215,0,0.03)",
                            }}
                        >
                            <div className="hits-header-row">
                                <div className="hits-heading-copy">
                                    <span className="hits-heading-icon"><CustomIcon name="flame" size={21} color="currentColor" /></span>
                                    <span>
                                        <small>Фокус команды</small>
                                        <h3>Обязательно к продаже</h3>
                                    </span>
                                </div>
                                <div className="hits-header-controls">
                                    <span className="hits-product-count" aria-label={`Обязательных товаров: ${hitProducts.length}`}>
                                        <strong>{hitProducts.length}</strong>
                                        <small>в подборке</small>
                                    </span>
                                    {visibleHitProducts.length > 1 && (
                                        <div className="hit-scroll-actions">
                                            <button
                                                type="button"
                                                aria-label="Прокрутить обязательные товары назад"
                                                className="hover-unified-app hit-scroll-button"
                                                onClick={() => scrollHitProducts("prev")}
                                                style={{ background: "#151515", color: "#ffd700", border: "1px solid rgba(255,215,0,0.3)", borderRadius: "14px", width: "42px", height: "42px", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "20px", fontWeight: "900", lineHeight: 1 }}
                                            >
                                                ‹
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Прокрутить обязательные товары вперёд"
                                                className="hover-unified-app hit-scroll-button"
                                                onClick={() => scrollHitProducts("next")}
                                                style={{ background: "#151515", color: "#ffd700", border: "1px solid rgba(255,215,0,0.3)", borderRadius: "14px", width: "42px", height: "42px", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "20px", fontWeight: "900", lineHeight: 1 }}
                                            >
                                                ›
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {hitPriorityOptions.length > 1 && (
                                <div className="hit-priority-switcher custom-scroll" style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "8px", marginBottom: "18px" }}>
                                    <button
                                        className={`product-priority-filter hover-unified-app ${selectedHitPriority === null ? "is-selected" : ""}`}
                                        onClick={() => setSelectedHitPriority("all")}
                                        style={{ background: selectedHitPriority === "all" ? "rgba(255,215,0,0.16)" : "#151515", color: selectedHitPriority === "all" ? "#ffd700" : "#bdbdbd", border: `1px solid ${selectedHitPriority === "all" ? "rgba(255,215,0,0.42)" : "#2a2a2a"}`, borderRadius: "999px", padding: "9px 14px", fontSize: "12px", fontWeight: "900", cursor: "pointer", whiteSpace: "nowrap" }}
                                    >
                                        Все приоритеты
                                    </button>
                                    {hitPriorityOptions.map((priority) => (
                                        <button
                                            key={priority}
                                            className={`product-priority-filter hover-unified-app ${selectedHitPriority === priority ? "is-selected" : ""}`}
                                            onClick={() => setSelectedHitPriority(priority)}
                                            style={{ background: selectedHitPriority === priority ? "rgba(255,215,0,0.16)" : "#151515", color: selectedHitPriority === priority ? "#ffd700" : "#bdbdbd", border: `1px solid ${selectedHitPriority === priority ? "rgba(255,215,0,0.42)" : "#2a2a2a"}`, borderRadius: "999px", padding: "9px 14px", fontSize: "12px", fontWeight: "900", cursor: "pointer", whiteSpace: "nowrap" }}
                                        >
                                            Приоритет {priority}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div ref={hitScrollRef} className="hits-scroll-container custom-scroll" style={{ display: "flex", overflowX: "auto", gap: "16px", padding: "10px 0 20px 0", margin: "-10px 0 0 0", scrollSnapType: "x mandatory" }}>
                                {visibleHitProducts.map((product) => {
                                    const metaItems = getMetaItems(product);
                                    return (
                                        <div
                                            key={`hit-${product.id}`}
                                            className="premium-card hit-card product-hit-card"
                                            onClick={() => openProductWorkspace(product)}
                                            style={{
                                                minWidth: "100%",
                                                width: "100%",
                                                maxWidth: "100%",
                                                flex: "0 0 100%",
                                                padding: "25px",
                                                scrollSnapAlign: "start",
                                                opacity: product.isHidden ? 0.4 : 1,
                                                filter: product.isHidden ? "grayscale(100%)" : "none",
                                                background: "#111",
                                                border: "1px solid rgba(255,215,0,0.4)",
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "stretch",
                                                justifyContent: "flex-start",
                                            }}
                                        >
                                    {isAdmin && (
                                        <div className="product-card-actions product-card-actions-hit" style={{ display: "flex", gap: "8px", zIndex: 10, flexWrap: "wrap", justifyContent: "flex-end", marginBottom: "14px" }}>
                                            <div onClick={(event) => toggleHit(event, product.id)} className="admin-action-icon" style={{ ...textIconStyle, background: "rgba(0,0,0,0.8)", color: "#ffd700", border: "1px solid #ffd700" } as any} title="Убрать из обязательных">
                                                <CustomIcon name="flame" size={16} color="#ffd700" />
                                            </div>
                                            <div onClick={(event) => toggleHidden(event, product.id)} className="admin-action-icon" style={{ ...textIconStyle, background: "rgba(0,0,0,0.8)", color: product.isHidden ? "#ff4d4d" : "#0abab5" } as any} title={product.isHidden ? "Показать сотрудникам" : "Скрыть от сотрудников"}>
                                                <CustomIcon name={product.isHidden ? "hidden" : "eye"} size={16} color={product.isHidden ? "#ff4d4d" : "#0abab5"} />
                                            </div>
                                        </div>
                                    )}

                                    <div className="product-card-body" style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "132px" }}>
                                        <h4 className="product-card-title" style={{ fontSize: "18px", margin: 0, fontWeight: "bold", color: "#fff", lineHeight: "1.3" }}>{product.name}</h4>

                                        {metaItems.length > 0 && (
                                            <div className="product-meta-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px", marginTop: "16px" }}>
                                                {metaItems.map((item) => (
                                                    <div key={`${product.id}-${item.label}`} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "6px 10px" }}>
                                                        <div style={{ fontSize: "10px", color: "#8f8f8f", marginBottom: "2px" }}>{item.label}</div>
                                                        <div style={{ fontSize: "12px", color: "#fff", fontWeight: "800" }}>{item.value}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="product-card-footer" style={{ marginTop: "18px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "16px", minWidth: "auto" }}>
                                        <div className="vates-product-hit-status">
                                            <CustomIcon name="flame" size={18} color="currentColor" />
                                            <span>
                                                <strong>Обязательный ассортимент</strong>
                                                <small>В фокусе продаж</small>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="vates-products-catalog-heading">
                        <div>
                            <span className="vates-eyebrow">Товарная база</span>
                            <h3>{selectedTreePath.length > 0 ? selectedTreePath[selectedTreePath.length - 1] : "Весь каталог"}</h3>
                        </div>
                        <span className="vates-products-catalog-count">{searchedProducts.length.toLocaleString("ru-RU")} позиций</span>
                    </div>

                    <div className="premium-cards-container">
                        {searchedProducts.length === 0 ? (
                            <div className="vates-products-empty">
                                <CustomIcon name="material" size={26} color="currentColor" accent="none" />
                                <strong>Товары не найдены</strong>
                                <span>Измените запрос или выберите другой раздел.</span>
                            </div>
                        ) : (
                            visibleCatalogProducts.map((product) => {
                                const metaItems = getMetaItems(product);
                                return (
                                    <article key={product.id} className={`premium-card product-card ${product.isHidden ? "is-hidden" : ""}`} onClick={() => openProductWorkspace(product)}>
                                <div className="product-card-topline">
                                    <div className="product-card-category">
                                        <span><CustomIcon name="material" size={16} color="currentColor" accent="none" /></span>
                                        <div>
                                            <small>Категория</small>
                                            <strong>{getProductSecondaryLine(product)}</strong>
                                        </div>
                                    </div>
                                    {isAdmin && (
                                        <div className="product-card-actions">
                                            <button type="button" onClick={(event) => toggleHit(event, product.id)} className={`admin-action-icon ${product.isHit ? "is-active-warning" : ""}`} title="В обязательные">
                                                <CustomIcon name={product.isHit ? "flame" : "star"} size={16} color="currentColor" />
                                            </button>
                                            <button type="button" onClick={(event) => toggleHidden(event, product.id)} className={`admin-action-icon ${product.isHidden ? "is-active-danger" : "is-active"}`} title="Скрыть или показать">
                                                <CustomIcon name={product.isHidden ? "hidden" : "eye"} size={16} color="currentColor" />
                                            </button>
                                            <button type="button" onClick={(event) => { event.stopPropagation(); setProductFormData(normalizeProduct(product)); setShowProductForm(true); }} className="admin-action-icon is-active" title="Редактировать">
                                                <CustomIcon name="edit" size={16} color="currentColor" />
                                            </button>
                                            <button type="button" onClick={(event) => { event.stopPropagation(); setConfirmDelete({ isOpen: true, id: product.id, name: product.name }); }} className="admin-action-icon is-active-danger" title="Удалить">
                                                <CustomIcon name="close" size={16} color="currentColor" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="product-card-body">
                                    <h4 className="product-card-title">{product.name}</h4>
                                    <p className="product-card-description">{product.desc || "Описание товара пока не заполнено."}</p>
                                </div>

                                {metaItems.length > 0 && (
                                    <div className="product-meta-grid">
                                        {metaItems.map((item) => (
                                            <div key={`${product.id}-${item.label}`}>
                                                <div>{item.label}</div>
                                                <div>{item.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="product-card-footer">
                                    <span className={product.isHidden ? "is-hidden" : product.isHit ? "is-required" : ""}>
                                        {product.isHidden ? "Скрыт от сотрудников" : product.isHit ? "Обязательный товар" : "Доступен команде"}
                                    </span>
                                    <strong>Открыть карточку</strong>
                                </div>
                            </article>
                                );
                            })
                        )}
                    </div>

                    {searchedProducts.length > visibleCatalogCount && (
                        <div style={{ display: "flex", justifyContent: "center", marginTop: "20px" }}>
                            <button
                                className="hover-unified-app"
                                onClick={() => setVisibleCatalogCount((prev) => prev + 60)}
                                style={{ ...adminActionBtn, minWidth: "220px" } as any}
                            >
                                ПОКАЗАТЬ ЕЩЕ
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {showProductForm && (
                <div style={modalOverlay as any} onClick={() => setShowProductForm(false)}>
                    <div className="tasks-modal custom-scroll" style={{ ...modalContentMedium, margin: "0 auto", maxHeight: "90vh", overflowY: "auto" } as any} onClick={(event) => event.stopPropagation()}>
                        <h2 style={{ textAlign: "center", marginBottom: "25px", color: "#0abab5", fontWeight: "900", textTransform: "uppercase" }}>
                            {productFormData.id ? "Редактировать товар" : "Новый товар"}
                        </h2>

                        <div style={{ display: "flex", flexDirection: "column", gap: "15px", marginBottom: "25px" }}>
                            <div>
                                <div style={{ fontSize: "11px", color: "#888", fontWeight: "bold", marginBottom: "5px", marginLeft: "5px" }}>Наименование *</div>
                                <input style={adminIn as any} placeholder="Например: Те Гуань Инь Ван" value={productFormData.name} onChange={(event) => setProductFormData(normalizeProduct({ ...productFormData, name: event.target.value }))} />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                                <div>
                                    <div style={{ fontSize: "11px", color: "#888", fontWeight: "bold", marginBottom: "5px", marginLeft: "5px" }}>Код</div>
                                    <input type="text" style={adminIn as any} placeholder="Например: 1022" value={productFormData.code} onChange={(event) => setProductFormData(normalizeProduct({ ...productFormData, code: event.target.value }))} />
                                </div>
                                <div>
                                    <div style={{ fontSize: "11px", color: "#888", fontWeight: "bold", marginBottom: "5px", marginLeft: "5px" }}>Приоритет</div>
                                    <input type="text" style={adminIn as any} placeholder="1" value={productFormData.priority} onChange={(event) => setProductFormData(normalizeProduct({ ...productFormData, priority: event.target.value }))} />
                                </div>
                            </div>

                            <div>
                                <div style={{ fontSize: "11px", color: "#888", fontWeight: "bold", marginBottom: "5px", marginLeft: "5px" }}>Группы</div>
                                <input
                                    style={adminIn as any}
                                    placeholder="01 ТОВАРЫ/01 ЧАЙ/01 Весовой/классический/01 Китай"
                                    value={productFormData.groupPath}
                                    onChange={(event) => setProductFormData(normalizeProduct({ ...productFormData, groupPath: event.target.value }))}
                                />
                                {(productFormData.category || productFormData.subcategory) && (
                                    <div style={{ marginTop: "8px", marginLeft: "6px", fontSize: "12px", color: "#666", lineHeight: 1.5 }}>
                                        <div>Категория: <span style={{ color: "#0abab5" }}>{productFormData.category || "—"}</span></div>
                                        <div>Подкатегория: <span style={{ color: "#fff" }}>{productFormData.subcategory || "—"}</span></div>
                                    </div>
                                )}
                            </div>

                            <div>
                                <div style={{ fontSize: "11px", color: "#888", fontWeight: "bold", marginBottom: "5px", marginLeft: "5px" }}>Описание</div>
                                <textarea style={{ ...adminIn, height: "140px", resize: "none" } as any} placeholder="Описание, вкус, особенности..." value={productFormData.desc} onChange={(event) => setProductFormData(normalizeProduct({ ...productFormData, desc: event.target.value }))} />
                            </div>
                        </div>

                        <button className="hover-unified-app" onClick={handleSaveProduct} style={saveBtn as any}>СОХРАНИТЬ ТОВАР</button>
                        <div className="hover-link-unified-app" onClick={() => setShowProductForm(false)} style={cancelLink as any}>ОТМЕНА</div>
                    </div>
                </div>
            )}

            {confirmDelete.isOpen && (
                <div style={modalOverlay as any} onClick={() => setConfirmDelete({ isOpen: false, id: "", name: "" })}>
                    <div style={{ ...modalContentSmall, textAlign: "center" } as any} onClick={(event) => event.stopPropagation()}>
                        <div style={{ width: "60px", height: "60px", borderRadius: "18px", border: "1px solid rgba(255,77,77,0.35)", background: "rgba(255,77,77,0.08)", color: "#ff4d4d", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px auto" }}>
                            <CustomIcon name="alert" size={34} color="#ff4d4d" />
                        </div>
                        <h2 style={{ color: "#ff4d4d", fontWeight: "900", marginBottom: "15px" }}>УДАЛИТЬ ТОВАР?</h2>
                        <p style={{ color: "#ccc", fontSize: "14px", marginBottom: "25px" }}>Вы уверены, что хотите безвозвратно удалить "{confirmDelete.name}"?</p>
                        <div style={{ display: "flex", gap: "15px" }}>
                            <button className="hover-unified-app" onClick={() => setConfirmDelete({ isOpen: false, id: "", name: "" })} style={{ ...saveBtn, background: "#222", color: "#fff", flex: 1, marginTop: 0 } as any}>ОТМЕНА</button>
                            <button className="hover-unified-app" onClick={executeDelete} style={{ ...saveBtn, background: "#ff4d4d", color: "#fff", flex: 1, marginTop: 0 } as any}>УДАЛИТЬ</button>
                        </div>
                    </div>
                </div>
            )}

            {confirmClearAll && (
                <div style={modalOverlay as any} onClick={() => setConfirmClearAll(false)}>
                    <div style={{ ...modalContentSmall, textAlign: "center" } as any} onClick={(event) => event.stopPropagation()}>
                        <div style={{ width: "60px", height: "60px", borderRadius: "18px", border: "1px solid rgba(255,77,77,0.35)", background: "rgba(255,77,77,0.08)", color: "#ff4d4d", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px auto" }}>
                            <CustomIcon name="alert" size={34} color="#ff4d4d" />
                        </div>
                        <h2 style={{ color: "#ff4d4d", fontWeight: "900", marginBottom: "15px" }}>ОЧИСТИТЬ ВЕСЬ КАТАЛОГ?</h2>
                        <p style={{ color: "#ccc", fontSize: "14px", lineHeight: 1.55, marginBottom: "25px" }}>
                            Будут удалены все товары в разделе продуктов. Это действие подходит только для полной перезагрузки новой выгрузки.
                        </p>
                        <div style={{ display: "flex", gap: "15px" }}>
                            <button className="hover-unified-app" onClick={() => setConfirmClearAll(false)} style={{ ...saveBtn, background: "#222", color: "#fff", flex: 1, marginTop: 0 } as any}>ОТМЕНА</button>
                            <button className="hover-unified-app" onClick={executeClearAll} style={{ ...saveBtn, background: "#ff4d4d", color: "#fff", flex: 1, marginTop: 0 } as any}>ОЧИСТИТЬ</button>
                        </div>
                    </div>
                </div>
            )}

            {successModal.show && (
                <div style={modalOverlay as any} onClick={() => setSuccessModal({ show: false, title: "", text: "" })}>
                    <div style={{ ...modalContentSmall, textAlign: "center" } as any} onClick={(event) => event.stopPropagation()}>
                        <div style={{ marginBottom: "20px", animation: "scaleIn 0.3s ease" }}>
                            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" fill="rgba(10,186,181,0.1)" stroke="#0abab5" strokeWidth="2" />
                                <path d="M8 12L11 15L16 9" stroke="#0abab5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h2 style={{ color: "#0abab5", fontWeight: "900", marginBottom: "15px", textTransform: "uppercase" }}>{successModal.title}</h2>
                        <p style={{ color: "#ccc", fontSize: "15px", lineHeight: "1.5", marginBottom: "25px" }}>{successModal.text}</p>
                        <button className="hover-unified-app" onClick={() => setSuccessModal({ show: false, title: "", text: "" })} style={saveBtn as any}>ПОНЯТНО</button>
                    </div>
                </div>
            )}

            {errorModal.show && (
                <div style={modalOverlay as any} onClick={() => setErrorModal({ show: false, text: "" })}>
                    <div style={{ ...modalContentSmall, textAlign: "center" } as any} onClick={(event) => event.stopPropagation()}>
                        <div style={{ marginBottom: "20px" }}>
                            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" fill="rgba(255,77,77,0.1)" stroke="#ff4d4d" strokeWidth="2" />
                                <path d="M15 9L9 15M9 9L15 15" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                        </div>
                        <h2 style={{ color: "#ff4d4d", fontWeight: "900", marginBottom: "15px", textTransform: "uppercase" }}>Ошибка</h2>
                        <p style={{ color: "#ccc", fontSize: "15px", lineHeight: "1.5", marginBottom: "25px" }}>{errorModal.text}</p>
                        <button className="hover-unified-app" onClick={() => setErrorModal({ show: false, text: "" })} style={{ ...saveBtn, background: "#ff4d4d", color: "#fff" } as any}>ПОНЯТНО</button>
                    </div>
                </div>
            )}

            <style jsx global>{`
                .premium-cards-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; width: 100%; }
                .premium-card { background: #111; border-radius: 20px; border: 1px solid #222; transition: all 0.2s ease; position: relative; cursor: pointer; box-sizing: border-box; }
                .premium-card:hover { border-color: rgba(10, 186, 181, 0.45); transform: translateY(1px) scale(0.985); box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(10,186,181,0.18); }
                .premium-card:active { transform: translateY(2px) scale(0.97); }

                .hits-scroll-container::-webkit-scrollbar { height: 6px; }
                .hits-scroll-container::-webkit-scrollbar-thumb { background: #444; border-radius: 10px; }
                .hit-scroll-button { flex-shrink: 0; }
                .hit-card { scroll-snap-stop: always; }

                .hit-card:hover { border-color: #ffd700 !important; box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,215,0,0.18), 0 5px 20px rgba(255,215,0,0.15); transform: translateY(1px) scale(0.985); }

                .admin-action-icon {
                    transition: all 0.2s ease;
                }

                .admin-action-icon:hover {
                    box-shadow: inset 0 2px 6px rgba(0,0,0,0.18), 0 0 0 1.5px #0abab5 !important;
                    border-color: #0abab5 !important;
                    transform: translateY(1px) scale(0.985);
                    z-index: 20;
                }

                .hit-card .admin-action-icon:hover {
                    box-shadow: 0 0 0 1.5px #ffd700 !important;
                    border-color: #ffd700 !important;
                }

                .product-card-actions {
                    align-items: flex-start;
                }

                .single-hit {
                    flex-direction: row !important;
                    align-items: stretch !important;
                    justify-content: space-between;
                    padding: 30px 40px !important;
                }

                .product-card-title {
                    display: -webkit-box;
                    -webkit-line-clamp: 3;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    min-height: calc(1.3em * 3);
                }

                @media (max-width: 768px) {
                    .products-layout-shell { grid-template-columns: 1fr !important; gap: 16px !important; }
                    .products-sidebar { position: static !important; top: auto !important; padding: 14px !important; border-radius: 18px !important; }
                    .products-sidebar-toggle { padding: 11px 12px !important; }
                    .premium-cards-container { display: grid !important; grid-template-columns: 1fr !important; gap: 15px !important; }
                    .tasks-modal { padding: 30px 20px !important; border-radius: 25px !important; width: 95% !important; max-height: 90vh !important; }
                    .hits-header-row { align-items: flex-start !important; }
                    .hits-header-controls { width: 100%; justify-content: space-between; }
                    .hit-scroll-actions { width: auto; justify-content: flex-end; }
                    .hits-scroll-container { display: flex !important; flex-direction: row !important; overflow-x: auto !important; overflow-y: hidden !important; gap: 12px !important; padding: 4px 0 14px 0 !important; margin: 0 !important; scroll-padding-left: 0 !important; scroll-padding-right: 0 !important; scroll-snap-type: x mandatory !important; }
                    .hit-priority-switcher { margin-bottom: 14px !important; }
                    .hit-card { min-width: 100% !important; width: 100% !important; max-width: 100% !important; }
                    .product-card,
                    .product-hit-card { border-radius: 16px !important; }
                    .product-card { padding: 14px !important; min-height: 148px !important; }
                    .product-hit-card { padding: 16px !important; min-height: 134px !important; }
                    .product-card-body { margin-bottom: 14px !important; min-height: auto !important; }
                    .product-meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
                    .product-card-title { font-size: 16px !important; line-height: 1.25 !important; }
                    .product-card-footer { padding-top: 12px !important; }
                    .product-card-body,
                    .product-card-footer { gap: 10px !important; }
                    .product-card-footer { flex-direction: column !important; align-items: flex-start !important; }
                    .products-sidebar-content { margin-top: 10px !important; }
                    .product-card-actions,
                    .product-card-actions-hit {
                        position: static !important;
                        max-width: 100% !important;
                        width: 100% !important;
                        justify-content: flex-end !important;
                        margin-bottom: 12px !important;
                    }
                    .product-card-body {
                        padding-right: 0 !important;
                        padding-top: 0 !important;
                    }
                    .admin-action-icon {
                        min-width: 34px !important;
                        width: 34px !important;
                        height: 34px !important;
                    }

                    .single-hit {
                        flex-direction: column !important;
                        align-items: flex-start !important;
                        padding: 18px !important;
                        }
                    .single-hit-stats {
                        width: 100%;
                        justify-content: space-between !important;
                        padding-right: 0 !important;
                    }
                }
            `}</style>
        </section>
    );
}

function SearchIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
            <path d="M10.5 18C14.6421 18 18 14.6421 18 10.5C18 6.35786 14.6421 3 10.5 3C6.35786 3 3 6.35786 3 10.5C3 14.6421 6.35786 18 10.5 18Z" stroke="currentColor" strokeWidth="2" />
            <path d="M16 16L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function InfoCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
    return (
        <div style={{ background: "#111", border: `1px solid ${accent ? "rgba(10,186,181,0.35)" : "#222"}`, padding: "18px 20px", borderRadius: "18px" }}>
            <div style={{ fontSize: "12px", color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</div>
            <div style={{ fontSize: accent ? "24px" : "16px", color: accent ? "#0abab5" : "#fff", fontWeight: "900", lineHeight: 1.25, wordBreak: "break-word" }}>{value}</div>
        </div>
    );
}

function SidebarSectionNode({
    node,
    selectedTreePath,
    setSelectedTreePath,
}: {
    node: ProductTreeNode;
    selectedTreePath: string[];
    setSelectedTreePath: React.Dispatch<React.SetStateAction<string[]>>;
}) {
    const selected = isPathSelected(node.path, selectedTreePath);
    const insideSelected = isPathPrefix(node.path, selectedTreePath);

    return (
        <div>
            <button
                className={`products-category-button hover-unified-app ${selected ? "is-selected" : ""} ${insideSelected ? "is-in-path" : ""}`}
                onClick={() => setSelectedTreePath(selected ? [] : node.path)}
            >
                <div className="products-category-button-content">
                    <span>{node.label}</span>
                    <strong>{node.count}</strong>
                </div>
            </button>

            {node.children.length > 0 && insideSelected && (
                <div className="products-category-children">
                    {node.children.map((child) => (
                        <SidebarSectionNode key={child.key} node={child} selectedTreePath={selectedTreePath} setSelectedTreePath={setSelectedTreePath} />
                    ))}
                </div>
            )}
        </div>
    );
}

const adminActionBtn = { background: "rgba(10,186,181,0.1)", color: "#0abab5", border: "1px solid rgba(10,186,181,0.3)", padding: "10px 20px", borderRadius: "12px", fontWeight: "900", cursor: "pointer", fontSize: "13px", letterSpacing: "1px", transition: "0.2s" };
const adminIn = { width: "100%", padding: "16px", background: "#000", border: "1px solid #333", borderRadius: "15px", color: "#fff", marginBottom: "0", outline: "none", fontSize: "15px", boxSizing: "border-box" };
const saveBtn = { width: "100%", padding: "18px", background: "#0abab5", color: "#000", border: "none", borderRadius: "15px", fontWeight: "900", cursor: "pointer", marginTop: "25px", fontSize: "15px", letterSpacing: "1px" };
const cancelLink = { textAlign: "center" as const, marginTop: "20px", color: "#666", cursor: "pointer", fontWeight: "bold", fontSize: "14px" };
const editIconStyle = { background: "#1a1a1a", border: "1px solid #333", width: "36px", height: "36px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "16px", flexShrink: 0, fontWeight: "bold" };
const textIconStyle = { ...editIconStyle, minWidth: "36px", width: "auto", padding: "0 8px", fontSize: "10px", letterSpacing: "0.5px" };
const delIconStyle = { background: "#1a1a1a", color: "#ff4d4d", border: "1px solid #333", width: "36px", height: "36px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "16px", flexShrink: 0, fontWeight: "bold" };
const modalOverlay = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.92)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(10px)", padding: "20px", boxSizing: "border-box" };
const modalContentLarge = { background: "#000", borderRadius: "40px", maxWidth: "1100px", width: "100%", border: "1px solid #222", maxHeight: "90vh", overflowY: "auto" };
const modalContentMedium = { background: "#111", padding: "40px 30px", borderRadius: "35px", width: "100%", maxWidth: "620px", border: "1px solid #333", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.8)" };
const modalContentSmall = { background: "#111", padding: "40px 30px", borderRadius: "30px", width: "100%", maxWidth: "400px", border: "1px solid #333", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.8)" };
