"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { menuItems, kpiCards, tableData } from "@/components/console/data";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statusVariant: Record<string, "default" | "secondary" | "outline"> = {
  Running: "default",
  Pending: "secondary",
  Failed: "outline"
};

export function ConsoleShell() {
  const pathname = usePathname();
  const activePath = useMemo(() => {
    if (pathname === "/clusters") return "/overview";
    return pathname.replace("/clusters", "") || "/overview";
  }, [pathname]);

  const currentTitle = menuItems.find((x) => x.path === activePath)?.title || "模块";

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
              <p className="text-sm text-muted-foreground">更清爽的 shadcn 风格控制台，保留核心管理信息结构。</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative hidden md:block">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="w-64 pl-8" placeholder="搜索资源..." />
              </div>
              <Button variant="outline" size="sm"><Bell className="mr-1 h-4 w-4" />消息</Button>
            </div>
          </header>

          <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {kpiCards.map((kpi) => (
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
                <CardTitle>近期工作负载</CardTitle>
                <CardDescription>来自原项目主要列表视图（pods/workloads）重构后的展示。</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>命名空间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>运行时长</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableData.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.namespace}</TableCell>
                        <TableCell><Badge variant={statusVariant[row.status]}>{row.status}</Badge></TableCell>
                        <TableCell>{row.age}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>操作面板</CardTitle>
                <CardDescription>常用快捷入口</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full" variant="default">创建工作负载</Button>
                <Button className="w-full" variant="secondary">查看节点健康</Button>
                <Button className="w-full" variant="outline">进入项目配额</Button>
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </div>
  );
}
