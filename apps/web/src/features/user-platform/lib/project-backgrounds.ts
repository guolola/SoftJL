// Defines project background assets and deterministic title matching for project cards.
import type { ProjectBackgroundKey } from "@uml-platform/contracts";
import erpImageUrl from "../assets/project-backgrounds/01_erp.png";
import crmImageUrl from "../assets/project-backgrounds/02_crm.png";
import oaImageUrl from "../assets/project-backgrounds/03_oa.png";
import hrmImageUrl from "../assets/project-backgrounds/04_hrm.png";
import financeImageUrl from "../assets/project-backgrounds/05_finance.png";
import procurementImageUrl from "../assets/project-backgrounds/06_procurement.png";
import salesImageUrl from "../assets/project-backgrounds/07_sales.png";
import inventoryImageUrl from "../assets/project-backgrounds/08_inventory.png";
import wmsImageUrl from "../assets/project-backgrounds/09_wms.png";
import mesImageUrl from "../assets/project-backgrounds/10_mes.png";
import scmImageUrl from "../assets/project-backgrounds/11_scm.png";
import biImageUrl from "../assets/project-backgrounds/12_bi.png";
import projectManagementImageUrl from "../assets/project-backgrounds/13_project_management.png";
import cmsImageUrl from "../assets/project-backgrounds/14_cms.png";
import plmImageUrl from "../assets/project-backgrounds/15_plm.png";
import eamImageUrl from "../assets/project-backgrounds/16_eam.png";
import itsmImageUrl from "../assets/project-backgrounds/17_itsm.png";
import ticketImageUrl from "../assets/project-backgrounds/18_ticket.png";
import contractImageUrl from "../assets/project-backgrounds/19_contract.png";
import legalImageUrl from "../assets/project-backgrounds/20_legal.png";
import riskControlImageUrl from "../assets/project-backgrounds/21_risk_control.png";
import securityImageUrl from "../assets/project-backgrounds/22_security.png";
import permissionImageUrl from "../assets/project-backgrounds/23_permission.png";
import approvalImageUrl from "../assets/project-backgrounds/24_approval.png";
import reportsImageUrl from "../assets/project-backgrounds/25_reports.png";
import ordersImageUrl from "../assets/project-backgrounds/26_orders.png";
import afterSalesImageUrl from "../assets/project-backgrounds/27_after_sales.png";
import knowledgeBaseImageUrl from "../assets/project-backgrounds/28_knowledge_base.png";
import equipmentImageUrl from "../assets/project-backgrounds/29_equipment.png";
import iotImageUrl from "../assets/project-backgrounds/30_iot.png";
import mrpImageUrl from "../assets/project-backgrounds/31_mrp.png";
import qmsImageUrl from "../assets/project-backgrounds/32_qms.png";
import limsImageUrl from "../assets/project-backgrounds/33_lims.png";
import hisImageUrl from "../assets/project-backgrounds/34_his.png";
import lmsImageUrl from "../assets/project-backgrounds/35_lms.png";
import energyImageUrl from "../assets/project-backgrounds/36_energy.png";
import marketingAutomationImageUrl from "../assets/project-backgrounds/37_marketing_automation.png";
import ecommerceImageUrl from "../assets/project-backgrounds/38_ecommerce.png";
import callCenterImageUrl from "../assets/project-backgrounds/39_call_center.png";
import tmsImageUrl from "../assets/project-backgrounds/40_tms.png";
import fleetImageUrl from "../assets/project-backgrounds/41_fleet.png";
import dmsImageUrl from "../assets/project-backgrounds/42_dms.png";
import archiveImageUrl from "../assets/project-backgrounds/43_archive.png";
import collaborationPortalImageUrl from "../assets/project-backgrounds/44_collaboration_portal.png";
import lowCodeImageUrl from "../assets/project-backgrounds/45_low_code.png";
import devopsImageUrl from "../assets/project-backgrounds/46_devops.png";
import apmImageUrl from "../assets/project-backgrounds/47_apm.png";
import dataGovernanceImageUrl from "../assets/project-backgrounds/48_data_governance.png";
import mdmImageUrl from "../assets/project-backgrounds/49_mdm.png";
import rpaImageUrl from "../assets/project-backgrounds/50_rpa.png";
import emrImageUrl from "../assets/project-backgrounds/51_emr.png";
import campusImageUrl from "../assets/project-backgrounds/52_campus.png";
import hotelPmsImageUrl from "../assets/project-backgrounds/53_hotel_pms.png";
import propertyManagementImageUrl from "../assets/project-backgrounds/54_property_management.png";
import parkingImageUrl from "../assets/project-backgrounds/55_parking.png";
import retailPosImageUrl from "../assets/project-backgrounds/56_retail_pos.png";
import bookingImageUrl from "../assets/project-backgrounds/57_booking.png";
import assetTrackingImageUrl from "../assets/project-backgrounds/58_asset_tracking.png";
import trainingImageUrl from "../assets/project-backgrounds/59_training.png";
import qualityTraceabilityImageUrl from "../assets/project-backgrounds/60_quality_traceability.png";

