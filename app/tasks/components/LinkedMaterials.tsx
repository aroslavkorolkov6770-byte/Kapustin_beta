"use client";

import React, { useMemo, useState } from "react";
import CustomIcon from "@/app/components/CustomIcon";

export type LinkedMaterialType = "document" | "route";

export type LinkedMaterialReference = {
  type: LinkedMaterialType;
  id: string;
};

type LinkedMaterialOption = LinkedMaterialReference & {
  title: string;
  section: string;
};

type RouteMaterialSource = {
  id?: unknown;
  title?: unknown;
  section?: unknown;
  order?: unknown;
  isPlaceholder?: unknown;
  h1?: unknown;
};

type DocumentMaterialSource = {
  id?: unknown;
  name?: unknown;
  section?: unknown;
  isDocPlaceholder?: unknown;
  isTest?: unknown;
};

type LinkedMaterialsEditorProps = {
  value: LinkedMaterialReference[];
  onChange: (nextValue: LinkedMaterialReference[]) => void;
  routes: RouteMaterialSource[];
  documents: DocumentMaterialSource[];
  currentRouteId?: string;
};

type LinkedMaterialsListProps = {
  value?: LinkedMaterialReference[];
  routes: RouteMaterialSource[];
  documents: DocumentMaterialSource[];
  onOpen: (reference: LinkedMaterialReference) => void;
};

const normalizeReferences = (value: unknown): LinkedMaterialReference[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueReferences = new Map<string, LinkedMaterialReference>();

  value.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const candidate = item as Partial<LinkedMaterialReference>;
    if ((candidate.type !== "document" && candidate.type !== "route") || typeof candidate.id !== "string" || !candidate.id.trim()) {
      return;
    }

    const normalizedReference = { type: candidate.type, id: candidate.id.trim() };
    uniqueReferences.set(`${normalizedReference.type}:${normalizedReference.id}`, normalizedReference);
  });

  return Array.from(uniqueReferences.values());
};

const buildOptions = (routes: RouteMaterialSource[], documents: DocumentMaterialSource[], currentRouteId?: string): LinkedMaterialOption[] => {
  const routeOptions = (Array.isArray(routes) ? routes : [])
    .filter((route) => route && !route.isPlaceholder && route.h1 !== "DELETE_ME" && route.id !== currentRouteId)
    .map((route) => ({
      type: "route" as const,
      id: String(route.id),
      title: String(route.title || "Тема без названия"),
      section: String(route.section || "").trim() || "Основной раздел",
      order: Number(route.order) || Number.MAX_SAFE_INTEGER,
    }))
    .sort((left, right) => left.section.localeCompare(right.section, "ru") || left.order - right.order || left.title.localeCompare(right.title, "ru"));

  const documentOptions = (Array.isArray(documents) ? documents : [])
    .filter((documentItem) => documentItem && !documentItem.isDocPlaceholder && !documentItem.isTest && !String(documentItem.id || "").startsWith("deadline_"))
    .map((documentItem) => ({
      type: "document" as const,
      id: String(documentItem.id),
      title: String(documentItem.name || "Документ без названия"),
      section: String(documentItem.section || "").trim() || "Основной раздел",
    }))
    .sort((left, right) => left.section.localeCompare(right.section, "ru") || left.title.localeCompare(right.title, "ru"));

  return [...routeOptions, ...documentOptions];
};

const getMaterialIcon = (type: LinkedMaterialType) => type === "document" ? "file" : "book";

const MaterialTypeIcon = ({ type }: { type: LinkedMaterialType }) => (
  <CustomIcon name={getMaterialIcon(type)} size={18} color="#0abab5" />
);

