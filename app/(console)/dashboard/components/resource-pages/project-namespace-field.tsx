"use client"

import * as React from "react"

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { FilterCombobox, type FilterComboboxOption } from "@/components/ui/filter-combobox"
import { ComboboxContent } from "@/components/ui/combobox"

type ProjectNamespaceFieldProps = {
  id: string
  value: string
  options: FilterComboboxOption[]
  onValueChange: (value: string) => void
  error: string | null
  description: string
  disabled?: boolean
  placeholder?: string
  emptyText?: string
  contentContainer?: React.ComponentProps<typeof ComboboxContent>["container"]
}

export function ProjectNamespaceField({
  id,
  value,
  options,
  onValueChange,
  error,
  description,
  disabled = false,
  placeholder = "请选择项目",
  emptyText = "未找到项目",
  contentContainer,
}: ProjectNamespaceFieldProps) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>项目</FieldLabel>
      <FilterCombobox
        options={options}
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        emptyText={emptyText}
        className="w-full"
        ariaInvalid={Boolean(error)}
        disabled={disabled}
        contentContainer={contentContainer}
      />
      {error ? <FieldError>{error}</FieldError> : <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

