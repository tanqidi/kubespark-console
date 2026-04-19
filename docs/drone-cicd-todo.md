# Drone CI/CD 集成说明（前端）

更新时间：2026-04-19

本文说明 `kubespark-console` 当前与 Drone 相关的真实交互，不再使用历史方案。

## 1. 当前链路

```text
用户创建 PipelineRun
  -> 后端触发 Drone Build
  -> Drone Server 调用 /kapis/v1alpha1/drone/yaml
  -> 后端从 PipelineRun 注解读取 tanqidi.com/drone-yaml 并返回
  -> Drone 执行构建
  -> 后端回写 PipelineRun 注解 tanqidi.com/drone（构建状态）
```

## 2. `.drone.yml` 的来源与覆盖

- 流水线级默认配置：`Pipeline.metadata.annotations["tanqidi.com/drone-yaml"]`
- 运行时覆盖配置：`PipelineRun.metadata.annotations["tanqidi.com/drone-yaml"]`

规则：

- 创建运行时，如果用户不编辑 `.drone.yml`，沿用流水线注解内容。
- 如果用户在运行页面编辑 `.drone.yml`，保存后写入本次 `PipelineRun` 注解，仅覆盖本次运行。

## 3. 代码仓库配置

- 流水线编辑页维护注解：`tanqidi.com/code-repository`（格式 `owner/repo`）。
- PipelineRun 页面显示并使用当前流水线的代码仓库配置。
- 运行时将使用当前流水线的代码仓库。

## 4. Drone Secret（流水线变量/密钥）维护

前端通过 GVR 访问后端 Drone 代理：

- `GET /resources/drone/v1/secrets`
- `POST /resources/drone/v1/secrets`
- `DELETE /resources/drone/v1/secrets/{name}`

保存策略：

- 有 `id` 且值非空：删除旧 key 后重新创建（前端层面等价更新）。
- 无 `id` 且值非空：创建。
- 值为空：跳过修改。
- 删除操作需二次确认。

## 5. 仓库下拉来源

- 前端可读取 `GET /resources/drone/v1/repos` 获取仓库选项。
- 创建流水线时会触发 `POST /resources/drone/v1/reposync` 同步仓库，降低仓库列表滞后问题。

## 6. 注意事项

- 用户不需要进入 Drone UI 绑定流程；平台侧使用统一 Drone 配置与代理接口。
- Drone 配置由后端固定从 `kubespark/kubespark-secret` 读取。
- 若后端返回 `503`，通常是 `DRONE_SERVER` / `DRONE_TOKEN` 缺失或不可用。

