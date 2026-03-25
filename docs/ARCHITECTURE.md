# KubeSpark React 项目架构总览

更新时间：2026-03-25

## 1. 项目定位

本项目是基于 Next.js App Router 的 Kubernetes 控制台前端，目标是：

- 统一通过 GVR 接口访问资源。
- 提供一致的列表、筛选、YAML 查看、创建/编辑、删除交互。
- 通过轮询刷新保证页面状态与集群状态逐步一致。

主入口：`/dashboard`。

## 2. 分层架构

```text
UI 层 (app/(examples)/dashboard/components)
  ├─ 资源页面：workloads/jobs/pods/services/routes/... 
  ├─ 资源弹窗：create-*-dialog.tsx
  ├─ 共享片段：container-list-panel.tsx / storage-volume-list.tsx
  ├─ 通用表格：DataTable + TableToolbar + ColumnsFactory
  └─ 通用弹窗：DeleteConfirmDialog + MonacoViewerDialog

交互编排层
  ├─ create-*-dialog.controller.ts
  └─ 共享 Hook：use-container-editor.ts

纯逻辑层
  ├─ create-*-dialog.logic.ts
  └─ 存储工具：pod-storage-utils.ts

领域层 (app/lib/kubespark)
  ├─ common.ts: 请求、鉴权、响应解包、GVR URL
  ├─ resource-rows.ts: 列表映射
  ├─ resource-yaml.ts/resource-document.ts: YAML 拉取与规范化
  ├─ resource-delete.ts: 删除能力
  ├─ resource-create.ts: 创建/更新能力聚合导出
  ├─ jobs.ts/workloads.ts/services.ts/...: 资源写操作实现
  └─ pod-storage.ts: Job/CronJob 存储挂载拼装共享逻辑

网关层
  └─ app/api/kubespark/[[...path]]/route.ts (GET/POST/PUT/DELETE)

上游层
  └─ /kapis/resources.kubespark.io/v1alpha1/resources/{group}/{version}/{resource}
```

## 3. 核心请求链路

### 3.1 列表

页面 `useEffect` 首次加载 + 定时轮询 -> `fetch*Rows` -> `fetchResourceCollection` -> `/api/kubespark` 代理 -> 上游 -> 行映射展示。

### 3.2 查看 YAML

行操作 -> `fetchNamespacedResourceYaml` -> `fetchResourceByName(fieldSelector)` -> `resource-document.ts` 规范化 -> Monaco 展示。

### 3.3 创建/编辑

- Job/CronJob：表单快照 -> `jobs.ts(createJob/updateJob)` 组装资源体 -> `POST/PUT`
- Workload：表单快照先生成 manifest -> `workloads.ts(createWorkload/updateWorkload)` 提交 `payload`

### 3.4 删除

统一删除确认弹窗 -> `resource-delete.ts` -> 删除请求成功后等待轮询刷新。

## 4. 当前关键设计决策

### 4.1 统一 GVR 与统一代理

所有资源尽量走同一请求约定，避免模块散落专用接口。

### 4.2 复杂弹窗采用三层结构

- `*.tsx`：视图
- `*.controller.ts`：状态与提交流程
- `*.logic.ts`：纯函数与数据转换

### 4.3 存储与容器能力已做跨模块共享

存储共享：

- UI：`storage-volume-list.tsx`
- 前端转换：`pod-storage-utils.ts`
- 后端拼装：`app/lib/kubespark/pod-storage.ts`

容器共享：

- UI：`container-list-panel.tsx`
- 交互逻辑：`use-container-editor.ts`

收益：Job/CronJob 与 Workload 的交互一致、维护入口集中、重复代码显著减少。

### 4.4 统一校验与错误定位

`app/lib/kubespark/form-validation.ts` 负责“首错定位 + 滚动聚焦”，业务文案保留在页面侧。

## 5. 路由与页面组织

- `app/(examples)/dashboard/[...slug]/page.tsx`：按 slug 分发页面组件
- `resource-pages/*`：资源页与资源弹窗
- 当前主页面覆盖：`nodes/projects/workloads/jobs/pods/services/routes/configmaps/secrets/volumes/storageclasses`

## 6. 配置与环境变量

- `KUBESPARK_API_BASE`：代理上游地址
- `NEXT_PUBLIC_API_PROXY_BASE`：前端代理前缀（默认 `/api/kubespark`）
- `NEXT_PUBLIC_LOCALE`：前端文案语言
- Windows 终端建议：优先使用 PowerShell 7，其次 Git Bash（避免编码乱码）

## 7. 当前边界

- 代理支持 `GET/POST/PUT/DELETE`，尚未支持 `PATCH`。
- 监控类能力（指标/告警/日志分析）不在当前 CRUD 首期范围。

## 8. 下一步建议

1. 补齐 Ingress/PV(PVC)/StorageClass 的创建/编辑链路。
2. 继续抽取可重复的表单片段（如策略区、基础信息区）。
3. 评估 `PATCH` 透传能力，减少全量 `PUT` 负担。
