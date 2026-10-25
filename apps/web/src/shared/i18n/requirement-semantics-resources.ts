// Labels the single requirement type and deterministic model-level associations.
export const requirementSemanticsZh = {
  kinds: { functional: "功能需求", "business-rule": "业务规则", data: "数据需求", interaction: "界面交互", interface: "外部接口", exception: "异常处理", quality: "质量需求", operations: "部署运行" },
  mapped: "来源关联", mappedBadge: "已关联", mappedHint: "每个模型元素至少关联一条真实的上游来源",
  missingType: "缺少{{type}}",
};
export const requirementSemanticsEn = {
  kinds: { functional: "Functional requirement", "business-rule": "Business rule", data: "Data requirement", interaction: "UI interaction", interface: "External interface", exception: "Exception handling", quality: "Quality requirement", operations: "Deployment and operations" },
  mapped: "Source associations", mappedBadge: "Associated", mappedHint: "Every model element needs at least one real upstream source",
  missingType: "Missing {{type}}",
};
