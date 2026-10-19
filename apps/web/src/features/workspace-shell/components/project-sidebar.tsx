// Keeps the project sidebar shell, resize handle and footer identical in ordinary and professional modes.
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DefaultSidebar } from "../../../shared/template/layout/default-sidebar";
import { SidebarCodingAgentCard } from "./sidebar-coding-agent-card";
import { SidebarUserDropdown, type SidebarUserDropdownProps } from "./sidebar-user-dropdown";

export function ProjectSidebar({ children, showCodingAgent = false, ...accountActions }: SidebarUserDropdownProps & { children: ReactNode; showCodingAgent?: boolean }) {
  const { t } = useTranslation();
  // Keep the fixed-size CTA outside the scrolling navigation, anchored above the account controls.
  return <DefaultSidebar resizeLabel={t("workspace.sidebar.resize")} footer={<>
    {showCodingAgent && <SidebarCodingAgentCard />}
    <SidebarUserDropdown {...accountActions} />
  </>}>
    {children}
  </DefaultSidebar>;
}
