import {
  LayoutDashboard,
  Boxes,
  Bot,
  Container,
  Network,
  KeyRound,
  HardDrive,
  Settings,
  type LucideIcon
} from "lucide-react";

export type MenuItem = { path: string; title: string; icon: LucideIcon };
export type RowData = Record<string, string>;

export const menuItems: MenuItem[] = [
  { path: "/overview", title: "概览", icon: LayoutDashboard },
  { path: "/projects", title: "项目", icon: Boxes },
  { path: "/nodes", title: "节点", icon: Bot },
  { path: "/pods", title: "容器组", icon: Container },
  { path: "/services", title: "服务", icon: Network },
  { path: "/secrets", title: "Secrets", icon: KeyRound },
  { path: "/storageclasses", title: "存储类", icon: HardDrive },
  { path: "/settings", title: "集群设置", icon: Settings }
];

export const overviewKpis = [
  { label: "集群", value: "3", hint: "+1 本周" },
  { label: "节点", value: "24", hint: "21 Ready" },
  { label: "Pod", value: "532", hint: "8 Pending" },
  { label: "CPU 使用率", value: "62%", hint: "峰值 81%" }
];

export const moduleConfigs: Record<
  string,
  {
    subtitle: string;
    columns: { key: string; label: string }[];
    rows: RowData[];
    actions: string[];
  }
> = {
  "/overview": {
    subtitle: "集群运行概况与近期波动。",
    columns: [
      { key: "name", label: "工作负载" },
      { key: "namespace", label: "命名空间" },
      { key: "status", label: "状态" },
      { key: "age", label: "运行时长" }
    ],
    rows: [
      { name: "frontend-prod", namespace: "production", status: "Running", age: "12d" },
      { name: "gateway-prod", namespace: "production", status: "Running", age: "31d" },
      { name: "batch-reconcile", namespace: "ops", status: "Pending", age: "2h" },
      { name: "debug-shell", namespace: "dev", status: "Failed", age: "8m" }
    ],
    actions: ["创建工作负载", "查看节点健康", "进入项目配额"]
  },
  "/projects": {
    subtitle: "项目与命名空间配额管理。",
    columns: [
      { key: "name", label: "项目" },
      { key: "status", label: "状态" },
      { key: "owner", label: "负责人" },
      { key: "age", label: "创建时长" }
    ],
    rows: [
      { name: "production", status: "Active", owner: "platform", age: "210d" },
      { name: "staging", status: "Active", owner: "release", age: "128d" },
      { name: "devops", status: "Active", owner: "ops", age: "342d" },
      { name: "sandbox", status: "Terminating", owner: "qa", age: "5d" }
    ],
    actions: ["新建项目", "设置配额", "查看资源配比"]
  },
  "/nodes": {
    subtitle: "节点健康与资源压力分布。",
    columns: [
      { key: "name", label: "节点" },
      { key: "status", label: "状态" },
      { key: "cpu", label: "CPU" },
      { key: "memory", label: "内存" }
    ],
    rows: [
      { name: "node-1", status: "Ready", cpu: "58%", memory: "64%" },
      { name: "node-2", status: "Ready", cpu: "49%", memory: "52%" },
      { name: "node-3", status: "Unschedulable", cpu: "5%", memory: "18%" },
      { name: "node-4", status: "Ready", cpu: "76%", memory: "71%" }
    ],
    actions: ["节点详情", "污点管理", "查看监控"]
  },
  "/pods": {
    subtitle: "Pod 生命周期和异常排查入口。",
    columns: [
      { key: "name", label: "Pod" },
      { key: "namespace", label: "命名空间" },
      { key: "status", label: "状态" },
      { key: "node", label: "节点" }
    ],
    rows: [
      { name: "api-87cdd9fbc-gv5lz", namespace: "production", status: "Running", node: "node-1" },
      { name: "worker-6f7788d68b-k2q9h", namespace: "ops", status: "Running", node: "node-4" },
      { name: "jobs-clean-29123", namespace: "dev", status: "Succeeded", node: "node-2" },
      { name: "migration-temp", namespace: "staging", status: "Pending", node: "-" }
    ],
    actions: ["重启 Pod", "查看日志", "删除异常 Pod"]
  },
  "/services": {
    subtitle: "Service 发现与流量入口映射。",
    columns: [
      { key: "name", label: "服务" },
      { key: "type", label: "类型" },
      { key: "clusterIp", label: "Cluster IP" },
      { key: "ports", label: "端口" }
    ],
    rows: [
      { name: "api-svc", type: "ClusterIP", clusterIp: "10.233.9.31", ports: "80/TCP" },
      { name: "gateway", type: "LoadBalancer", clusterIp: "10.233.18.2", ports: "80,443" },
      { name: "prometheus", type: "ClusterIP", clusterIp: "10.233.12.88", ports: "9090" },
      { name: "mysql", type: "Headless", clusterIp: "None", ports: "3306" }
    ],
    actions: ["创建服务", "查看路由", "端点检查"]
  },
  "/secrets": {
    subtitle: "敏感配置项和证书密钥管理。",
    columns: [
      { key: "name", label: "Secret" },
      { key: "namespace", label: "命名空间" },
      { key: "type", label: "类型" },
      { key: "items", label: "数据项" }
    ],
    rows: [
      { name: "docker-registry", namespace: "production", type: "kubernetes.io/dockerconfigjson", items: "1" },
      { name: "tls-gateway", namespace: "production", type: "kubernetes.io/tls", items: "2" },
      { name: "db-creds", namespace: "ops", type: "Opaque", items: "3" },
      { name: "oauth-client", namespace: "staging", type: "Opaque", items: "2" }
    ],
    actions: ["新建 Secret", "轮换凭据", "权限审计"]
  },
  "/storageclasses": {
    subtitle: "存储类策略与动态卷供应配置。",
    columns: [
      { key: "name", label: "存储类" },
      { key: "provisioner", label: "供应器" },
      { key: "binding", label: "绑定策略" },
      { key: "reclaim", label: "回收策略" }
    ],
    rows: [
      { name: "ssd-fast", provisioner: "csi.hostpath", binding: "WaitForFirstConsumer", reclaim: "Delete" },
      { name: "hdd-standard", provisioner: "csi.hostpath", binding: "Immediate", reclaim: "Retain" },
      { name: "nfs-shared", provisioner: "nfs.csi.k8s.io", binding: "Immediate", reclaim: "Retain" },
      { name: "ceph-rbd", provisioner: "rbd.csi.ceph.com", binding: "WaitForFirstConsumer", reclaim: "Delete" }
    ],
    actions: ["查看默认类", "设置回收策略", "卷绑定分析"]
  },
  "/settings": {
    subtitle: "集群级策略、插件和安全控制。",
    columns: [
      { key: "name", label: "配置项" },
      { key: "scope", label: "作用域" },
      { key: "status", label: "状态" },
      { key: "updated", label: "最近更新" }
    ],
    rows: [
      { name: "API 审计日志", scope: "Cluster", status: "Enabled", updated: "2d" },
      { name: "镜像策略", scope: "Namespace", status: "Enabled", updated: "5d" },
      { name: "告警转发", scope: "Cluster", status: "Enabled", updated: "1d" },
      { name: "准入策略", scope: "Cluster", status: "Draft", updated: "4h" }
    ],
    actions: ["编辑策略", "导出配置", "审计记录"]
  }
};
