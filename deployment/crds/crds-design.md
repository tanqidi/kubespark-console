# CRDs Design (KubeSpark / tanqidi.com)

> 状态：当前为可落地的 v1alpha1 设计，优先保证 CRUD 可用，复杂校验与自动化控制器后续演进。

## 1. 设计目标

1. 统一使用 `tanqidi.com` 作为 CRD group，便于检索与治理。
2. 先跑通资源模型与界面交互（列表、创建、编辑、删除）。
3. 关系建模优先使用 `*Ref`（名称引用），避免重复存储和强耦合。
4. 先弱约束（schema 字段约束），后强约束（admission/controller）。

## 2. 当前 CRD 清单

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
- 作用：流水线定义，并显式归属到 PipelineProject。

核心字段：

- `spec.pipelineProjectRef.name`（必填）
- `spec.source.url`（必填）
- `spec.source.branch`（可选）
- `spec.source.authSecretRef.name`（可选）

说明：

- Pipeline 与 PipelineProject 的归属关系通过 `pipelineProjectRef` 统一建模。
- 认证信息建议使用 Secret 引用，不直接明文存储凭据。

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

## 6. 命名建议

1. CRD 采用复数资源名（Kubernetes 约定）：`workspaces`、`pipelineprojects`、`pipelines`。
2. Binding 类资源名称建议包含两端语义：`workspacenamespacebindings`。
3. 资源实例命名建议稳定、可读，例如：
   - `workspace`: `tanqidi`
   - `binding`: `tanqidi-default`
   - `pipelineProject`: `tanqidi-backend`
   - `pipeline`: `tanqidi-backend-build`

## 7. 后续扩展建议

1. 增加 `WorkspaceMemberBinding`，承载成员与角色绑定。
2. 给 Pipeline 增加 `trigger`、`runnerRef`、`retentionPolicy`。
3. 增加 `status.conditions` 规范，统一前端状态展示。

