"use client"

import { ChartAreaInteractive } from "@/app/(console)/dashboard/components/chart-area-interactive"
import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import { createColumns } from "@/app/(console)/dashboard/components/table/columns-factory"
import { SectionCards } from "@/app/(console)/dashboard/components/section-cards"
import data from "@/app/(console)/dashboard/data.json"

type Row = (typeof data)[number]

const columns = createColumns<Row>({
  columns: [
    {
      key: "header",
      label: "Header",
      cellClassName: "font-medium",
      enableHiding: false,
    },
    { key: "type", label: "Section Type", render: "badge" },
    { key: "status", label: "Status", render: "status" },
    { key: "target", label: "Target", render: "input", align: "right" },
    { key: "limit", label: "Limit", render: "input", align: "right" },
    { key: "reviewer", label: "Reviewer" },
  ],
})

export default function Page() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <SectionCards />
        <div className="px-4 lg:px-6">
          <ChartAreaInteractive />
        </div>
        <DataTable data={data} columns={columns} />
      </div>
    </div>
  )
}
