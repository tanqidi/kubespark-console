# 注意（请先阅读）

> **请勿直接在生产环境部署本目录内容。**  
> 当前 `deployment/drone-pipelines` 仍处于**测试/实验阶段**，配置项、权限模型与部署方式可能继续调整。

## 架构说明（实验版）

本目录用于在 Kubernetes 中验证 Drone Pipeline 的最小可运行链路，包含 3 个核心清单：

- `drone-secret.yaml`
- `kubespark-drone-server.yaml`
- `kubespark-drone-runner.yaml`

### 1. 组件关系

- `drone-secret`：统一提供 Drone Server 与 Runner 的关键环境变量。
- `kubespark-drone-server`：Drone 控制面（Web/API），负责仓库授权、任务调度与状态管理。
- `kubespark-drone-runner`：Kubernetes Runner，向 Drone Server 注册并执行流水线任务。

### 2. 网络与访问路径

- Drone Server 通过 `Service/NodePort` 暴露：
  - `Service`: `kubespark-drone-server`
  - `NodePort`: `30001`
- Runner 通过以下变量连接 Server：
  - `DRONE_RPC_HOST` <- `drone-secret.DRONE_SERVER_HOST`
  - `DRONE_RPC_PROTO` <- `drone-secret.DRONE_SERVER_PROTO`
  - `DRONE_RPC_SECRET` <- `drone-secret.DRONE_RPC_SECRET`

### 3. 存储与时区

- Server 使用 PVC `drone-data` 挂载到 `/data`（用于持久化 Drone 数据）。
- Server 与 Runner 都挂载主机 `/etc/localtime` 到容器，保持与节点时区一致。

### 4. 命名空间与账号

- 当前清单运行在 `kubespark` 命名空间。
- 当前 `serviceAccountName` 为 `default`（仅用于实验验证，后续建议切换为最小权限专用 SA）。

## 文件职责

- `drone-secret.yaml`：OAuth、RPC Secret、Server 地址协议等敏感配置。
- `kubespark-drone-server.yaml`：部署 Drone Server + NodePort 服务。
- `kubespark-drone-runner.yaml`：部署 Kubernetes Runner 并通过 RPC 接入 Server。

## 后续演进建议（上线前）

- 使用专用 `ServiceAccount + RBAC`，替代 `default`。
- 将 `NodePort` 迁移为 `Ingress + TLS`。
- 将 `drone-secret.yaml` 改为外部密钥管理方案（如 External Secrets）。
- 增加资源限制、健康检查、审计与备份策略。
