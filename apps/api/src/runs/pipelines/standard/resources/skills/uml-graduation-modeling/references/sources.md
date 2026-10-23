<!-- 记录建模技能的权威依据、开源参考及原创适配范围。 -->
# 来源与适配边界

| 资料 | 定位 | 使用方式 |
| --- | --- | --- |
| [OMG UML 2.5.1](https://www.omg.org/spec/UML/2.5.1) | UML 语义与记法的规范依据 | 按参与者、用例、分类与关系、活动及交互语义独立编写简明指导；不复制规范全文，不宣称认证 |
| [PlantUML 官方文档](https://plantuml.com/) | 绘图语言与符号实现 | 对照箭头、关系和图形记法；语法可用不等于业务模型正确 |
| [samonysh/plantuml-skill](https://github.com/samonysh/plantuml-skill) | 开源 Agent Skill，仓库标注 MIT-0 | 参考按图种拆分资料的组织方式；未复制其 Skill、样式或渲染脚本，不引入 Docker、公开渲染端点或本地命令权限 |
| [BESSER UML Drawing Skill](https://github.com/BESSER-PEARL/uml-drawing-skill) | Apache-2.0 开源类图技能，使用 B-UML | 作为另一种模型驱动方案的参考；未引入其运行时，不能用类图技能代替全部 UML 图种 |

本目录内容为针对当前项目原创的适配指导。平台只支持当前合同中的八类视图及其结构字段，学校格式与评分要求需以用户提供的资料为准。规则提高生成质量，不替代人工业务评审，也不保证所有生成结果符合完整 OMG 元模型。
