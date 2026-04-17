# Drone 动态 YAML 集成记录（已落地）

更新时间：2026-04-14

## 1. 当前状态

- 已接入 Drone Configuration Extension。
- 已实现“构建前从平台读取 YAML”，不强依赖仓库 `.drone.yml`。
- 已启用官方共享密钥验签：`DRONE_YAML_SECRET`。

## 2. 实际链路

```text
前端创建 PipelineRun
  -> Kubespark 后端触发 Drone Build
  -> Drone Server 请求 Kubespark /kapis/v1alpha1/drone/yaml
  -> Kubespark 从 K8s Secret 读取 YAML 并返回
  -> Drone 执行构建
  -> Kubespark 回写 PipelineRun 注解 tanqidi.com/drone
```

## 3. 必配参数

### 3.1 Drone Server

- `DRONE_YAML_ENDPOINT=http://<kubespark-host>:8080/kapis/v1alpha1/drone/yaml`
- `DRONE_YAML_SECRET=<shared-secret>`

### 3.2 Kubespark 后端（处理 `/drone/yaml` 的进程）

- 后端统一从 `kubespark/kubespark-secret` 读取：
  - `DRONE_SERVER`
  - `DRONE_TOKEN`
  - `DRONE_YAML_SECRET`（必须与 Drone Server 完全一致）

### 3.3 配置约束（当前）

- 不再依赖宿主机 `/etc/environment` 设置 `DRONE_YAML_SECRET`。
- 相关配置统一维护在 `Secret/kubespark-secret`。

## 4. YAML 存储位置

Kubespark 当前从固定 Secret 读取：

- namespace: `kubespark`
- name: `kubespark-drone-yaml-secret`

key 匹配优先级：

1. `owner__repo`
2. `owner_repo`
3. `owner-repo`
4. `owner.repo`
5. `repo`

## 5. 调试日志要点

成功链路应看到：

- `[drone-yaml] request ...`
- `[drone-yaml] hit: owner=... repo=... key=...`
- `[drone-yaml] response: format=json`
- `POST /api/repos/{owner}/{repo}/builds status=200`
- `[pipeline-run] trigger build success ...`

常见错误：

- `missing DRONE_YAML_SECRET`：`kubespark-secret` 缺少该键或值为空。
- `invalid drone yaml signature`：两端 secret 不一致，或改完未重启进程。
- `406 Not Acceptable`：扩展响应协商不匹配（现已兼容 Drone vendor accept）。

## 6. 后续优化项

- 支持在 UI 的“高级设置”直接录入 YAML（可选）。
- 支持多环境 YAML（dev/test/prod）映射。
- 给 YAML 来源增加版本号与审计字段。
