"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { menuItems, moduleConfigs, overviewKpis } from "@/components/console/data";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statusVariantMap: Record<string, "default" | "secondary" | "outline"> = {
  Running: "default",
  Ready: "default",
  Active: "default",
  Enabled: "default",
  Pending: "secondary",
  Unschedulable: "secondary",
  Terminating: "secondary",
  Draft: "secondary",
  Failed: "outline",
  Succeeded: "outline"
};

export function ConsoleShell() {
  const pathname = usePathname();
  const [search, setSearch] = useState("");

  const activePath = useMemo(() => {
    if (pathname === "/clusters") return "/overview";
    return pathname.replace("/clusters", "") || "/overview";
  }, [pathname]);

  const currentTitle = menuItems.find((x) => x.path === activePath)?.title || "模块";
  const moduleConfig = moduleConfigs[activePath] || moduleConfigs["/overview"];

  const filteredRows = useMemo(() => {
    if (!search.trim()) return moduleConfig.rows;
    const q = search.toLowerCase();
    return moduleConfig.rows.filter((row) => Object.values(row).some((v) => v.toLowerCase().includes(q)));
  }, [moduleConfig.rows, search]);

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <div className="mx-auto grid max-w-[1500px] grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-r bg-background/90 p-5 lg:sticky lg:top-0 lg:h-screen">
          <div className="mb-8">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">KubeSpark</div>
            <div className="text-xl font-semibold">Console Reforged</div>
          </div>
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
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.title}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="p-4 md:p-8">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{currentTitle}</h1>
              <p className="text-sm text-muted-foreground">{moduleConfig.subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative hidden md:block">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="w-64 pl-8" placeholder="搜索当前表格..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Button variant="outline" size="sm">
                <Bell className="mr-1 h-4 w-4" />消息
              </Button>
            </div>
          </header>

          <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {overviewKpis.map((kpi) => (
              <Card key={kpi.label}>
                <CardHeader className="pb-3">
                  <CardDescription>{kpi.label}</CardDescription>
                  <CardTitle className="text-3xl">{kpi.value}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">{kpi.hint}</CardContent>
              </Card>
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-[2fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>{currentTitle}列表</CardTitle>
                <CardDescription>已按模块切换列结构，方便继续接入真实 API 数据。</CardDescription>
              </CardHeader>
              <CardContent>
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
                      <TableRow key={`${row[moduleConfig.columns[0].key]}-${idx}`}>
                        {moduleConfig.columns.map((col, colIndex) => {
                          const value = row[col.key] ?? "-";
                          const isStatus = col.key === "status";
                          const variant = statusVariantMap[value] || "outline";
                          return (
                            <TableCell key={col.key} className={colIndex === 0 ? "font-medium" : ""}>
                              {isStatus ? <Badge variant={variant}>{value}</Badge> : value}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>操作面板</CardTitle>
                <CardDescription>按模块切换常用动作入口</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {moduleConfig.actions.map((action, idx) => (
                  <Button key={action} className="w-full" variant={idx === 0 ? "default" : idx === 1 ? "secondary" : "outline"}>
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
