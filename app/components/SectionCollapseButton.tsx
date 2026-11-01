"use client";

import React from "react";

type SectionCollapseButtonProps = {
  isCollapsed: boolean;
  onToggle: () => void;
  sectionName: string;
};

export default function SectionCollapseButton({
  isCollapsed,
  onToggle,
  sectionName,
}: SectionCollapseButtonProps) {
  const actionLabel = isCollapsed ? "Развернуть" : "Свернуть";

  return (
    <button
      type="button"
      className="section-collapse-button"
      onClick={onToggle}
      aria-expanded={!isCollapsed}
      aria-label={`${actionLabel} раздел «${sectionName}»`}
      title={`${actionLabel} раздел`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className={isCollapsed ? "is-collapsed" : ""}
      >
        <path d="M6 9 12 15 18 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
