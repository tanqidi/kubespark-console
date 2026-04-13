"use client"

import { PipelinesPageClient } from "@/app/(console)/dashboard/components/resource-pages/pipelines/pipelines-page"

type PipelineProjectDetailTemplateProps = {
  name: string
}

export function PipelineProjectDetailTemplate({ name }: PipelineProjectDetailTemplateProps) {
  return <PipelinesPageClient pipelineProjectName={name} />
}
