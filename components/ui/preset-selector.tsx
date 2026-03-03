"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import type { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/registry/new-york-v4/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/registry/new-york-v4/ui/popover"

export interface PresetOption {
  id: string
  name: string
}

interface PresetSelectorProps
  extends React.ComponentProps<typeof PopoverPrimitive.Root> {
  presets: PresetOption[]
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  groupLabel?: string
  showClear?: boolean
  clearText?: string
  showMoreItem?: boolean
  moreText?: string
  triggerClassName?: string
  popoverClassName?: string
  disabled?: boolean
}

export function PresetSelector({
  presets,
  value,
  onValueChange,
  placeholder = "Load a preset...",
  searchPlaceholder = "Search presets...",
  emptyText = "No presets found.",
  groupLabel = "Examples",
  showClear = false,
  clearText = "Clear",
  showMoreItem = false,
  moreText = "More examples",
  triggerClassName,
  popoverClassName,
  disabled = false,
  ...props
}: PresetSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [selectedPresetId, setSelectedPresetId] = React.useState<string>("")
  const isControlled = typeof value === "string"
  const currentPresetId = isControlled ? value : selectedPresetId
  const selectedPreset = React.useMemo(
    () => presets.find((preset) => preset.id === currentPresetId),
    [currentPresetId, presets]
  )

  const updateValue = React.useCallback(
    (nextValue: string) => {
      if (!isControlled) setSelectedPresetId(nextValue)
      onValueChange?.(nextValue)
      setOpen(false)
    },
    [isControlled, onValueChange]
  )

  return (
    <Popover open={open} onOpenChange={setOpen} {...props}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-label={placeholder}
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "flex-1 justify-between md:max-w-[200px] lg:max-w-[300px]",
            triggerClassName
          )}
        >
          {selectedPreset ? selectedPreset.name : placeholder}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[300px] p-0", popoverClassName)}>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {showClear ? (
              <>
                <CommandGroup>
                  <CommandItem onSelect={() => updateValue("")}>
                    {clearText}
                    <Check className={cn("ml-auto", !currentPresetId ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            ) : null}
            <CommandGroup heading={groupLabel}>
              {presets.map((preset) => (
                <CommandItem
                  key={preset.id}
                  onSelect={() => updateValue(preset.id)}
                >
                  {preset.name}
                  <Check
                    className={cn(
                      "ml-auto",
                      currentPresetId === preset.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
            {showMoreItem ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem>{moreText}</CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
