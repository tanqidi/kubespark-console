"use client"

import { useMemo, useState } from "react"
import { IconSearch } from "@tabler/icons-react"

import { Badge } from "@/registry/new-york-v4/ui/badge"
import { Input } from "@/registry/new-york-v4/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/registry/new-york-v4/ui/table"

type Row = {
  id: number
  header: string
  type: string
  status: string
  target: string
  limit: string
  reviewer: string
}

const statusTone: Record<string, "default" | "outline" | "secondary"> = {
  Done: "default",
  "In Progress": "secondary",
  "Not Started": "outline",
}

export function DataTable({ data }: { data: Row[] }) {
  const [q, setQ] = useState("")

  const rows = useMemo(() => {
    const keyword = q.trim().toLowerCase()
    if (!keyword) return data
    return data.filter((r) =>
      [r.header, r.type, r.status, r.target, r.limit, r.reviewer]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    )
  }, [data, q])

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="relative max-w-sm">
        <IconSearch className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents..." className="pl-8" />
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Header</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Target</TableHead>
              <TableHead className="text-right">Limit</TableHead>
              <TableHead>Reviewer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.header}</TableCell>
                <TableCell>{row.type}</TableCell>
                <TableCell>
                  <Badge variant={statusTone[row.status] || "outline"}>{row.status}</Badge>
                </TableCell>
                <TableCell className="text-right">{row.target}</TableCell>
                <TableCell className="text-right">{row.limit}</TableCell>
                <TableCell>{row.reviewer}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
