# CRDs Design (KubeSpark / tanqidi.com)

> 状态：当前为可落地的 v1alpha1 设计，优先保证 CRUD 可用，复杂校验与自动化控制器后续演进。

## 1. 设计目标

1. 统一使用 `tanqidi.com` 作为 CRD group，便于检索与治理。
2. 先跑通资源模型与界面交互（列表、创建、编辑、删除）。
3. 关系建模优先使用 `*Ref`（名称引用），避免重复存储和强耦合。
4. 先弱约束（schema 字段约束），后强约束（admission/controller）。

## 2. 当前 CRD 清单

> 以下条目已与 `deployment/crds/*.yaml` 实际内容对齐（group=`tanqidi.com`、version=`v1alpha1`、scope=`Cluster`）。

### 2.0 文件映射

- `workspace-crd.yaml` -> `Workspace`（`workspaces.tanqidi.com`）
- `workspace-namespace-binding-crd.yaml` -> `WorkspaceNamespaceBinding`（`workspacenamespacebindings.tanqidi.com`）
- `pipeline-project-crd.yaml` -> `PipelineProject`（`pipelineprojects.tanqidi.com`）
- `pipeline-crd.yaml` -> `Pipeline`（`pipelines.tanqidi.com`）
- `pipeline-run-crd.yaml` -> `PipelineRun`（`pipelineruns.tanqidi.com`，含 `status` 子资源）

### 2.1 Workspace

- Kind: `Workspace`
- GVR: `tanqidi.com/v1alpha1/workspaces`
- Scope: `Cluster`
- 作用：企业空间主对象。

核心字段：

- `spec.owner`：负责人（必填）。

说明：

- 描述统一走 `metadata.annotations.description`。
- 标签/注解使用 Kubernetes 原生 `metadata.labels` / `metadata.annotations`。

### 2.2 WorkspaceNamespaceBinding

- Kind: `WorkspaceNamespaceBinding`
- GVR: `tanqidi.com/v1alpha1/workspacenamespacebindings`
- Scope: `Cluster`
- 作用：表达 Workspace 与 Namespace 的绑定关系。

核心字段：

- `spec.workspaceRef.name`（必填）
- `spec.namespaceRef.name`（必填）

说明：

- 不直接改造 Namespace schema，不在 Namespace 上做业务字段扩展。
- 关系通过独立 Binding CRD 管理，便于审计、解绑、权限扩展。

### 2.3 PipelineProject

- Kind: `PipelineProject`
- GVR: `tanqidi.com/v1alpha1/pipelineprojects`
- Scope: `Cluster`
- 作用：流水线项目主对象，并显式归属到 Workspace。

核心字段：

- `spec.workspaceRef.name`（必填）
- `spec.displayName`（可选）
- `spec.description`（可选）

说明：

- PipelineProject 与 Workspace 的归属关系通过 `workspaceRef` 建模。

### 2.4 Pipeline

- Kind: `Pipeline`
- GVR: `tanqidi.com/v1alpha1/pipelines`
- Scope: `Cluster`
- 作用：流水线定义，并显式归属到 PipelineProject/Workspace，不直接表示某次执行。

核心字段：

- `spec.pipelineProjectRef.name`（必填）
- `spec.workspaceRef.name`（可选）
- `spec.data`（可选，类似 ConfigMap data：`key -> string`，可存任意 YAML/脚本内容）
- 描述：`metadata.annotations.description`（与其他模块保持一致）

说明：

- Pipeline 与 PipelineProject 的归属关系通过 `pipelineProjectRef` 统一建模。
- 不再将流水线细节拆成大量硬编码字段，避免前后端高成本适配。
- 约定可使用固定 key（例如 `drone.yml`）存储主流水线定义内容。

### 2.5 PipelineRun

- Kind: `PipelineRun`
- GVR: `tanqidi.com/v1alpha1/pipelineruns`
- Scope: `Cluster`
- 作用：流水线运行实例；每次点击“运行”创建一条新记录。

核心字段：

- `spec.pipelineRef.name`（必填）
- `spec.trigger.type`（可选，string，推荐值：`manual|cron|webhook`）
- `spec.data`（可选，运行时覆盖数据，`key -> string`）

状态字段（`status`）：

- `status.phase`：string（推荐值：`Pending|Queued|Running|Succeeded|Failed|Canceled`）
- `status.droneBuildNumber`
- `status.droneBuildLink`
- `status.startTime` / `status.completionTime`
- `status.conditions[]`

说明：

- `Pipeline` 存定义，`PipelineRun` 存执行历史，职责分离。
- 覆盖优先级：`Pipeline.spec.data` < `PipelineRun.spec.data`（同 key 后者覆盖前者）。

## 2.6 Schema 约束摘要（按当前 YAML）

