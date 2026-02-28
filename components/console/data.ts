import { LayoutDashboard, Boxes, Bot, Container, Network, KeyRound, HardDrive, Settings, type LucideIcon } from "lucide-react";

export type MenuItem = { path: string; title: string; icon: LucideIcon };

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

export const kpiCards = [
  { label: "集群", value: "3", hint: "+1 本周" },
  { label: "节点", value: "24", hint: "21 Ready" },
  { label: "Pod", value: "532", hint: "8 Pending" },
  { label: "CPU 使用率", value: "62%", hint: "峰值 81%" }
];

export const tableData = [
  { name: "frontend-prod", namespace: "production", status: "Running", age: "12d" },
  { name: "gateway-prod", namespace: "production", status: "Running", age: "31d" },
  { name: "batch-reconcile", namespace: "ops", status: "Pending", age: "2h" },
  { name: "debug-shell", namespace: "dev", status: "Failed", age: "8m" }
];
