import * as React from "react"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface AutocompleteOption {
  value: string
  label: string
  category?: string
}

interface AutocompleteProps {
  options: AutocompleteOption[]
  value?: string
  onSelect: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
  disabled?: boolean
}

export const Autocomplete: React.FC<AutocompleteProps> = ({
  options,
  value,
  onSelect,
  placeholder = "Selecione uma opção...",
  className,
  disabled = false,
}) => {
  return (
    <Select value={value || ""} onValueChange={onSelect} disabled={disabled}>
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <div className="flex flex-col">
              <span>{option.label}</span>
              {option.category && (
                <span className="text-xs text-muted-foreground capitalize">
                  {option.category}
                </span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}