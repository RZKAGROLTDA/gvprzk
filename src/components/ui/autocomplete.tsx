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
  searchPlaceholder = "Buscar...",
  emptyMessage = "Nenhuma opção encontrada.",
  className,
  disabled = false,
}) => {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(value || "")
  const [hasFocused, setHasFocused] = React.useState(false)

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
    
    // Abre apenas se já teve foco antes
    if (hasFocused) {
      setOpen(true)
    }
  }

  const handleInputFocus = () => {
    if (!hasFocused) {
      setHasFocused(true)
      // Pequeno delay apenas na primeira vez
      setTimeout(() => {
        if (filteredOptions.length > 0) {
          setOpen(true)
        }
      }, 50)
    } else {
      // Nas próximas vezes, abre imediatamente
      if (filteredOptions.length > 0) {
        setOpen(true)
      }
    }
  }

  const handleSelect = (selectedValue: string) => {
    setInputValue(selectedValue)
    onSelect(selectedValue)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
    }
    if (e.key === 'ArrowDown' && !open && hasFocused) {
      setOpen(true)
    }
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!hasFocused) {
      setHasFocused(true)
    }
    
    setOpen(!open)
  }

  // Fecha o popover quando clica fora
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
  }

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Input
              value={inputValue}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={cn("pr-10", className)}
              disabled={disabled}
            />
            <button
              type="button"
              onClick={handleToggle}
              className="absolute right-3 top-1/2 -translate-y-1/2 shrink-0 opacity-50 hover:opacity-100 transition-opacity"
              tabIndex={-1}
            >
              <ChevronsUpDown className="h-4 w-4" />
            </button>
          </div>
        </PopoverTrigger>
        <PopoverContent 
          className="w-full p-0 z-50 bg-popover border shadow-md" 
          align="start"
          side="bottom"
          sideOffset={2}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Command className="bg-popover">
            <CommandList className="max-h-60 overflow-y-auto">
              <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </CommandEmpty>
              {filteredOptions.length > 0 && (
                <CommandGroup>
                  {filteredOptions.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => handleSelect(option.value)}
                      className="flex items-center justify-between cursor-pointer"
                    >
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
                          "ml-auto h-4 w-4",
                          inputValue === option.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}