import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

type Props = {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function CollaboratorMultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Selecionar colaboradores",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  const toggle = (name: string) => {
    if (selected.includes(name)) onChange(selected.filter((s) => s !== name));
    else onChange([...selected, name]);
  };

  const remove = (name: string) => onChange(selected.filter((s) => s !== name));

  return (
    <div className={cn("space-y-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="h-10 w-full justify-between font-normal"
          >
            <span className="truncate text-left">
              {selected.length === 0
                ? placeholder
                : `${selected.length} selecionado${selected.length > 1 ? "s" : ""}`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar colaborador..." />
            <CommandList>
              <CommandEmpty>Nenhum colaborador cadastrado.</CommandEmpty>
              <CommandGroup>
                {options.map((name) => {
                  const isSel = selected.includes(name);
                  return (
                    <CommandItem key={name} value={name} onSelect={() => toggle(name)}>
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          isSel ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {name}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((name) => (
            <Badge key={name} variant="secondary" className="gap-1 pr-1 text-xs">
              {name}
              <button
                type="button"
                onClick={() => remove(name)}
                className="ml-0.5 rounded p-0.5 hover:bg-muted-foreground/20"
                aria-label={`Remover ${name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}