# 🚀 Drone + K8s CRD 动态 Pipeline 方案（TODO）

## 📚 参考文档

* [https://docs.drone.io/extensions/configuration/?utm_source=chatgpt.com](https://docs.drone.io/extensions/configuration/?utm_source=chatgpt.com)

---

# 🎯 目标

实现：

* ❌ 不使用 `.drone.yml`
* ❌ 不依赖 Git 仓库配置
* ✅ 使用 K8s CRD 作为 CI 配置源
* ✅ 通过接口动态生成 Drone Pipeline

---

# 🧠 核心思路

```text
Drone Server
    ↓ POST /config
Config API（自定义服务）
    ↓
读取 K8s CRD（Pipeline）
    ↓
转换为 Drone YAML
    ↓
返回给 Drone
    ↓
Drone Runner 执行
```

---

# 🏗️ 架构组成

## 1️⃣ Drone Server

配置：

* DRONE_YAML_ENDPOINT=[http://config-api.xxx.svc.cluster.local/config](http://config-api.xxx.svc.cluster.local/config)
* DRONE_YAML_SECRET=xxx

作用：

* 每次 build 时调用外部接口获取 pipeline

---

## 2️⃣ Config API（核心服务）

职责：

* 接收 Drone 请求
* 调用 K8s API
* 读取 CRD
* 转换为 Drone YAML
* 返回结果

---

## 3️⃣ K8s CRD（Pipeline）

作为 CI 配置存储：

```yaml
apiVersion: cicd.kubespark.io/v1
kind: Pipeline
metadata:
  name: kubespark-console
  namespace: default
spec:
  repo: tanqidi/kubespark-console
  branch: dev

  build:
    image: node:18
    commands:
      - npm install
      - npm run build

  deploy:
    image: bitnami/kubectl
    commands:
      - kubectl apply -f k8s.yaml
```

---

# 🔌 Config API 接口协议

## 请求

```http
POST /config
Content-Type: application/json
X-Drone-Signature: <HMAC-SHA256>
```

```json
{
  "repo": { "namespace": "tanqidi", "name": "kubespark-console" },
  "build": { "branch": "dev", "event": "push" }
}
```

## 响应（成功）

```http
200 OK
Content-Type: text/plain
```

```yaml
kind: pipeline
type: kubernetes
name: dynamic

steps:
  - name: build
    image: node:18
    commands:
      - npm install
      - npm run build
```

## 响应（回退到 .drone.yml）

```http
204 No Content
```

---

# ☸️ Config API 访问 K8s（关键实现）

* 运行在集群内：使用 InClusterConfig
* 读取 CRD：CustomObjectsApi

伪代码：

```js
kc.loadFromCluster()
const api = kc.makeApiClient(CustomObjectsApi)

const crd = await api.getNamespacedCustomObject(
  'cicd.kubespark.io',
  'v1',
  'default',
  'pipelines',
  repoName
)
```

---

# 🔐 RBAC（最小权限）

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: config-api-role
  namespace: default
rules:
  - apiGroups: ["cicd.kubespark.io"]
    resources: ["pipelines"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: config-api-binding
  namespace: default
subjects:
  - kind: ServiceAccount
    name: default
    namespace: kubespark
roleRef:
  kind: Role
  name: config-api-role
  apiGroup: rbac.authorization.k8s.io
```

---

# 🔄 关键流程（落地步骤）

1. 部署 Config API（集群内）
2. 配置 Drone Server：DRONE_YAML_ENDPOINT
3. 定义并创建 Pipeline CRD
4. 在 API 中：根据 repo/branch 读取 CRD
5. 转换为 Drone YAML 并返回
6. 触发 build 验证执行

---

# 🧩 映射策略（建议）

* 简单：CRD 名称 = repo 名称
* 进阶：CRD.spec.repo 完整匹配（namespace/name）
* 分支：CRD.spec.branch 或多环境字段

---

# 🚀 进阶 TODO

* [ ] 多环境（dev/test/prod）
* [ ] 多集群发布（kubeconfig 选择）
* [ ] UI 可视化编辑 CRD
* [ ] 模板化（前端/后端/通用流水线）
* [ ] 缓存层（减少 API/CRD 读取）
* [ ] 签名校验（HMAC）

---

# 🧠 结论

* CRD = CI 配置源（数据库）
* Config API = 编译器（CRD → YAML）
* Drone = 执行引擎

👉 实现“脱离 Git 的 CI/CD 控制面”