export function LinkedMaterialsEditor({ value, onChange, routes, documents, currentRouteId }: LinkedMaterialsEditorProps) {
  const [activeType, setActiveType] = useState<LinkedMaterialType>("document");
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedValue = useMemo(() => normalizeReferences(value), [value]);
  const options = useMemo(() => buildOptions(routes, documents, currentRouteId), [routes, documents, currentRouteId]);
  const optionsByKey = useMemo(() => new Map(options.map((option) => [`${option.type}:${option.id}`, option])), [options]);
  const selectedKeys = useMemo(() => new Set(normalizedValue.map((reference) => `${reference.type}:${reference.id}`)), [normalizedValue]);

  const visibleOptions = options.filter((option) => {
    if (option.type !== activeType || selectedKeys.has(`${option.type}:${option.id}`)) {
      return false;
    }

    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ru");
    if (!normalizedQuery) {
      return true;
    }

    return `${option.title} ${option.section}`.toLocaleLowerCase("ru").includes(normalizedQuery);
  });

  const addReference = (option: LinkedMaterialOption) => {
    onChange(normalizeReferences([...normalizedValue, { type: option.type, id: option.id }]));
  };

  const removeReference = (reference: LinkedMaterialReference) => {
    onChange(normalizedValue.filter((item) => item.type !== reference.type || item.id !== reference.id));
  };

  return (
    <section className="linked-materials-editor">
      <div className="linked-materials-heading">
        <div>
          <h3>Связанные материалы</h3>
          <p>Добавьте документы или другие темы, которые помогут изучить материал.</p>
        </div>
        <span>{normalizedValue.length}</span>
      </div>

      {normalizedValue.length > 0 && (
        <div className="linked-materials-selected">
          {normalizedValue.map((reference) => {
            const option = optionsByKey.get(`${reference.type}:${reference.id}`);
            return (
              <div className="linked-material-selected-row" key={`${reference.type}:${reference.id}`}>
                <MaterialTypeIcon type={reference.type} />
                <div>
                  <strong>{option?.title || "Материал больше недоступен"}</strong>
                  <small>{option?.section || (reference.type === "document" ? "Документ" : "Тема")}</small>
                </div>
                <button type="button" onClick={() => removeReference(reference)} aria-label="Убрать связанный материал" title="Убрать">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="linked-materials-tabs" role="tablist" aria-label="Тип связанного материала">
        <button type="button" className={activeType === "document" ? "active" : ""} onClick={() => setActiveType("document")}>Документы</button>
        <button type="button" className={activeType === "route" ? "active" : ""} onClick={() => setActiveType("route")}>Темы</button>
      </div>

      <label className="linked-materials-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="#777" strokeWidth="2" />
          <path d="M16.5 16.5L21 21" stroke="#777" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Найти материал..." />
      </label>

      <div className="linked-materials-options">
        {visibleOptions.length > 0 ? visibleOptions.slice(0, 30).map((option) => (
          <button type="button" key={`${option.type}:${option.id}`} onClick={() => addReference(option)}>
            <MaterialTypeIcon type={option.type} />
            <span><strong>{option.title}</strong><small>{option.section}</small></span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )) : (
          <div className="linked-materials-empty">Подходящих материалов нет.</div>
        )}
      </div>
    </section>
  );
}

export function LinkedMaterialsList({ value, routes, documents, onOpen }: LinkedMaterialsListProps) {
  const references = useMemo(() => normalizeReferences(value), [value]);
  const options = useMemo(() => buildOptions(routes, documents), [routes, documents]);
  const optionsByKey = useMemo(() => new Map(options.map((option) => [`${option.type}:${option.id}`, option])), [options]);
  const availableReferences = references
    .map((reference) => ({ reference, option: optionsByKey.get(`${reference.type}:${reference.id}`) }))
    .filter((item): item is { reference: LinkedMaterialReference; option: LinkedMaterialOption } => Boolean(item.option));

  if (availableReferences.length === 0) {
    return null;
  }

  return (
    <section className="linked-materials-view">
      <div className="linked-materials-view-title">Связанные материалы</div>
      <div className="linked-materials-view-list">
        {availableReferences.map(({ reference, option }) => (
          <button type="button" key={`${reference.type}:${reference.id}`} onClick={() => onOpen(reference)}>
            <MaterialTypeIcon type={reference.type} />
            <span><strong>{option.title}</strong><small>{option.section}</small></span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>
    </section>
  );
}

export { normalizeReferences };
