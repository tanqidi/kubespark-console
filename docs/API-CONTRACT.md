# KubeSpark 前端 API 调用约定

更新时间：2026-03-06

## 1. 目的

本文定义前端调用 KubeSpark 资源接口时的统一约定，目标是：

- 所有资源统一走 GVR 接口，减少专用旧接口分支。
- 列表、详情、删除使用一致的路径和参数规则。
- 便于前后端对齐和后续接口收敛。

## 2. 基础路径

前端实际请求默认走 Next.js 代理：

- 代理前缀：`/api/kubespark`
- 资源基础路径：`/api/kubespark/kapis/resources.kubespark.io/v1alpha1/resources/{group}/{version}/{resource}`

上游真实地址由服务端环境变量控制：

- `KUBESPARK_API_BASE`（默认 `http://172.31.0.88:8080`）

## 3. 认证约定

- 请求头必须携带：`Authorization: Bearer {token}`
- token 来源：`localStorage` 或 `sessionStorage` 的 `kubespark_token`
- 未授权（401）时前端会自动跳转登录页并带 `redirect`

## 4. 响应约定

后端通常返回 envelope：

```json
{
  "code": 200,
  "message": "success",
  "data": { "items": [] }
}
```

前端按以下规则处理：

- `code === 200` 视为成功
- 失败时优先使用 `message` 作为错误提示
- 列表数据默认从 `data.items` 读取

## 5. 统一资源操作

## 5.1 列表查询（推荐）

`GET /resources/{group}/{version}/{resource}`

支持参数：

- `namespace`：命名空间过滤（仅 namespaced 资源）
- `labelSelector`：标签过滤
- `fieldSelector`：字段过滤（常用于按名称查单条）

示例：

- 全量 services：`/resources/core/v1/services`
- 指定命名空间：`/resources/core/v1/services?namespace=default`
- 按名称查单条：`/resources/core/v1/services?namespace=default&fieldSelector=metadata.name=nginx-service`

## 5.2 单条详情（当前前端采用）

使用“列表 + `fieldSelector`”模式，不直接依赖 item 详情 GET：

`GET /resources/{group}/{version}/{resource}?namespace={ns}&fieldSelector=metadata.name={name}`

说明：

- 这是当前前端 `fetchResourceByName` 的统一实现方式。
- 可避免部分后端对 `/resource/{name}` 的 405 限制。

## 5.3 删除

`DELETE /resources/{group}/{version}/{resource}/{name}`

参数：

- namespaced 资源建议附带 `namespace`
- cluster 级资源不需要 `namespace`

示例：

- 删除 Pod：`DELETE /resources/core/v1/pods/nginx-xxx?namespace=default`
- 删除 Namespace：`DELETE /resources/core/v1/namespaces/test`
- 删除 StorageClass：`DELETE /resources/storage.k8s.io/v1/storageclasses/nfs-client`

## 6. 资源 GVR 对照（当前前端已使用）

- Pods：`core/v1/pods`
- Services：`core/v1/services`
- ConfigMaps：`core/v1/configmaps`
- Secrets：`core/v1/secrets`
- Namespaces：`core/v1/namespaces`
- PersistentVolumeClaims：`core/v1/persistentvolumeclaims`
- PersistentVolumes：`core/v1/persistentvolumes`
- Nodes：`core/v1/nodes`
- Deployments：`apps/v1/deployments`
- StatefulSets：`apps/v1/statefulsets`
- DaemonSets：`apps/v1/daemonsets`
- Jobs：`batch/v1/jobs`
- CronJobs：`batch/v1/cronjobs`
- Ingresses：`networking.k8s.io/v1/ingresses`
- StorageClasses：`storage.k8s.io/v1/storageclasses`

## 7. 按当前模块可直接调的列表 URL

- 项目：`/resources/core/v1/namespaces`
- 节点：`/resources/core/v1/nodes`
- 工作负载：
  - `/resources/apps/v1/deployments`
  - `/resources/apps/v1/statefulsets`
  - `/resources/apps/v1/daemonsets`
- 任务：
  - `/resources/batch/v1/jobs`
  - `/resources/batch/v1/cronjobs`
- 容器组：`/resources/core/v1/pods`
- 服务：`/resources/core/v1/services`
- 应用路由：`/resources/networking.k8s.io/v1/ingresses`
- 配置字典：`/resources/core/v1/configmaps`
- 保密字典：`/resources/core/v1/secrets`
- 存储：
  - `/resources/core/v1/persistentvolumeclaims`
  - `/resources/core/v1/persistentvolumes`
  - `/resources/storage.k8s.io/v1/storageclasses`

## 8. 命名空间参数规则

- namespaced 资源（pods/services/deployments/...）：
  - 列表可不传 `namespace`（默认全命名空间）
  - 删除、按名查询建议传 `namespace`
- cluster 资源（namespaces/nodes/storageclasses/persistentvolumes）：
  - 不传 `namespace`

## 9. 当前前端实现边界

当前代理层已实现：

- `GET`
- `POST`
- `DELETE`

当前代理层未实现：

- `PUT`
- `PATCH`

说明：

- 如果后端已支持更新接口，前端新增编辑能力前需先补代理层方法透传。

## 10. 错误码排查建议

- `401`：token 无效或缺失
- `404`：GVR 路径错误、资源不存在、或 group/version/resource 不匹配
- `405`：调用了后端未开放的方法或错误详情路径（建议改成 `fieldSelector` 查询）
- `502`：Next 代理无法连接上游（检查 `KUBESPARK_API_BASE`）

## 11. 与前端代码对应关系

- 统一请求封装：`app/lib/kubespark/common.ts`
- YAML 查询封装：`app/lib/kubespark/resource-yaml.ts`
- 删除封装：`app/lib/kubespark/resource-delete.ts`
- 模块列表映射：`app/lib/kubespark/resource-rows.ts`
