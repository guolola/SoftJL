<!-- 说明 PlantUML 渲染服务的运行边界与维护方式。 -->

# PlantUML 渲染服务

## 职责

接收 PlantUML 文本并输出 SVG、PNG 和矢量 PDF，同时通过健康检查报告 PlantUML JAR 和 PDF 字体是否可用。

## 边界

渲染服务只负责语法渲染与运行时诊断，不解释业务模型，也不保存项目数据。API 负责调用它并把结果纳入生成流水线。

## 使用或常用命令

```bash
npm run dev --workspace @uml-platform/render-service
npm run build --workspace @uml-platform/render-service
npm run test --workspace @uml-platform/render-service
```

服务默认监听 `4002`。

## 配置

核心配置包括监听地址、端口、跨域来源和 PlantUML JAR 路径。仓库保留 CI 与部署需要的固定 JAR；Graphviz 和 Java 由运行环境提供。

PDF 先生成 SVG，再通过 PDFKit 与 svg-to-pdfkit 转成单页矢量图；字体嵌入文件，页面按图尺寸留白。接口为 `POST /render/pdf`，请求字段为 `diagramKind`、`plantUmlSource`，响应字段为 `pdfBase64`、`renderMeta`。PNG 与 SVG 原有接口保持兼容。

启动、构建和测试前会准备固定版本 Noto Sans CJK Sans2.004 的简体中文常规、粗体字体及许可证，缓存到忽略目录 `.runtime/pdf-fonts/`，复制到 `dist/assets/pdf-fonts/`。首次准备需要联网，缓存存在后可离线运行。字体二进制不纳入源代码管理，发布时随 `dist` 复制。

生产部署会从 Actions 已验证的构建产物打包字体及许可证，通过发布连接传到服务器，并在源码清理后恢复缓存。服务器构建复用这份缓存，无需再次下载字体。

`UML_PDF_FONT_REGULAR` 和 `UML_PDF_FONT_BOLD` 可指定运行环境提供的字体文件，供准备脚本和运行时覆盖默认配置。转换缺少字体会返回明确错误，PNG 与 SVG 不受影响。

## 验证

```bash
npm run test:render
curl http://127.0.0.1:4002/health
```

健康响应应为成功状态并表明 `jarAvailable`、`pdfFontsReady` 为真。验证包含中文类图、活动图、时序图和环境图的 PNG/PDF，以及无效输入与字体缺失。PDF 应为单页矢量内容，中文无缺字、箭头无错位、图形无裁切。

## 相关文档

- [平台架构](../../docs/architecture/platform-overview.md)
- [宝塔与 PM2 部署](../../docs/deployment/baota-pm2.md)
- [生产环境配置](../../docs/deployment/production-environment.md)
- [SVG-to-PDFKit](https://github.com/alafr/SVG-to-PDFKit)
- [Noto Sans CJK Sans2.004](https://github.com/notofonts/noto-cjk/releases/tag/Sans2.004)
