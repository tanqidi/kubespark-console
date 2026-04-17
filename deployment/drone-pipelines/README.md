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

- 本目录当前仅提供 Drone Server/Runner 的 Deployment，不包含 Service/Ingress 清单。
- Runner 通过以下变量连接 Server（均来自 `drone-secret`）：
  - `DRONE_RPC_HOST` <- `drone-secret.DRONE_SERVER_HOST`
  - `DRONE_RPC_PROTO` <- `drone-secret.DRONE_SERVER_PROTO`
  - `DRONE_RPC_SECRET` <- `drone-secret.DRONE_RPC_SECRET`
- `DRONE_SERVER_HOST` 当前示例值为 `172.31.0.88:30001`，请替换为你实际可达的 Drone Server 地址。

### 3. 存储与时区

- Server 使用 PVC `drone-data` 挂载到 `/data`（用于持久化 Drone 数据）。
- Server 与 Runner 都挂载主机 `/etc/localtime` 到容器，保持与节点时区一致。
- 当前目录未提供 `PersistentVolumeClaim/drone-data` 清单，请提前创建。

### 4. 命名空间与账号

- 当前清单运行在 `kubespark` 命名空间。
- Server 使用 `serviceAccountName: default`（实验配置）。
- Runner 使用 `serviceAccountName: kubespark-admin`（依赖主部署中的 RBAC 清单）。

### 5. Runner 运行参数（当前）

- `DRONE_RUNNER_CAPACITY=2`
- `DRONE_RUNNER_NAME=my-first-runner`
- 已配置代理变量：
  - `HTTP_PROXY=http://172.31.0.1:7890`
  - `HTTPS_PROXY=http://172.31.0.1:7890`
  - `NO_PROXY=127.0.0.1,localhost,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,.svc,.cluster.local,kubernetes.default.svc,kubernetes.default`

### 6. 开发期宿主机环境变量（必须保持一致）

开发期间需要在宿主机 `/etc/environment` 增加以下变量，供流程识别：

```bash
DRONE_YAML_SECRET=aKzfRGBgZVARtEIarLGHvicy1qjSe9zHXhivgcD3hcYktzbRC4pSGldyxhKa580d
```

要求：

- 该值必须与 `deployment/drone-pipelines/drone-secret.yaml` 中 `DRONE_YAML_SECRET` 完全一致。
- 修改后请重新加载环境变量或重启相关服务/容器，避免出现 `invalid drone yaml signature`。

## 文件职责

- `drone-secret.yaml`：OAuth、RPC Secret、Server 地址协议等敏感配置。
- `kubespark-drone-server.yaml`：部署 Drone Server（`drone/drone:2`）并挂载 `drone-data` PVC。
- `kubespark-drone-runner.yaml`：部署 Kubernetes Runner 并通过 RPC 接入 Server。

## 建议部署顺序

```bash
kubectl apply -f deployment/kubespark-rbac.yaml
kubectl apply -f deployment/drone-pipelines/drone-secret.yaml
kubectl apply -f deployment/drone-pipelines/kubespark-drone-server.yaml
kubectl apply -f deployment/drone-pipelines/kubespark-drone-runner.yaml
```

## 后续演进建议（上线前）

- 使用专用 `ServiceAccount + RBAC`，替代 `default`。
- 将 `NodePort` 迁移为 `Ingress + TLS`。
- 将 `drone-secret.yaml` 改为外部密钥管理方案（如 External Secrets）。
- 增加资源限制、健康检查、审计与备份策略。
