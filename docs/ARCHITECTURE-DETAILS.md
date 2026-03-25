# KubeSpark React 架构细节

更新时间：2026-03-25

## 1. 目录结构（当前）

```text
app/
├─ api/kubespark/[[...path]]/route.ts
│  └─ 代理层：GET/POST/PUT/DELETE 透传到 KUBESPARK_API_BASE
├─ (examples)/dashboard/
│  ├─ [...slug]/page.tsx
│  │  └─ 资源页面分发器
│  └─ components/
│     ├─ resource-pages/
│     │  ├─ *-page.tsx
│     │  ├─ create-*-dialog.tsx
│     │  ├─ create-*-dialog.controller.ts
│     │  ├─ create-*-dialog.logic.ts
│     │  ├─ container-list-panel.tsx      # 容器列表共享 UI
│     │  ├─ storage-volume-list.tsx       # 存储卷列表共享 UI
│     │  ├─ pod-storage-utils.ts          # 前端存储构建/反解析共享
│     │  └─ use-container-editor.ts       # 容器编辑交互共享 Hook
│     ├─ data-table.tsx
│     └─ table/{columns-factory,table-toolbar}.tsx
└─ lib/kubespark/
   ├─ common.ts
   ├─ resource-rows.ts
   ├─ resource-yaml.ts
   ├─ resource-document.ts
   ├─ resource-delete.ts
   ├─ resource-create.ts
   ├─ jobs.ts / workloads.ts / services.ts / configmaps.ts / secrets.ts
   ├─ pod-storage.ts                      # Job/CronJob 后端存储拼装共享
   └─ auth.ts
```

## 2. 路由到页面映射

`app/(examples)/dashboard/[...slug]/page.tsx` 按 `slug[0]` 映射页面：

- `nodes` -> `NodesPageClient`
- `projects` -> `ProjectsPageClient`
- `workloads` -> `WorkloadsPageClient`
- `jobs` -> `JobsPageClient`
- `pods` -> `PodsPageClient`
- `services` -> `ServicesPageClient`
- `routes` -> `RoutesPageClient`
- `configmaps` -> `ConfigMapsPageClient`
- `secrets` -> `SecretsPageClient`
- `volumes` -> `VolumesPageClient`
- `storageclasses` -> `StorageClassesPageClient`

## 3. 模块能力（当前实现）

| 模块 | 列表 | 创建 | 编辑 | 删除 | YAML |
|---|---|---|---|---|---|
| Namespace | ✅ | ✅ | ⏳ | ✅ | ✅ |
| ConfigMap | ✅ | ✅ | ✅ | ✅ | ✅ |
| Secret | ✅ | ✅ | ✅ | ✅ | ✅ |
| Service | ✅ | ✅ | ✅ | ✅ | ✅ |
| Job | ✅ | ✅ | ✅ | ✅ | ✅ |
| CronJob | ✅ | ✅ | ✅ | ✅ | ✅ |
| Workload(Deploy/STS/DS) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pod | ✅ | ⏳ | ⏳ | ✅ | ✅ |
| Ingress | ✅ | ⏳ | ⏳ | ✅ | ✅ |
| PV/PVC | ✅ | ⏳ | ⏳ | ✅ | ✅ |
| StorageClass | ✅ | ⏳ | ⏳ | ✅ | ✅ |
| Node | ✅ | N/A | N/A | N/A | ⏳ |

## 4. 统一客户端细节（`common.ts`）

### 4.1 URL 与查询

- 列表路径：`/kapis/resources.kubespark.io/v1alpha1/resources/{group}/{version}/{resource}`
- 支持 query：`namespace/fieldSelector/labelSelector`

### 4.2 查询封装

- `fetchResourceCollection`
- `fetchResourceByName`（使用 `fieldSelector=metadata.name=...`）

### 4.3 请求处理

- 自动读取 `kubespark_token`
- 注入 `Authorization`
- GET in-flight 去重
- envelope 统一解包
- 401 自动跳登录

## 5. API 代理层（`app/api/kubespark/[[...path]]/route.ts`）

- 已支持：`GET/POST/PUT/DELETE`
- 未支持：`PATCH`
- 透传 `Authorization`、query、body
- 上游失败返回 `502` + `upstreamUrl`

## 6. 写操作实现模式

### 6.1 结构化输入 -> 领域层组装资源体

- `configmaps.ts`
- `secrets.ts`
- `services.ts`
- `jobs.ts`（Job/CronJob）

### 6.2 直接提交 manifest payload

- `workloads.ts`（Deployment/StatefulSet/DaemonSet）
- manifest 在 `create-workload-dialog.logic.ts` 中构建

## 7. Job/CronJob 与 Workload 的共享抽取细节

### 7.1 存储能力

- 共享 UI：`storage-volume-list.tsx`
- 共享前端转换：`pod-storage-utils.ts`
- 共享后端拼装：`app/lib/kubespark/pod-storage.ts`

### 7.2 容器能力

- 共享 UI：`container-list-panel.tsx`
- 共享交互 Hook：`use-container-editor.ts`

### 7.3 当前效果

- 两类弹窗在容器/存储区交互一致。
- 改一处共享组件或共享 Hook，可同时作用于 Job/CronJob 与 Workload。

## 8. YAML 规范化（`resource-document.ts`）

已覆盖：`pod/job/cronjob/service/ingress/configmap/secret/storageclass/pv/pvc/deployment/statefulset/daemonset/namespace`。

默认清理：

- 运行时 metadata 字段（uid/resourceVersion/managedFields 等）
- `status`

## 9. 表格与交互

- `DataTable`：选择、分页、列控制、批量删除、前端拖拽排序
- `TableToolbar`：正常态/选中态工具栏切换
- 删除策略：只发请求，不本地硬删，依赖轮询回收状态

## 10. 轮询策略

- 首次加载 + 每 3 秒静默刷新
- 静默刷新失败仅日志输出，不打断当前页面
- 组件卸载时清理定时器

## 11. 环境变量

- `KUBESPARK_API_BASE`
- `NEXT_PUBLIC_API_PROXY_BASE`
- `NEXT_PUBLIC_LOCALE`

## 12. 当前未覆盖项

- Ingress / PV(PVC) / StorageClass 的创建编辑链路
- Node YAML 查看
- PATCH 透传

## 13. 终端建议（Windows）

为避免编码乱码，命令行建议优先级如下：

1. PowerShell 7（推荐）
2. Git Bash（可选）