export type ProjectBackgroundOption = {
  key: ProjectBackgroundKey;
  label: string;
  imageUrl: string;
  aliases: string[];
};

// Vite imports image URLs as strings; Next.js imports static image descriptors.
function assetUrl(asset: string | { src: string }) {
  return typeof asset === 'string' ? asset : asset.src;
}

export const PROJECT_BACKGROUND_OPTIONS: ProjectBackgroundOption[] = [
  { key: "erp", label: "ERP 企业资源计划", imageUrl: assetUrl(erpImageUrl), aliases: ["ERP", "企业资源计划", "资源计划"] },
  { key: "crm", label: "CRM 客户关系管理", imageUrl: assetUrl(crmImageUrl), aliases: ["CRM", "客户关系", "客户管理"] },
  { key: "oa", label: "OA 办公自动化", imageUrl: assetUrl(oaImageUrl), aliases: ["OA", "办公自动化", "办公系统"] },
  { key: "hrm", label: "HRM 人力资源", imageUrl: assetUrl(hrmImageUrl), aliases: ["HRM", "HR", "人力资源", "人事"] },
  { key: "finance", label: "财务系统", imageUrl: assetUrl(financeImageUrl), aliases: ["财务", "会计", "资金", "报销"] },
  { key: "procurement", label: "采购系统", imageUrl: assetUrl(procurementImageUrl), aliases: ["采购", "寻源", "供应商采购"] },
  { key: "sales", label: "销售系统", imageUrl: assetUrl(salesImageUrl), aliases: ["销售", "商机", "销售管理"] },
  { key: "inventory", label: "库存系统", imageUrl: assetUrl(inventoryImageUrl), aliases: ["库存", "存货", "库存管理"] },
  { key: "wms", label: "WMS 仓储管理", imageUrl: assetUrl(wmsImageUrl), aliases: ["WMS", "仓储", "仓库"] },
  { key: "mes", label: "MES 生产执行", imageUrl: assetUrl(mesImageUrl), aliases: ["MES", "生产执行", "生产管理"] },
  { key: "scm", label: "SCM 供应链管理", imageUrl: assetUrl(scmImageUrl), aliases: ["SCM", "供应链"] },
  { key: "bi", label: "BI 商业智能", imageUrl: assetUrl(biImageUrl), aliases: ["BI", "商业智能", "数据分析"] },
  { key: "project_management", label: "项目管理系统", imageUrl: assetUrl(projectManagementImageUrl), aliases: ["项目管理", "项目协作", "Project Management"] },
  { key: "cms", label: "CMS 内容管理", imageUrl: assetUrl(cmsImageUrl), aliases: ["CMS", "内容管理", "内容发布"] },
  { key: "plm", label: "PLM 全生命周期管理", imageUrl: assetUrl(plmImageUrl), aliases: ["PLM", "产品生命周期", "产品管理"] },
  { key: "eam", label: "EAM 资产管理", imageUrl: assetUrl(eamImageUrl), aliases: ["EAM", "资产管理", "固定资产"] },
  { key: "itsm", label: "ITSM 服务管理", imageUrl: assetUrl(itsmImageUrl), aliases: ["ITSM", "IT 服务", "服务管理"] },
  { key: "ticket", label: "工单系统", imageUrl: assetUrl(ticketImageUrl), aliases: ["工单", "工单系统", "Ticket"] },
  { key: "contract", label: "合同系统", imageUrl: assetUrl(contractImageUrl), aliases: ["合同", "合同管理"] },
  { key: "legal", label: "法务系统", imageUrl: assetUrl(legalImageUrl), aliases: ["法务", "法律", "合规法务"] },
  { key: "risk_control", label: "风控系统", imageUrl: assetUrl(riskControlImageUrl), aliases: ["风控", "风险控制", "风险管理"] },
  { key: "security", label: "安全系统", imageUrl: assetUrl(securityImageUrl), aliases: ["安全", "安全管理", "Security"] },
  { key: "permission", label: "权限系统", imageUrl: assetUrl(permissionImageUrl), aliases: ["权限", "权限管理", "RBAC", "IAM"] },
  { key: "approval", label: "审批系统", imageUrl: assetUrl(approvalImageUrl), aliases: ["审批", "流程审批", "审批流"] },
  { key: "reports", label: "报表系统", imageUrl: assetUrl(reportsImageUrl), aliases: ["报表", "统计报表", "报告"] },
  { key: "orders", label: "订单系统", imageUrl: assetUrl(ordersImageUrl), aliases: ["订单", "订单管理", "下单"] },
  { key: "after_sales", label: "售后系统", imageUrl: assetUrl(afterSalesImageUrl), aliases: ["售后", "售后服务", "客服售后"] },
  { key: "knowledge_base", label: "知识库系统", imageUrl: assetUrl(knowledgeBaseImageUrl), aliases: ["知识库", "知识管理", "文档知识"] },
  { key: "equipment", label: "设备管理系统", imageUrl: assetUrl(equipmentImageUrl), aliases: ["设备", "设备管理", "设施设备"] },
  { key: "iot", label: "IoT 物联网系统", imageUrl: assetUrl(iotImageUrl), aliases: ["IoT", "物联网", "传感器"] },
  { key: "mrp", label: "MRP 物料需求计划", imageUrl: assetUrl(mrpImageUrl), aliases: ["MRP", "物料需求", "物料计划"] },
  { key: "qms", label: "QMS 质量管理", imageUrl: assetUrl(qmsImageUrl), aliases: ["QMS", "质量管理", "质量系统"] },
  { key: "lims", label: "LIMS 实验室管理", imageUrl: assetUrl(limsImageUrl), aliases: ["LIMS", "实验室", "实验室管理"] },
  { key: "his", label: "HIS 医院信息系统", imageUrl: assetUrl(hisImageUrl), aliases: ["HIS", "医院", "医疗信息"] },
  { key: "lms", label: "LMS 学习管理", imageUrl: assetUrl(lmsImageUrl), aliases: ["LMS", "学习管理", "教学平台"] },
  { key: "energy", label: "能源管理系统", imageUrl: assetUrl(energyImageUrl), aliases: ["能源", "能耗", "能源管理"] },
  { key: "marketing_automation", label: "营销自动化", imageUrl: assetUrl(marketingAutomationImageUrl), aliases: ["营销自动化", "营销", "Marketing Automation"] },
  { key: "ecommerce", label: "电商系统", imageUrl: assetUrl(ecommerceImageUrl), aliases: ["电商", "商城", "电子商务", "E-commerce"] },
  { key: "call_center", label: "呼叫中心系统", imageUrl: assetUrl(callCenterImageUrl), aliases: ["呼叫中心", "客服中心", "Call Center"] },
  { key: "tms", label: "TMS 运输管理", imageUrl: assetUrl(tmsImageUrl), aliases: ["TMS", "运输", "运输管理"] },
  { key: "fleet", label: "车队管理系统", imageUrl: assetUrl(fleetImageUrl), aliases: ["车队", "车辆管理", "Fleet"] },
  { key: "dms", label: "DMS 文档管理", imageUrl: assetUrl(dmsImageUrl), aliases: ["DMS", "文档管理", "文档系统"] },
  { key: "archive", label: "档案管理系统", imageUrl: assetUrl(archiveImageUrl), aliases: ["档案", "档案管理", "归档"] },
  { key: "collaboration_portal", label: "协同门户系统", imageUrl: assetUrl(collaborationPortalImageUrl), aliases: ["协同门户", "门户", "协同"] },
  { key: "low_code", label: "低代码平台", imageUrl: assetUrl(lowCodeImageUrl), aliases: ["低代码", "Low Code", "无代码"] },
  { key: "devops", label: "DevOps 系统", imageUrl: assetUrl(devopsImageUrl), aliases: ["DevOps", "研发运维", "持续集成"] },
  { key: "apm", label: "APM 性能监控", imageUrl: assetUrl(apmImageUrl), aliases: ["APM", "性能监控", "应用监控"] },
  { key: "data_governance", label: "数据治理系统", imageUrl: assetUrl(dataGovernanceImageUrl), aliases: ["数据治理", "数据质量", "数据资产"] },
  { key: "mdm", label: "MDM 主数据管理", imageUrl: assetUrl(mdmImageUrl), aliases: ["MDM", "主数据", "主数据管理"] },
  { key: "rpa", label: "RPA 自动化系统", imageUrl: assetUrl(rpaImageUrl), aliases: ["RPA", "流程自动化", "机器人流程"] },
  { key: "emr", label: "EMR 电子病历", imageUrl: assetUrl(emrImageUrl), aliases: ["EMR", "电子病历", "病历"] },
  { key: "campus", label: "校园管理系统", imageUrl: assetUrl(campusImageUrl), aliases: ["校园", "学校管理", "教务"] },
  { key: "hotel_pms", label: "酒店管理系统", imageUrl: assetUrl(hotelPmsImageUrl), aliases: ["酒店", "PMS", "酒店管理"] },
  { key: "property_management", label: "物业管理系统", imageUrl: assetUrl(propertyManagementImageUrl), aliases: ["物业", "物业管理", "社区管理"] },
  { key: "parking", label: "停车场系统", imageUrl: assetUrl(parkingImageUrl), aliases: ["停车", "停车场", "车位"] },
  { key: "retail_pos", label: "零售 POS 系统", imageUrl: assetUrl(retailPosImageUrl), aliases: ["POS", "零售", "收银"] },
  { key: "booking", label: "预约预订系统", imageUrl: assetUrl(bookingImageUrl), aliases: ["预约", "预订", "预约预订", "Booking"] },
  { key: "asset_tracking", label: "资产追踪系统", imageUrl: assetUrl(assetTrackingImageUrl), aliases: ["资产追踪", "资产定位", "追踪"] },
  { key: "training", label: "培训考试系统", imageUrl: assetUrl(trainingImageUrl), aliases: ["培训", "考试", "培训考试"] },
  { key: "quality_traceability", label: "质量追溯系统", imageUrl: assetUrl(qualityTraceabilityImageUrl), aliases: ["质量追溯", "追溯", "溯源"] },
];

