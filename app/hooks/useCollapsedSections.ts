"use client";

import { useCallback, useEffect, useState } from "react";

type CollapsedSectionState = Record<string, boolean>;

export default function useCollapsedSections(storageKey: string) {
  const [collapsedSections, setCollapsedSections] = useState<CollapsedSectionState>({});

  useEffect(() => {
    try {
      const savedState = window.localStorage.getItem(storageKey);
      if (!savedState) {
        return;
      }

      const parsedState = JSON.parse(savedState);
      if (parsedState && typeof parsedState === "object" && !Array.isArray(parsedState)) {
        setCollapsedSections(parsedState);
      }
    } catch (error) {
      console.error("Не удалось восстановить свернутые разделы:", error);
    }
  }, [storageKey]);

  const isSectionCollapsed = useCallback(
    (sectionKey: string) => Boolean(collapsedSections[sectionKey]),
    [collapsedSections],
  );

  const toggleSection = useCallback(
    (sectionKey: string) => {
      setCollapsedSections((currentState) => {
        const nextState = {
          ...currentState,
          [sectionKey]: !currentState[sectionKey],
        };

        try {
          window.localStorage.setItem(storageKey, JSON.stringify(nextState));
        } catch (error) {
          console.error("Не удалось сохранить свернутые разделы:", error);
        }

        return nextState;
      });
    },
    [storageKey],
  );

  return { isSectionCollapsed, toggleSection };
}
