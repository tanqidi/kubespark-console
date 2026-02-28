import {
  IconAdjustments,
  IconBox,
  IconBraces,
  IconDatabase,
  IconInfoCircle,
  IconLayoutDashboard,
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
  { title: "Overview", labelKey: "overview", path: "/overview", icon: IconLayoutDashboard },
  { title: "Nodes", labelKey: "nodes", path: "/nodes", icon: IconServer },
  { title: "Projects", labelKey: "projects", path: "/projects", icon: IconBox },
  {
    title: "Workloads",
    labelKey: "workloadsGroup",
    icon: IconTopologyStar3,
    children: [
      { title: "Workloads", labelKey: "workloads", path: "/workloads", icon: IconStack2 },
      { title: "Jobs", labelKey: "jobs", path: "/jobs", icon: IconBraces },
      { title: "Pods", labelKey: "pods", path: "/pods", icon: IconTopologyRing3 },
      { title: "Services", labelKey: "services", path: "/services", icon: IconNetwork },
      { title: "Routes", labelKey: "routes", path: "/routes", icon: IconRoute },
    ],
  },
  {
    title: "Configuration",
    labelKey: "config",
    icon: IconSettings,
    children: [
      { title: "ConfigMaps", labelKey: "configmaps", path: "/configmaps" },
      { title: "Secrets", labelKey: "secrets", path: "/secrets" },
    ],
  },
  {
    title: "Storage",
    labelKey: "storage",
    icon: IconDatabase,
    children: [
      { title: "Volumes", labelKey: "volumes", path: "/volumes" },
      { title: "StorageClasses", labelKey: "storageclasses", path: "/storageclasses" },
    ],
  },
  { title: "Cluster Settings", labelKey: "settings", path: "/settings", icon: IconAdjustments },
  { title: "About", labelKey: "about", path: "/about", icon: IconInfoCircle },
]
