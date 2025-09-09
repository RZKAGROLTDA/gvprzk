import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

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
  emptyMessage = "Nenhuma opção encontrada.",
  className,
  disabled = false,
}) => {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(value || "")

  React.useEffect(() => {
    setInputValue(value || "")
  }, [value])

  const filteredOptions = React.useMemo(() => {
    if (!inputValue.trim()) return options.slice(0, 10)
    
    return options.filter(option =>
      option.label.toLowerCase().includes(inputValue.toLowerCase()) ||
      (option.category && option.category.toLowerCase().includes(inputValue.toLowerCase()))
    )
  }, [options, inputValue])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    onSelect(newValue)
    setOpen(true)
  }

  const handleSelect = (selectedValue: string) => {
    setInputValue(selectedValue)
    onSelect(selectedValue)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Input
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={cn("pr-10", className)}
            disabled={disabled}
          />
          <ChevronsUpDown 
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 opacity-50 pointer-events-none" 
          />
        </div>
      </PopoverTrigger>
      <PopoverContent 
        className="w-full p-0 z-50" 
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <Command>
          <CommandList className="max-h-60">
            <CommandEmpty className="py-6 text-center text-sm">
              {emptyMessage}
            </CommandEmpty>
            {filteredOptions.length > 0 && (
              <CommandGroup>
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => handleSelect(option.value)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex flex-col">
                        <span>{option.label}</span>
                        {option.category && (
                          <span className="text-xs text-muted-foreground capitalize">
                            {option.category}
                          </span>
                        )}
                      </div>
                      <Check
                        className={cn(
                          "ml-2 h-4 w-4",
                          inputValue === option.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}