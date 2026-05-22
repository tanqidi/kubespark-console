"use client"

import * as React from "react"
import { useTranslations } from "@/app/lib/i18n"

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
  placeholder,
  emptyText,
  contentContainer,
}: ProjectNamespaceFieldProps) {
  const t = useTranslations()
  const defaultPlaceholder = t("search.namespacePlaceholder")
  const defaultEmptyText = `${t("search.notFound")} ${t("search.namespace")}`
  
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{t("keyValueDialog.namespace")}</FieldLabel>
      <FilterCombobox
        options={options}
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder || defaultPlaceholder}
        emptyText={emptyText || defaultEmptyText}
        className="w-full"
        ariaInvalid={Boolean(error)}
        disabled={disabled}
        contentContainer={contentContainer}
      />
      {error ? <FieldError>{error}</FieldError> : <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

