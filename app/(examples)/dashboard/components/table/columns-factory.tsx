"use client"

import * as React from "react"
import { IconCircleCheckFilled, IconDotsVertical, IconGripVertical, IconLoader } from "@tabler/icons-react"
import { useSortable } from "@dnd-kit/sortable"
import { type ColumnDef } from "@tanstack/react-table"
import { z } from "zod"

import { Badge } from "@/registry/new-york-v4/ui/badge"
import { Button } from "@/registry/new-york-v4/ui/button"
import { Checkbox } from "@/registry/new-york-v4/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/registry/new-york-v4/ui/dropdown-menu"
import { Input } from "@/registry/new-york-v4/ui/input"
import { Label } from "@/registry/new-york-v4/ui/label"

const schema = z.object({
  id: z.number(),
  header: z.string(),
  type: z.string(),
  status: z.string(),
  target: z.string(),
  limit: z.string(),
  reviewer: z.string(),
})

type Row = z.infer<typeof schema>

function DragHandle({ id }: { id: number }) {
  const { attributes, listeners } = useSortable({ id })
  return (
    <Button {...attributes} {...listeners} variant="ghost" size="icon" className="text-muted-foreground size-7 hover:bg-transparent">
      <IconGripVertical className="text-muted-foreground size-3" />
      <span className="sr-only">Drag to reorder</span>
    </Button>
  )
}

export function createColumns(labels: {
  header: string
  type: string
  status: string
  target: string
  limit: string
  reviewer: string
}): ColumnDef<Row>[] {
  return [
    {
      id: "drag",
      header: () => null,
      cell: ({ row }) => <DragHandle id={row.original.id} />,
    },
    {
      id: "select",
      header: ({ table }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "header",
      header: labels.header,
      cell: ({ row }) => <span className="font-medium">{row.original.header}</span>,
      enableHiding: false,
    },
    {
      accessorKey: "type",
      header: labels.type,
      cell: ({ row }) => (
        <div className="w-32">
          <Badge variant="outline" className="text-muted-foreground px-1.5">{row.original.type}</Badge>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: labels.status,
      cell: ({ row }) => (
        <Badge variant="outline" className="text-muted-foreground px-1.5">
          {row.original.status === "Done" ? <IconCircleCheckFilled className="fill-green-500 dark:fill-green-400" /> : <IconLoader />}
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "target",
      header: () => <div className="w-full text-right">{labels.target}</div>,
      cell: ({ row }) => (
        <>
          <Label htmlFor={`${row.original.id}-target`} className="sr-only">Target</Label>
          <Input className="h-8 w-28 border-transparent bg-transparent text-right" defaultValue={row.original.target} id={`${row.original.id}-target`} />
        </>
      ),
    },
    {
      accessorKey: "limit",
      header: () => <div className="w-full text-right">{labels.limit}</div>,
      cell: ({ row }) => (
        <>
          <Label htmlFor={`${row.original.id}-limit`} className="sr-only">Limit</Label>
          <Input className="h-8 w-28 border-transparent bg-transparent text-right" defaultValue={row.original.limit} id={`${row.original.id}-limit`} />
        </>
      ),
    },
    {
      accessorKey: "reviewer",
      header: labels.reviewer,
    },
    {
      id: "actions",
      cell: () => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="data-[state=open]:bg-muted text-muted-foreground flex size-8" size="icon">
              <IconDotsVertical />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem>Edit</DropdownMenuItem>
            <DropdownMenuItem>Copy</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]
}
