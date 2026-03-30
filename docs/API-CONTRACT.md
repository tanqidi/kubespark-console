# KubeSpark 前端 API 调用约定

更新时间：2026-03-25

## 1. 目标

本文定义当前前端与 KubeSpark 资源接口的统一调用约定，覆盖：

- 统一 GVR 资源路径。
- 列表/详情/创建/更新/删除的一致规则。
- 当前项目内 Job/CronJob 与 Workload 的实际提交契约。

## 2. 统一入口与基础路径

前端默认走 Next.js 代理：

- 代理前缀：`/api/kubespark`
- 资源基础路径：
  `/api/kubespark/kapis/v1alpha1/resources/{group}/{version}/{resource}`

上游地址由服务端环境变量控制：

- `KUBESPARK_API_BASE`（默认 `http://172.31.0.88:8080`）

## 3. 认证约定

- 请求头：`Authorization: Bearer {token}`
- token 来源：`localStorage/sessionStorage` 的 `kubespark_token`
- 401：前端会跳转登录页并携带 `redirect`

## 4. 响应解包约定

后端常见 envelope：

```json
{
  "code": 200,
  "message": "success",
  "data": { "items": [] }
}
```

前端处理规则：

- `code === 200` 判定成功
- 失败优先展示 `message`
- 列表默认从 `data.items` 读取

## 5. 支持的方法

代理层已支持：

- `GET`
- `POST`
- `PUT`
- `DELETE`

当前未支持：

- `PATCH`

## 6. 统一资源读操作

### 6.1 列表

`GET /resources/{group}/{version}/{resource}`

支持 query：

- `namespace`
- `labelSelector`
- `fieldSelector`

### 6.2 按名详情（当前主实现）

统一使用列表 + `fieldSelector`：

`GET /resources/{group}/{version}/{resource}?namespace={ns}&fieldSelector=metadata.name={name}`

说明：当前 `fetchResourceByName` 采用该方式，避免部分后端详情路径 `405`。

## 7. 统一写操作

### 7.1 删除

`DELETE /resources/{group}/{version}/{resource}/{name}`

- namespaced 资源建议带 `namespace`
- cluster 级资源不带 `namespace`

### 7.2 创建与更新（前端提交形态）

当前项目内已稳定的写操作分两类：

1. 结构化 payload（由领域层组装资源体）
- `ConfigMap` / `Secret` / `Service` / `Job` / `CronJob`
- 前端提交业务字段，领域层函数在 `app/lib/kubespark/*.ts` 组装 Kubernetes 资源对象

2. 直接提交 manifest payload
- `Workload`（Deployment/StatefulSet/DaemonSet）
- 前端在弹窗逻辑层先构建完整 manifest，再作为 `payload` 提交

## 8. Job/CronJob 关键契约

当前 `Job/CronJob` 提交字段（简化）：

- 基础：`kind/name/namespace/description`
- 定时：`schedule`（CronJob）
- 策略：`backoffLimit/completions/parallelism/activeDeadlineSeconds`
- Pod：`restartPolicy/containers/storageList`

说明：

- `Job/CronJob` 不使用 Workload 的 `replicas` 语义。
- 并发执行语义使用 `parallelism/completions`。

## 9. Workload 关键契约

`Workload` 提交字段（简化）：

- `kind/name/namespace`
- `payload`（完整 workload manifest）

其中 `payload.spec.template.spec` 中可包含：

- `containers/initContainers`
- `volumes`（由存储与配置挂载逻辑生成）

## 10. GVR 对照（当前前端使用）

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

## 11. 错误排查建议

- `401`：token 缺失或失效
- `404`：GVR 路径或资源名错误
- `405`：方法不支持或错误详情路径
- `502`：代理无法连通上游（检查 `KUBESPARK_API_BASE`）

## 12. 代码对应

- 请求与 GVR：`app/lib/kubespark/common.ts`
- 创建/更新聚合导出：`app/lib/kubespark/resource-create.ts`
- 删除：`app/lib/kubespark/resource-delete.ts`
- YAML：`app/lib/kubespark/resource-yaml.ts`
- Job/CronJob：`app/lib/kubespark/jobs.ts`
- Workload：`app/lib/kubespark/workloads.ts`
