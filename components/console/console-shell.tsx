"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, Search, PanelLeft, Plus } from "lucide-react";
import { menuItems, moduleConfigs, overviewKpis, type RowData } from "@/components/console/data";
import { fetchNamespaces } from "@/app/lib/kubespark/projects";
import { fetchNodes } from "@/app/lib/kubespark/nodes";
import { fetchPods } from "@/app/lib/kubespark/pods";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statusVariantMap: Record<string, "default" | "secondary" | "outline"> = {
  Running: "default",
  running: "default",
  Ready: "default",
  ready: "default",
  Active: "default",
  Enabled: "default",
  pending: "secondary",
  Pending: "secondary",
  Unschedulable: "secondary",
  unschedulable: "secondary",
  Terminating: "secondary",
  Draft: "secondary",
  Failed: "outline",
  failed: "outline",
  Succeeded: "outline",
  succeeded: "outline",
  offline: "outline",
  Unknown: "outline"
};

export function ConsoleShell() {
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<RowData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePath = useMemo(() => {
    if (pathname === "/clusters") return "/overview";
    return pathname.replace("/clusters", "") || "/overview";
  }, [pathname]);

  const currentTitle = menuItems.find((x) => x.path === activePath)?.title || "模块";
  const moduleConfig = moduleConfigs[activePath] || moduleConfigs["/overview"];

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);

      if (!["/projects", "/nodes", "/pods"].includes(activePath)) {
        setRows(moduleConfig.rows);
        return;
      }

      setLoading(true);
      try {
        if (activePath === "/projects") {
          const data = await fetchNamespaces();
          if (cancelled) return;
          setRows(
            data.map((x) => ({
              name: x.name,
              status: x.status,
              labels: String(x.labels),
              annotations: String(x.annotations),
              age: x.age
            }))
          );
        } else if (activePath === "/nodes") {
          const data = await fetchNodes();
          if (cancelled) return;
          setRows(
            data.map((x) => ({
              name: x.name,
              status: x.status,
              role: x.role,
              ip: x.ip,
              cpu: `${x.cpuTotal.toFixed(1)} cores`,
              memory: `${x.memoryTotal.toFixed(1)} GiB`
            }))
          );
        } else if (activePath === "/pods") {
          const data = await fetchPods();
          if (cancelled) return;
          setRows(
            data.map((x) => ({
              name: x.name,
              namespace: x.namespace,
              status: x.status,
              node: x.node,
              age: x.age
            }))
          );
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "加载失败");
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activePath, moduleConfig.rows]);

  const filteredRows = useMemo(() => {
    const currentRows = rows || [];
    if (!search.trim()) return currentRows;
    const q = search.toLowerCase();
    return currentRows.filter((row) => Object.values(row).some((v) => v.toLowerCase().includes(q)));
  }, [rows, search]);

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-zinc-200 bg-zinc-100 p-4 lg:sticky lg:top-0 lg:h-screen">
          <div className="mb-6 flex items-center gap-2 px-2">
            <div className="h-3 w-3 rounded-full border border-zinc-900" />
            <div className="font-semibold">KubeSpark Inc.</div>
          </div>

          <Button className="mb-4 w-full justify-start bg-zinc-900 text-zinc-50 hover:bg-zinc-800">
            <Plus className="mr-2 h-4 w-4" /> Quick Create
          </Button>

          <nav className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = activePath === item.path;
              const href = item.path === "/overview" ? "/clusters" : `/clusters${item.path}`;
              return (
                <Link
                  key={item.path}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active ? "bg-zinc-900 text-zinc-50" : "text-zinc-700 hover:bg-zinc-200"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.title}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 border-t border-zinc-200 pt-4 text-xs text-zinc-500">黑白主题 · new-york-v4 风格</div>
        </aside>

        <main className="p-4 md:p-6">
          <div className="mb-4 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <PanelLeft className="h-4 w-4 text-zinc-500" />
              <span className="font-medium">{currentTitle}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative hidden md:block">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-zinc-500" />
                <Input
                  className="w-64 border-zinc-300 bg-zinc-100 pl-8"
                  placeholder="搜索当前表格..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" className="border-zinc-300 bg-white">
                <Bell className="mr-1 h-4 w-4" /> 消息
              </Button>
            </div>
          </div>

          <section className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {overviewKpis.map((kpi) => (
              <Card key={kpi.label} className="border-zinc-200 bg-zinc-50 shadow-none">
                <CardHeader className="pb-2">
                  <CardDescription className="text-zinc-600">{kpi.label}</CardDescription>
                  <CardTitle className="text-4xl tracking-tight">{kpi.value}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-zinc-500">{kpi.hint}</CardContent>
              </Card>
            ))}
          </section>

          <Card className="mb-4 border-zinc-200 bg-zinc-50 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Cluster Activity</CardTitle>
                <CardDescription>{moduleConfig.subtitle}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="bg-zinc-200 text-zinc-900">Last 3 months</Button>
                <Button variant="ghost" size="sm" className="text-zinc-700">Last 30 days</Button>
                <Button variant="ghost" size="sm" className="text-zinc-700">Last 7 days</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-44 rounded-xl border border-zinc-200 bg-gradient-to-b from-zinc-200 via-zinc-100 to-zinc-50" />
            </CardContent>
          </Card>

          <section className="grid gap-4 xl:grid-cols-[2fr_1fr]">
            <Card className="border-zinc-200 bg-zinc-50 shadow-none">
              <CardHeader>
                <CardTitle>{currentTitle}列表</CardTitle>
                <CardDescription>projects / nodes / pods 已接入真实 API，其他模块保留重构骨架。</CardDescription>
              </CardHeader>
              <CardContent>
                {loading && <div className="py-6 text-sm text-zinc-500">加载中...</div>}
                {error && <div className="mb-3 rounded-md border border-zinc-300 bg-zinc-200 px-3 py-2 text-sm text-zinc-800">{error}</div>}
                {!loading && filteredRows.length === 0 ? (
                  <div className="py-6 text-sm text-zinc-500">暂无数据</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {moduleConfig.columns.map((col) => (
                          <TableHead key={col.key}>{col.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((row, idx) => (
                        <TableRow key={`${row[moduleConfig.columns[0].key] || "row"}-${idx}`}>
                          {moduleConfig.columns.map((col, colIndex) => {
                            const value = row[col.key] ?? "-";
                            const isStatus = col.key === "status";
                            const variant = statusVariantMap[value] || "outline";
                            return (
                              <TableCell key={col.key} className={cn(colIndex === 0 && "font-medium")}>
                                {isStatus ? <Badge variant={variant}>{value}</Badge> : value}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="border-zinc-200 bg-zinc-50 shadow-none">
              <CardHeader>
                <CardTitle>操作面板</CardTitle>
                <CardDescription>模块快捷动作</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {moduleConfig.actions.map((action, idx) => (
                  <Button
                    key={action}
                    className={cn("w-full", idx === 0 && "bg-zinc-900 text-zinc-50 hover:bg-zinc-800")}
                    variant={idx === 0 ? "default" : idx === 1 ? "secondary" : "outline"}
                  >
                    {action}
                  </Button>
                ))}
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </div>
  );
}