export const PROJECT_BACKGROUND_BY_KEY = Object.fromEntries(
  PROJECT_BACKGROUND_OPTIONS.map((background) => [background.key, background]),
) as Record<ProjectBackgroundKey, ProjectBackgroundOption>;

const PROJECT_BACKGROUND_KEY_SET = new Set<ProjectBackgroundKey>(
  PROJECT_BACKGROUND_OPTIONS.map((background) => background.key),
);

const MATCH_CANDIDATES = PROJECT_BACKGROUND_OPTIONS.flatMap((background) =>
  [background.label, background.key, ...background.aliases].map((alias) => ({
    background,
    normalizedAlias: normalizeProjectBackgroundText(alias),
  })),
)
  .filter((candidate) => candidate.normalizedAlias.length > 0)
  .sort((left, right) => right.normalizedAlias.length - left.normalizedAlias.length);

export function isProjectBackgroundKey(value: string | null | undefined): value is ProjectBackgroundKey {
  return Boolean(value && PROJECT_BACKGROUND_KEY_SET.has(value as ProjectBackgroundKey));
}

export function normalizeProjectBackgroundText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_./\\|()[\]{}:：,，;；'"`~!！?？\-]+/gu, "");
}

export function matchProjectBackground(name: string) {
  const normalizedName = normalizeProjectBackgroundText(name);
  if (!normalizedName) return null;
  return (
    MATCH_CANDIDATES.find((candidate) =>
      normalizedName.includes(candidate.normalizedAlias),
    )?.background ?? null
  );
}

export function fallbackProjectBackground(seed: string) {
  const chars = Array.from(seed || "project");
  const hash = chars.reduce(
    (current, char) => (current * 31 + (char.codePointAt(0) ?? 0)) >>> 0,
    7,
  );
  return PROJECT_BACKGROUND_OPTIONS[hash % PROJECT_BACKGROUND_OPTIONS.length];
}

export function resolveProjectBackground(input: {
  id?: string;
  name: string;
  backgroundKey?: ProjectBackgroundKey | null;
}) {
  if (isProjectBackgroundKey(input.backgroundKey)) {
    return PROJECT_BACKGROUND_BY_KEY[input.backgroundKey];
  }
  return matchProjectBackground(input.name) ?? fallbackProjectBackground(`${input.id ?? ""}:${input.name}`);
}
