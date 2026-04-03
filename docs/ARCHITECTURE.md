# KubeSpark React 架构文档

更新时间：2026-04-01

## 1. 项目定位

本项目是基于 Next.js App Router 的 Kubernetes 控制台前端，主入口 `/dashboard`，当前聚焦：

- 统一通过 GVR 接口访问资源
- 提供一致的 CRUD 与 YAML 交互体验
- 通过轮询机制让页面状态与集群状态逐步一致

## 2. 分层架构

```text
UI 层 (app/(console)/dashboard/components)
  ├─ 资源页面：workloads/jobs/pods/services/routes/...
  ├─ 资源弹窗：create-*-dialog.tsx
  ├─ 共享片段：container-list-panel.tsx / storage-volume-list.tsx
  ├─ 通用表格：DataTable + TableToolbar + ColumnsFactory
  └─ 通用弹窗：DeleteConfirmDialog + MonacoViewerDialog

交互编排层
  ├─ create-*-dialog.controller.ts
  └─ use-container-editor.ts

纯逻辑层
  ├─ create-*-dialog.logic.ts
  └─ pod-storage-utils.ts

领域层 (app/lib/kubespark)
  ├─ common.ts: 请求、鉴权、解包、GVR URL
  ├─ resource-rows.ts: 列表映射
  ├─ resource-yaml.ts / resource-document.ts: YAML 拉取与规范化
  ├─ resource-delete.ts: 删除能力
  ├─ resource-create.ts: 创建/更新聚合导出
  ├─ jobs.ts / workloads.ts / services.ts / configmaps.ts / secrets.ts
  └─ pod-storage.ts: Job/CronJob 存储挂载共享拼装

网关层
  ├─ app/api/kubespark/[[...path]]/route.ts (GET/POST/PUT/DELETE)
  └─ server.js (WebSocket upgrade: /api/kubespark-ws/*)
```

## 3. 目录结构

```text
app/
├─ api/kubespark/[[...path]]/route.ts
├─ (console)/dashboard/
│  ├─ [...slug]/page.tsx
│  └─ components/resource-pages/
│     ├─ *-page.tsx
│     ├─ create-*-dialog.tsx
│     ├─ create-*-dialog.controller.ts
│     ├─ create-*-dialog.logic.ts
│     ├─ container-list-panel.tsx
│     ├─ storage-volume-list.tsx
│     ├─ pod-storage-utils.ts
│     └─ use-container-editor.ts
└─ lib/kubespark/
   ├─ common.ts
   ├─ resource-rows.ts
   ├─ resource-yaml.ts
   ├─ resource-document.ts
   ├─ resource-delete.ts
   ├─ resource-create.ts
   ├─ jobs.ts / workloads.ts / services.ts / configmaps.ts / secrets.ts
   ├─ pod-storage.ts
   └─ auth.ts
```

## 4. 路由与页面映射

`app/(console)/dashboard/[...slug]/page.tsx` 按 `slug[0]` 映射：

- `nodes`
- `projects`
- `workloads`
- `jobs`
- `pods`
- `services`
- `routes`
- `configmaps`
- `secrets`
- `volumes`
- `storageclasses`

## 5. 进度文档说明

资源维度进度（能力矩阵）统一维护在 `docs/DEVELOPMENT-PROGRESS.md`，本架构文档不再重复维护，避免双处不一致。

## 6. 核心请求链路

1. 列表：`fetch*Rows` -> `fetchResourceCollection` -> `/api/kubespark` -> 上游接口  
2. 查看 YAML：`fetchResourceByName(fieldSelector)` -> `resource-document.ts` 规范化 -> Monaco  
3. 创建/编辑：
- Job/CronJob：结构化表单 -> `jobs.ts` 组装资源体 -> `POST/PUT`
- Workload：表单构建 manifest -> `workloads.ts` 提交 payload  
4. 删除：统一确认弹窗 -> `resource-delete.ts` -> 轮询刷新

## 7. 统一客户端细节（`common.ts`）

- 路径：`/kapis/v1alpha1/resources/{group}/{version}/{resource}`
- query：`namespace` / `fieldSelector` / `labelSelector`
- 自动读取 `kubespark_token` 并注入 `Authorization`
- GET in-flight 去重
- envelope 统一解包
- 401 自动跳转登录

## 8. API 代理能力

`app/api/kubespark/[[...path]]/route.ts` 当前支持：

- 已支持：`GET` / `POST` / `PUT` / `DELETE`
- 未支持：`PATCH`
- 透传 `Authorization`、query、body
- 上游失败返回 `502` + `upstreamUrl`

`server.js` 当前支持：

- `/api/kubespark-ws/*` WebSocket upgrade 代理
- 非 `/api/kubespark-ws/*` 的 upgrade（如 `/_next/webpack-hmr`）交还 Next 处理
- 终端链路中，前端先建立同源 WS，再由代理连接后端 exec WS

## 9. 共享抽取

存储能力：

- UI：`storage-volume-list.tsx`
- 前端转换：`pod-storage-utils.ts`
- 后端拼装：`app/lib/kubespark/pod-storage.ts`

容器能力：

- UI：`container-list-panel.tsx`
- Hook：`use-container-editor.ts`

## 10. YAML 规范化

`resource-document.ts` 默认清理运行时字段（如 `uid/resourceVersion/managedFields/status`），已覆盖 pod/job/cronjob/service/ingress/configmap/secret/storageclass/pv/pvc/deployment/statefulset/daemonset/namespace 等资源。

## 11. 表格与轮询

- `DataTable`：选择、分页、列控制、批量删除、拖拽排序
- `TableToolbar`：正常态/选中态切换
- 轮询：首次加载 + 每 3 秒静默刷新（失败仅日志）

## 12. Dialog 内 Combobox 约定

- 在 Dialog 内使用 `ComboboxContent` 必须传 `container` 到弹窗容器 ref。
- 推荐：`<ComboboxContent anchor={anchor} container={dialogContainerRef} />`
- 目的：避免 portal 到 `body` 后 hover/选中异常。

## 13. 环境变量

- `KUBESPARK_API_BASE`
- `NEXT_PUBLIC_API_PROXY_BASE`
- `NEXT_PUBLIC_LOCALE`

## 14. 当前边界

- 代理层暂未支持 `PATCH`
- StorageClass/Node 等资源仍有部分 CRUD 缺口
- 高频输入路径仍有性能优化空间
