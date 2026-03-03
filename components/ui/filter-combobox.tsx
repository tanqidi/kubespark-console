"use client"

import * as React from "react"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"

export interface FilterComboboxOption {
  id: string
  name: string
}

interface FilterComboboxProps {
  options: FilterComboboxOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  emptyText?: string
  className?: string
  disabled?: boolean
}

export function FilterCombobox({
  options,
  value,
  onValueChange,
  placeholder = "Select item",
  emptyText = "No items found.",
  className,
  disabled = false,
}: FilterComboboxProps) {
  const selectedOption = React.useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value]
  )

  return (
    <Combobox
      items={options}
      itemToStringLabel={(item) => item.name}
      itemToStringValue={(item) => item.name}
      value={selectedOption}
      onValueChange={(item) => onValueChange(item?.id ?? "")}
      disabled={disabled}
    >
      <ComboboxInput placeholder={placeholder} className={className} disabled={disabled} />
      <ComboboxContent>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item.id} value={item}>
              {item.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
