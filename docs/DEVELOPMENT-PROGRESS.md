# 开发进度（CRUD 首期）

更新时间：2026-04-02

## 1. 范围说明

首期目标聚焦 **资源 CRUD**（Create / Read / Update / Delete）与 YAML 查看/编辑相关能力。  
**监控相关功能（指标/图表/告警/日志分析）暂不纳入首期计划。**

## 2. 基础能力进度 

### 已完成

- 统一 GVR 资源请求链路（领域层 + `/api/kubespark` 代理）。
- 代理层已支持：`GET / POST / PUT / DELETE`（用于创建、更新、删除闭环）。
- 资源列表统一能力：
  - 分页、筛选、轮询刷新（3s）。
  - 行操作（查看 YAML、删除等）。
  - 批量删除。
- 通用删除确认弹窗与 YAML 查看弹窗。
- Pod 日志能力（普通/实时）与日志下载（默认最近 2000 行）。
- Pod 终端能力（WebSocket exec，会话命令输入/输出）。
- 新增同源 WS 代理入口 `/api/kubespark-ws/*`（通过 `server.js` 处理 upgrade）。

### 已完成（结构优化）

- 创建能力按资源拆分到独立模块（如 `configmaps.ts / secrets.ts / services.ts / jobs.ts`）。
- 抽出表单通用工具：`app/lib/kubespark/form-validation.ts`
  - 首个错误字段定位
  - 自动滚动 + 聚焦
  - 不承载业务文案（文案留在页面侧）
- Job/CronJob 与 Workload 的存储能力完成共享抽取：
  - 前端共享 `storage-volume-list.tsx`（统一卷列表交互）
  - 前端共享 `pod-storage-utils.ts`（存储构建/反解析）
  - 后端共享 `app/lib/kubespark/pod-storage.ts`（Job/CronJob 存储挂载拼装）
- Job/CronJob 与 Workload 的容器能力完成共享抽取：
  - 前端共享 `container-list-panel.tsx`（统一容器列表 UI）
  - 控制层共享 `use-container-editor.ts`（容器增删改、校验、编辑态）
  - `create-job-dialog.*` 与 `create-workload-dialog.*` 已统一接入
- Job/CronJob 存储与容器交互一致性修正：
  - 卷列表改为显式 `编辑/删除` 按钮（不再点整行进入编辑）
  - Job/CronJob 卷删除补齐确认弹窗
- Job/CronJob 存储回显与提交链路已稳定：
  - 支持 `YAML -> 表单 -> YAML` 回显闭环
  - 兼容自定义卷名（`volumes[].name` 与 `persistentVolumeClaim.claimName` 分离保留）
- Job/CronJob 配置挂载能力补齐：
  - 补齐“添加配置挂载”交互入口与编辑态流程（新增/编辑/删除）
  - 与 Workload 对齐 YAML 切换与创建/保存提交链路
- 创建/编辑弹窗的项目选择交互统一：
  - 统一使用可输入可选择的 Combobox（替代纯 Select）
  - 统一在 Dialog 内指定弹层 container，修复“可见但无法选中”的问题
- 路由与卷声明创建弹窗的项目选择策略调整：
  - 去除“自动带入第一个项目”逻辑，改为用户显式选择/输入
- 抽出公共字段组件：
  - 新增 `project-namespace-field.tsx`，统一“项目”字段的标签、错误、描述与 Combobox 行为

## 3. 资源维度进度

状态说明：`✅ 完成` / `🟡 部分完成` / `⏳ 未开始`

| 资源 | 列表/查询 | 创建 | 编辑 | 删除 | 查看 YAML | 备注 |
|---|---|---|---|---|---|---|
| 项目（Namespace） | ✅ | ✅ | ⏳ | ✅ | ✅ | 编辑暂未提供独立入口 |
| 配置字典（ConfigMap） | ✅ | ✅ | ✅ | ✅ | ✅ | 支持表单与 YAML 模式 |
| 保密字典（Secret） | ✅ | ✅ | ✅ | ✅ | ✅ | 使用 `stringData` 录入，更新走 `PUT` |
| 服务（Service） | ✅ | ✅ | ✅ | ✅ | ✅ | 多步骤，支持 YAML 联动 |
| 任务（Job） | ✅ | ✅ | ✅ | ✅ | ✅ | 创建/编辑共用同一套弹窗链路 |
| 定时任务（CronJob） | ✅ | ✅ | ✅ | ✅ | ✅ | 复用 Job 页面与创建编辑流程 |
| 容器组（Pod） | ✅ | ⏳ | ⏳ | ✅ | ✅ | 以运维查看/删除为主 |
| 应用路由（Ingress） | ✅ | ✅ | ✅ | ✅ | ✅ | 已支持路由规则多条录入、YAML 互转、编辑回显 |
| 存储卷（PV/PVC） | ✅ | ✅ | ⏳ | ✅ | ✅ | 已支持 PV/PVC 创建（表单 + YAML） |
| 存储类（StorageClass） | ✅ | ⏳ | ⏳ | ✅ | ✅ | 当前无创建/编辑弹窗 |
| 节点（Node） | ✅ | N/A | N/A | N/A | ⏳ | 当前以列表信息为主 |
| 工作负载总览 | ✅ | ⏳ | ⏳ | ✅ | ✅ | 汇总页，不直接承载创建 |

## 4. 首期未完成项（CRUD 视角）

### 高优先级

- Job 创建剩余步骤补全（当前部分步骤为占位文案）。
- StorageClass 的创建/编辑能力。

### 中优先级

- 节点 YAML 查看能力（如需）。
- 各资源创建/编辑页的校验规则进一步统一（复用更多工具函数）。
- CRUD 相关交互文案与异常提示统一。

## 5. 明确不做（首期）

- 资源监控大盘（CPU/内存/网络时序图）。
- 告警规则管理与通知链路。
- 日志聚合分析（检索/上下文跳转）。
- 可观测性追踪（Trace）相关能力。

## 6. 下一阶段建议

1. 先补齐 CRUD 缺口资源（Job 编辑、Ingress/StorageClass 创建编辑）。  
2. 完成 Job/CronJob 表单剩余步骤，确保“从表单到资源体”闭环稳定。  
3. 最后再评估是否进入监控模块（作为二期，不影响首期上线）。

## 7. UI 交互约定（新增）

- Dialog 内使用 `Combobox`（尤其 `ComboboxChips` 多选）时，`ComboboxContent` 必须显式指定 `container` 为弹窗内部容器 `ref`。
- 推荐写法：`<ComboboxContent anchor={anchor} container={dialogContainerRef}>`。
- 原因：默认 portal 到 `body` 时，可能被 Dialog 的焦点/外部交互层拦截，表现为“列表可见但 hover/选中失效”。

