<!-- 区分 Chen 概念模型和以关系约束为依据的物理表模型。 -->
# 概念与物理数据模型

## 概念 E-R

- er 不是 UML 图种。entities 表达业务实体，各实体 attributes 由 id、name、isKey 组成；isKey 标识概念标识属性，不混入 SQL 类型或索引。
- relationships 用业务动词 name 命名，通过 sourceId、targetId 连接实体。sourceMultiplicity 表示一个目标实例关联的源实例数量，targetMultiplicity 反之。基数使用 1、0..1、*、1..* 或合法数字区间。
- 渲染为实体矩形、关系菱形、属性椭圆；当前表达二元关系，不冒充 UML 类图或完整多元 E-R 元模型。

## 数据库表关系

- table 是物理数据视图，也不是 UML 图种。tables 各自包含 columns 与 relationalConstraints，字段必须有 id、name、dataType、nullable。
- relationalConstraints 是键约束的唯一依据：primary-key/unique 用 columnIds；foreign-key 使用 columnIds、referenceTableId、referenceColumnIds，引用目标必须是候选键；check 使用 expression。
- 支持复合主键、复合唯一键和复合外键，引用列数、顺序及类型一致；根据真实业务确定非空、默认值与检查约束。
- isPrimaryKey、isForeignKey、references 和表间 relationships 是平台从约束派生的展示数据，不独立编造或编辑；保存时统一重算。
- 多对多需要时设计关联表，不能画一条多对多线就声称已完成物理数据库设计。不杜撰数据库厂商专有能力。

## 依据

绘图参考 [PlantUML 信息工程文档](https://plantuml.com/ie-diagram)；工具基于类图绘制不改变概念模型和数据库模型的分类。
