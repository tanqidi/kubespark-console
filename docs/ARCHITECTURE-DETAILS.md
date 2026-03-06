# KubeSpark React 架构细节

更新时间：2026-03-06

## 1. 目录细分

```text
app/
├─ api/kubespark/[[...path]]/route.ts         # API 代理层（转发到 KUBESPARK_API_BASE）
├─ (examples)/dashboard/
│  ├─ [...slug]/page.tsx                      # 资源页面分发器
│  └─ components/
│     ├─ resource-pages/*.tsx                 # 各资源页面
│     ├─ data-table.tsx                       # 通用表格
│     └─ table/{columns-factory,table-toolbar}.tsx
└─ lib/kubespark/
   ├─ common.ts                               # 请求封装、GVR URL、鉴权、响应解包
   ├─ resource-rows.ts                        # 列表映射
   ├─ resource-yaml.ts                        # YAML 拉取
   ├─ resource-document.ts                    # YAML 规范化
   ├─ resource-delete.ts                      # 删除封装
   ├─ pods.ts / nodes.ts / projects.ts        # 部分模块的专用封装
   └─ auth.ts                                 # 登录与 token 管理
```

## 2. 路由到模块映射

`app/(examples)/dashboard/[...slug]/page.tsx` 将 `slug[0]` 映射到页面组件：

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

## 3. 模块能力矩阵

| 模块 | 列表数据来源 | 列表 GVR | YAML 能力 | 删除能力 |
|---|---|---|---|---|
| 项目 | `fetchNamespaces` (`projects.ts`) | `core/v1/namespaces` | `namespace` 规范化 | 单删 + 批量 |
| 节点 | `fetchNodeResourceRows` (`nodes.ts`) | `core/v1/nodes` + `core/v1/pods` | 暂无 | 暂无 |
| 工作负载 | `fetchWorkloadRows` | `apps/v1/{deployments,statefulsets,daemonsets}` | `deployment/statefulset/daemonset` | 单删 + 批量 |
| 任务 | `fetchJobRows` | `batch/v1/{jobs,cronjobs}` | `job/cronjob` | 单删 + 批量 |
| 容器组 | `fetchPodResourceRows` (`pods.ts`) | `core/v1/pods` | `pod` | 单删 + 批量 |
| 服务 | `fetchServiceRows` | `core/v1/services` | `service` | 单删 + 批量 |
| 应用路由 | `fetchRouteRows` | `networking.k8s.io/v1/ingresses` | `ingress` | 单删 + 批量 |
| 配置字典 | `fetchConfigMapRows` | `core/v1/configmaps` | `configmap` | 单删 + 批量 |
| 保密字典 | `fetchSecretRows` | `core/v1/secrets` | `secret`（含可读文本解码到 `stringData`） | 单删 + 批量 |
| 持久卷声明/持久卷 | `fetchVolumeRows` | `core/v1/persistentvolumeclaims` + `core/v1/persistentvolumes` | `persistentvolumeclaim/persistentvolume` | PVC+PV 单删与批量 |
| 存储类 | `fetchStorageClassRows` | `storage.k8s.io/v1/storageclasses` | `storageclass` | 单删 + 批量 |

说明：所有已实现删除的模块均采用“仅发请求，不本地立即删除表格数据”，等待轮询刷新最终状态。

## 4. 统一 GVR 客户端细节（`common.ts`）

## 4.1 URL 构建

- 列表路径：
  - `/kapis/resources.kubespark.io/v1alpha1/resources/{group}/{version}/{resource}`
- 支持 query：
  - `namespace`
  - `fieldSelector`
  - `labelSelector`

## 4.2 查询封装

- `fetchResourceCollection`：返回 `{ requestUrl, payload, items }`
- `fetchResourceByName`：底层使用 `fieldSelector=metadata.name={name}` + 二次匹配

## 4.3 请求处理

- 自动读取 `localStorage/sessionStorage` 的 `kubespark_token`
- 自动注入 `Authorization: Bearer <token>`
- `GET` 请求去重（同 URL 同时发起只保留一份 in-flight Promise）
- 统一解析后端 envelope：`{ code, message, data }`
- `401` 自动跳转登录页并保留 `redirect`

## 5. API 代理层细节（`app/api/kubespark/[[...path]]/route.ts`）

- 支持方法：`GET`、`POST`、`DELETE`
- 上游地址：`KUBESPARK_API_BASE`（默认 `http://172.31.0.88:8080`）
- 透传 `Authorization` 和 query 参数
- 代理失败返回 `502`，附带 `upstreamUrl`

当前缺口：尚未实现 `PUT/PATCH` 转发。

## 6. YAML 规范化细节（`resource-document.ts`）

已支持类型：

- `pod`
- `job`
- `cronjob`
- `service`
- `ingress`
- `configmap`
- `secret`
- `storageclass`
- `persistentvolume`
- `persistentvolumeclaim`
- `deployment`
- `statefulset`
- `daemonset`
- `namespace`

通用清理策略：

- 清理 metadata 运行时字段：`uid/resourceVersion/generation/creationTimestamp/managedFields/...`
- 清理 `status`
- 保留核心声明字段（如 `spec/data/parameters/provisioner/...`）

## 7. 通用表格与交互细节

## 7.1 `DataTable`

- 行选择、分页、排序、列过滤（由 TanStack Table 提供）
- 拖拽排序（dnd-kit，仅前端视图排序）
- `autoResetPageIndex: false`，并在数据变化时只在越界情况下修正页码
- 通过 `onDeleteSelectedRows` 接入批量删除回调

## 7.2 `TableToolbar`

- 正常态：左侧业务筛选/页签 + 右侧“自定义列/创建”
- 选中态：切换为“删除”按钮并弹出统一批量删除确认框

## 7.3 `columns-factory`

- 自动注入：拖拽列 + checkbox 列 + 操作菜单列
- 状态列渲染：
  - 健康状态（如 `Running/Normal/Bound/...`）显示绿色图标
  - 非健康状态显示橙色样式

## 8. 轮询刷新策略

资源页面普遍采用：

- 首次加载：`loadRows(false)`
- 定时刷新：每 3 秒 `loadRows(true)`
- 静默刷新失败：仅 `console.error`，不打断当前列表
- 组件卸载时清理 `setInterval`

## 9. 认证与登录

- 登录接口：`POST /kapis/auth.kubespark.io/v1/login`
- token 存储：
  - `rememberMe = true` -> `localStorage`
  - 否则 -> `sessionStorage`
- 由 `common.ts` 自动读取并注入请求头

## 10. 环境变量

- `KUBESPARK_API_BASE`：代理上游地址（服务端）
- `NEXT_PUBLIC_API_PROXY_BASE`：前端请求前缀（默认 `/api/kubespark`）
- `NEXT_PUBLIC_LOCALE`：国际化语言键（`zh-cn`/`en-us`）

## 11. 扩展新资源模块建议流程

1. 在 `resource-rows.ts` 新增 `fetchXxxRows`（只做映射，不做 UI）。
2. 在 `resource-delete.ts` 增加 `deleteXxx`（如需删除能力）。
3. 在 `resource-document.ts` 增加 `documentType` 与 normalize（如需查看 YAML）。
4. 新建 `resource-pages/xxx-page.tsx` 复用 `DataTable + DeleteConfirmDialog + MonacoViewerDialog`。
5. 在 `resource-pages/index.ts` 和 `[...slug]/page.tsx` 注册路由组件。
6. 在 `sidebar-data.ts` 增加导航入口。