- `Workspace.spec.owner`：必填，`1..128` 字符。
- `WorkspaceNamespaceBinding.spec.workspaceRef.name`：必填，`1..63` 字符。
- `WorkspaceNamespaceBinding.spec.namespaceRef.name`：必填，`1..63` 字符。
- `PipelineProject.spec.workspaceRef.name`：必填，`1..63` 字符。
- `PipelineProject.spec.displayName`：可选，`1..128` 字符。
- `PipelineProject.spec.description`：可选，`1..2048` 字符。
- `Pipeline.spec.pipelineProjectRef.name`：必填，`1..63` 字符。
- `Pipeline.spec.workspaceRef.name`：可选，`1..63` 字符。
- `Pipeline.spec.data`：可选，`map[string]string`。
- `PipelineRun.spec.pipelineRef.name`：必填，`1..63` 字符。
- `PipelineRun.spec.trigger.type`：可选，string。
- `PipelineRun.spec.data`：可选，`map[string]string`。
- `PipelineRun.status.droneBuildNumber`：`int64`，最小值 `1`。
- `PipelineRun.status.droneBuildLink`：最长 `2048` 字符。
- `PipelineRun.status.conditions[*].type`：必填，`1..128` 字符。
- `PipelineRun.status.conditions[*].reason`：可选，最长 `128` 字符。
- `PipelineRun.status.conditions[*].message`：可选，最长 `2048` 字符。

## 3. 关联关系约定

统一约定：

- 业务引用字段命名为 `xxxRef`。
- 第一阶段只要求 `name`：
    - `workspaceRef.name`
    - `pipelineProjectRef.name`
    - `namespaceRef.name`

示例：

```yaml
spec:
  pipelineProjectRef:
    name: tanqidi-backend
```

## 4. 校验策略（分阶段）

阶段 A（当前）：

1. 通过 OpenAPI schema 做基本字段校验（必填、长度、类型）。
2. 引用对象是否存在，暂不做跨资源强校验。

阶段 B（后续）：

1. Admission Webhook：校验 `workspaceRef`、`pipelineProjectRef`、`namespaceRef` 的目标对象必须存在。
2. Controller：自动回写 `status`（如 `Bound/Ready/Error`），并处理同步逻辑。

## 5. API 使用约定（GVR 通用接口）

统一通过后端 GVR 接口访问：

- `GET /kapis/v1alpha1/resources/{group}/{version}/{resource}`
- `POST /kapis/v1alpha1/resources/{group}/{version}/{resource}`
- `PUT /kapis/v1alpha1/resources/{group}/{version}/{resource}/{name}`
- `DELETE /kapis/v1alpha1/resources/{group}/{version}/{resource}/{name}`

对应本设计：

- Workspace: `/resources/tanqidi.com/v1alpha1/workspaces`
- WorkspaceNamespaceBinding: `/resources/tanqidi.com/v1alpha1/workspacenamespacebindings`
- PipelineProject: `/resources/tanqidi.com/v1alpha1/pipelineprojects`
- Pipeline: `/resources/tanqidi.com/v1alpha1/pipelines`
- PipelineRun: `/resources/tanqidi.com/v1alpha1/pipelineruns`

## 6. 命名建议

1. CRD 采用复数资源名（Kubernetes 约定）：`workspaces`、`pipelineprojects`、`pipelines`。
2. Binding 类资源名称建议包含两端语义：`workspacenamespacebindings`。
3. 资源实例命名建议稳定、可读，例如：
    - `workspace`: `tanqidi`
    - `binding`: `tanqidi-default`
    - `pipelineProject`: `tanqidi-backend`
    - `pipeline`: `tanqidi-backend-build`
    - `pipelineRun`: `tanqidi-backend-build-xxxxx`（推荐 `generateName`）

## 7. 后续扩展建议

1. 增加 `WorkspaceMemberBinding`，承载成员与角色绑定。
2. 增加 `status.conditions` 规范，统一前端状态展示。

## 8. 后端最小改造清单（对接 Drone）

1. 资源入口保持不变，继续使用统一 GVR：
   - `Pipeline`: `tanqidi.com/v1alpha1/pipelines`
   - `PipelineRun`: `tanqidi.com/v1alpha1/pipelineruns`
2. 控制器监听 `PipelineRun` 的新增事件。
3. Reconcile 过程最小闭环：
   - 读取 `PipelineRun.spec.pipelineRef` 对应 `Pipeline`
   - 合并数据（`Pipeline.spec.data` + `PipelineRun.spec.data`）
   - 从约定 key（如 `drone.yml`）读取流水线定义并调 Drone 触发构建
   - 回写 `PipelineRun.status`（phase/build number/link/conditions）
4. 前端“运行”按钮行为：创建 `PipelineRun`，不直接调用 Drone API。
5. 错误处理：
   - 参数问题：回写 `Failed` + `reason/message`
   - Drone 调用失败：回写 `Failed` 并保留错误详情
   - 幂等重试：仅针对 `Pending/Queued` 阶段执行触发逻辑

