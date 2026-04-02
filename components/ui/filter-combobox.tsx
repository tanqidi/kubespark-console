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
  ariaInvalid?: boolean
  contentContainer?: React.ComponentProps<typeof ComboboxContent>["container"]
}

export function FilterCombobox({
  options,
  value,
  onValueChange,
  placeholder = "Select item",
  emptyText = "No items found.",
  className,
  disabled = false,
  ariaInvalid = false,
  contentContainer,
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
      <ComboboxInput
        placeholder={placeholder}
        className={className}
        aria-invalid={ariaInvalid}
        disabled={disabled}
      />
      <ComboboxContent
        container={contentContainer}
        className="pointer-events-auto duration-0 data-open:animate-none data-closed:animate-none"
      >
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
