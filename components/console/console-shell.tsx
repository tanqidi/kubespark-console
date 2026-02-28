"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, Search, PanelLeft, Plus, Folder, Database, FileText, Settings, CircleHelp } from "lucide-react";
import { menuItems, moduleConfigs, overviewKpis, type RowData } from "@/components/console/data";
import { fetchNamespaces } from "@/app/lib/kubespark/projects";
import { fetchNodes } from "@/app/lib/kubespark/nodes";
import { fetchPods } from "@/app/lib/kubespark/pods";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statusVariantMap: Record<string, "default" | "secondary" | "outline"> = {
  Running: "default", running: "default", Ready: "default", ready: "default", Active: "default", Enabled: "default",
  pending: "secondary", Pending: "secondary", Unschedulable: "secondary", unschedulable: "secondary", Terminating: "secondary", Draft: "secondary",
  Failed: "outline", failed: "outline", Succeeded: "outline", succeeded: "outline", offline: "outline", Unknown: "outline"
};

export function ConsoleShell() {
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<RowData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePath = useMemo(() => (pathname === "/clusters" ? "/overview" : pathname.replace("/clusters", "") || "/overview"), [pathname]);
  const currentTitle = menuItems.find((x) => x.path === activePath)?.title || "Dashboard";
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
          setRows(data.map((x) => ({ name: x.name, status: x.status, labels: String(x.labels), annotations: String(x.annotations), age: x.age })));
        } else if (activePath === "/nodes") {
          const data = await fetchNodes();
          if (cancelled) return;
          setRows(data.map((x) => ({ name: x.name, status: x.status, role: x.role, ip: x.ip, cpu: `${x.cpuTotal.toFixed(1)} cores`, memory: `${x.memoryTotal.toFixed(1)} GiB` })));
        } else {
          const data = await fetchPods();
          if (cancelled) return;
          setRows(data.map((x) => ({ name: x.name, namespace: x.namespace, status: x.status, node: x.node, age: x.age })));
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载失败");
          setRows([]);
        }
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
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen w-full lg:grid-cols-[288px_1fr]">
        <aside className="border-r bg-card">
          <div className="flex h-14 items-center px-4 lg:px-6">
            <div className="text-base font-semibold">Acme Inc.</div>
          </div>
          <div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
            <Button className="w-full justify-start"><Plus className="mr-2 h-4 w-4" />Quick Create</Button>

            <div className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const active = activePath === item.path;
                const href = item.path === "/overview" ? "/clusters" : `/clusters${item.path}`;
                return (
                  <Link key={item.path} href={href} className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm", active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
                    <Icon className="h-4 w-4" />{item.title}
                  </Link>
                );
              })}
            </div>

            <Separator />

            <div className="space-y-1">
              <Link href="#" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"><Folder className="h-4 w-4" />Data Library</Link>
              <Link href="#" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"><Database className="h-4 w-4" />Reports</Link>
              <Link href="#" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"><FileText className="h-4 w-4" />Documents</Link>
            </div>

            <div className="mt-auto space-y-1 pt-6">
              <Link href="#" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"><Settings className="h-4 w-4" />Settings</Link>
              <Link href="#" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"><CircleHelp className="h-4 w-4" />Get Help</Link>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="flex h-14 items-center border-b px-4 lg:px-6">
            <PanelLeft className="h-4 w-4 text-muted-foreground" />
            <div className="ml-3 text-base font-medium">{currentTitle}</div>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative hidden md:block">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="h-9 w-64 pl-8" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Button variant="outline" size="sm"><Bell className="mr-1 h-4 w-4" />Alerts</Button>
            </div>
          </header>

          <main className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
              {overviewKpis.map((kpi) => (
                <Card key={kpi.label}>
                  <CardHeader className="pb-3">
                    <CardDescription>{kpi.label}</CardDescription>
                    <CardTitle className="text-3xl tracking-tight">{kpi.value}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs text-muted-foreground">{kpi.hint}</CardContent>
                </Card>
              ))}
            </div>

            <div className="grid flex-1 gap-4 xl:grid-cols-[2fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>{currentTitle}</CardTitle>
                  <CardDescription>{moduleConfig.subtitle}</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading && <div className="py-6 text-sm text-muted-foreground">加载中...</div>}
                  {error && <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
                  {!loading && filteredRows.length === 0 ? (
                    <div className="py-6 text-sm text-muted-foreground">暂无数据</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {moduleConfig.columns.map((col) => <TableHead key={col.key}>{col.label}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRows.map((row, idx) => (
                          <TableRow key={`${row[moduleConfig.columns[0].key] || "row"}-${idx}`}>
                            {moduleConfig.columns.map((col, colIndex) => {
                              const value = row[col.key] ?? "-";
                              const isStatus = col.key === "status";
                              const variant = statusVariantMap[value] || "outline";
                              return <TableCell key={col.key} className={cn(colIndex === 0 && "font-medium")}>{isStatus ? <Badge variant={variant}>{value}</Badge> : value}</TableCell>;
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Actions</CardTitle>
                  <CardDescription>Module shortcuts</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {moduleConfig.actions.map((action, idx) => (
                    <Button key={action} className="w-full justify-start" variant={idx === 0 ? "default" : idx === 1 ? "secondary" : "outline"}>{action}</Button>
                  ))}
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
