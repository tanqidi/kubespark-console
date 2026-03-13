# KubeSpark React 项目架构总览

更新时间：2026-03-13

## 1. 项目定位

本项目是一个基于 Next.js App Router 的 Kubernetes 控制台前端，核心目标是：

- 以统一的 GVR（`group/version/resource`）接口驱动资源页面。
- 提供统一的列表、筛选、查看 YAML、单删/批量删除交互。
- 通过 3 秒轮询刷新保证 UI 状态与集群状态逐步一致。

主入口路由为 `/dashboard`（`app/page.tsx` 默认重定向到该路由）。

## 2. 分层架构

```text
UI 层 (app/(examples)/dashboard/components)
  ├─ 资源页面：workloads/jobs/pods/services/routes/... 
  ├─ 通用表格：DataTable + TableToolbar + ColumnsFactory
  └─ 通用弹窗：DeleteConfirmDialog + MonacoViewerDialog

领域层 (app/lib/kubespark)
  ├─ common.ts: 统一请求、鉴权头注入、响应解包、GVR URL 构建
  ├─ resource-rows.ts: 各资源列表映射（K8s payload -> Table Row）
  ├─ resource-yaml.ts: 资源 YAML 拉取与构建
  ├─ resource-document.ts: YAML 规范化（按资源类型清理运行时字段）
  └─ resource-delete.ts: 各资源删除能力封装

网关层 (app/api/kubespark/[[...path]]/route.ts)
  └─ Next.js Route Handler 反向代理到后端 KubeSpark API

上游层 (KubeSpark/K8s API)
  └─ 统一资源接口：/kapis/resources.kubespark.io/v1alpha1/resources/{group}/{version}/{resource}
```

## 3. 关键请求链路

### 3.1 列表查询

1. 资源页面 `useEffect` 首次加载 + `setInterval(3000)` 轮询。
2. 调用 `fetch*Rows`（如 `fetchServiceRows`）。
3. `fetch*Rows` 内部调用 `fetchResourceCollection(group, version, resource)`。
4. `common.ts` 构建统一 GVR URL，注入 `Authorization`，请求 `/api/kubespark/...`。
5. API 代理转发到 `KUBESPARK_API_BASE` 上游，返回数据后映射成表格行。

### 3.2 查看 YAML

1. 行菜单点击“查看 YAML”。
2. 调用 `fetchNamespacedResourceYaml(...)`（底层走 `fetchResourceByName` + `fieldSelector=metadata.name=...`）。
3. 如配置 `documentType`，由 `buildResourceDocument` 输出规范化 YAML。
4. `MonacoViewerDialog` 展示 YAML 文本。

### 3.3 删除（单删/批量）

1. 行操作或头部批量删除触发 `DeleteConfirmDialog`。
2. 确认后仅发送删除请求（不本地手动删 `dataTable` 数据）。
3. 后续轮询返回最新列表，页面自动重渲染状态。

## 4. 核心设计决策

## 4.1 统一 GVR

通过 `buildResourceCollectionEndpoint`/`fetchResourceCollection` 统一了资源查询路径，降低每个模块写专属 API 的成本。

## 4.2 统一表格框架

`DataTable` 支持：

- 行拖拽排序（仅前端展示）
- 行选择与批量删除
- 列可见性开关
- 分页（已处理轮询时页码自动回到第一页的问题）

## 4.3 状态徽标统一

`columns-factory.tsx` 统一状态渲染规则：

- 健康状态显示绿色图标
- 非健康状态显示橙色样式

## 4.4 YAML 规范化

`resource-document.ts` 对多资源类型做结构清洗，默认剔除：

- `metadata.uid`
- `metadata.resourceVersion`
- `metadata.managedFields`
- `metadata.creationTimestamp`
- `status`

并按类型保留核心字段（如 `spec`、`data`、`parameters` 等）。

## 4.5 表单校验复用

针对创建/编辑弹窗中常见的“按视觉顺序校验 + 定位首个错误 + 自动滚动聚焦”场景，已抽出通用工具：

- `app/lib/kubespark/form-validation.ts`
  - `resolveFirstContainerPortErrorFieldId`：按行顺序定位首个端口错误字段。
  - `resolveFirstInvalidFieldId`：通用首错选择器（支持多段校验链）。
  - `scrollAndFocusFieldById`：统一滚动到字段并聚焦。

当前已在以下组件复用：

- `create-job-dialog.tsx`：容器录入保存前的有序校验与首错跳转。
- `create-container-dialog.tsx`：字段级错误出现后自动滚动并聚焦。

说明：业务校验规则与错误文案仍保留在各自页面/弹窗内，工具层不承载资源特定提示文案。

后续若新增 `Deployment/CronJob/Service` 复杂表单，可直接沿用该工具，避免重复实现校验与定位逻辑。

## 5. 路由与页面组织

- `app/(examples)/dashboard/[...slug]/page.tsx`：按 slug 选择资源页面组件。
- `app/(examples)/dashboard/components/resource-pages/*`：每个资源一个页面组件。
- 当前主要业务页面：`nodes/projects/workloads/jobs/pods/services/routes/configmaps/secrets/volumes/storageclasses`。

## 6. 配置与环境变量

- `KUBESPARK_API_BASE`：服务端代理上游地址（默认 `http://172.31.0.88:8080`）。
- `NEXT_PUBLIC_API_PROXY_BASE`：前端 API 基础路径（默认 `/api/kubespark`）。
- `NEXT_PUBLIC_LOCALE`：前端文案语言（`zh-cn` 或 `en-us`）。

## 7. 当前边界与注意项

- 代理层当前已实现 `GET/POST/PUT/DELETE`，`PATCH` 透传尚未实现。
- 代码库中仍有一部分历史/示例页面（如 `/clusters`）与主业务 `/dashboard` 并存。
- 部分旧文件存在中文编码异常文案，不影响功能但建议逐步清理。

## 8. 建议后续演进

- 评估是否增加 `PATCH` 能力，支持更细粒度的局部更新。
- 将模块元数据（GVR、YAML 类型、列定义）继续配置化，减少重复代码。
- 增加审计日志与权限维度文档，支撑生产可追踪性。
