import {
  IconAdjustments,
  IconBox,
  IconBraces,
  IconDatabase,
  IconGitBranch,
  IconInfoCircle,
  IconNetwork,
  IconRoute,
  IconServer,
  IconSettings,
  IconStack2,
  IconTopologyStar3,
  IconTopologyRing3,
  type Icon,
} from "@tabler/icons-react"

export type SidebarMenuItem = {
  title: string
  labelKey?: string
  path?: string
  icon?: Icon
  children?: SidebarMenuItem[]
}

export const kubesparkSidebarMenu: SidebarMenuItem[] = [
  // { title: "概览", labelKey: "overview", path: "/overview", icon: IconLayoutDashboard },
  { title: "节点", labelKey: "nodes", path: "/nodes", icon: IconServer },
  { title: "项目", labelKey: "projects", path: "/projects", icon: IconBox },
  // { title: "流水线", labelKey: "pipelines", path: "/pipelines", icon: IconGitBranch },
  { title: "企业空间", labelKey: "workspaces", path: "/workspaces", icon: IconBox },
  {
    title: "应用负载",
    labelKey: "workloadsGroup",
    icon: IconTopologyStar3,
    children: [
      { title: "工作负载", labelKey: "workloads", path: "/workloads", icon: IconStack2 },
      { title: "任务", labelKey: "jobs", path: "/jobs", icon: IconBraces },
      { title: "容器组", labelKey: "pods", path: "/pods", icon: IconTopologyRing3 },
      { title: "服务", labelKey: "services", path: "/services", icon: IconNetwork },
      { title: "应用路由", labelKey: "routes", path: "/routes", icon: IconRoute },
    ],
  },
  {
    title: "配置",
    labelKey: "config",
    icon: IconSettings,
    children: [
      { title: "配置字典", labelKey: "configmaps", path: "/configmaps" },
      { title: "保密字典", labelKey: "secrets", path: "/secrets" },
      { title: "服务账号", labelKey: "serviceaccounts", path: "/serviceaccounts" },
    ],
  },
  { title: "自定义资源", labelKey: "customresources", path: "/customresources", icon: IconAdjustments },
  {
    title: "存储",
    labelKey: "storage",
    icon: IconDatabase,
    children: [
      { title: "持久卷声明", labelKey: "volumes", path: "/volumes" },
      { title: "存储类", labelKey: "storageclasses", path: "/storageclasses" },
    ],
  },
  // { title: "集群设置", labelKey: "settings", path: "/settings", icon: IconAdjustments },
  { title: "关于", labelKey: "about", path: "/about", icon: IconInfoCircle },
]
