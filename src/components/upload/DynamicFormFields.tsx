import { FormField } from "@/data/sellerCategories";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface DynamicFormFieldsProps {
  fields: FormField[];
  values: Record<string, string | string[]>;
  onChange: (fieldId: string, value: string | string[]) => void;
}

export const DynamicFormFields = ({ fields, values, onChange }: DynamicFormFieldsProps) => {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <FieldRenderer
          key={field.id}
          field={field}
          value={values[field.id]}
          onChange={(value) => onChange(field.id, value)}
        />
      ))}
    </div>
  );
};

interface FieldRendererProps {
  field: FormField;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
}

const FieldRenderer = ({ field, value, onChange }: FieldRendererProps) => {
  const containerClass = field.fullWidth ? "sm:col-span-2" : "";

  switch (field.type) {
    case "text":
      return (
        <div className={cn("space-y-2", containerClass)}>
          <Label htmlFor={field.id}>
            {field.label}
            {field.required && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <Input
            id={field.id}
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
          />
        </div>
      );

    case "number":
      return (
        <div className={cn("space-y-2", containerClass)}>
          <Label htmlFor={field.id}>
            {field.label}
            {field.required && <span className="ml-1 text-destructive">*</span>}
            {field.unit && <span className="ml-1 text-muted-foreground">({field.unit})</span>}
          </Label>
          <Input
            id={field.id}
            type="number"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
          />
        </div>
      );

    case "textarea":
      return (
        <div className={cn("space-y-2", containerClass || "sm:col-span-2")}>
          <Label htmlFor={field.id}>
            {field.label}
            {field.required && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <Textarea
            id={field.id}
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="min-h-[100px]"
          />
        </div>
      );

    case "select":
      return (
        <div className={cn("space-y-2", containerClass)}>
          <Label htmlFor={field.id}>
            {field.label}
            {field.required && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <Select value={(value as string) || ""} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case "multiselect": {
      const selectedValues = (value as string[]) || [];
      
      return (
        <div className={cn("space-y-2", containerClass || "sm:col-span-2")}>
          <Label>
            {field.label}
            {field.required && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <div className="flex flex-wrap gap-2">
            {field.options?.map((option) => {
              const isSelected = selectedValues.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      onChange(selectedValues.filter((v) => v !== option));
                    } else {
                      onChange([...selectedValues, option]);
                    }
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                    isSelected
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-accent/50 hover:text-foreground"
                  )}
                >
                  {option}
                  {isSelected && <X className="ml-1 inline h-3 w-3" />}
                </button>
              );
            })}
          </div>
          {/* products.colour is a single value, so only the first pick is
              stored. Warn at the point of truncation rather than letting the
              vendor discover it after publishing. */}
          {field.id === "colors" && selectedValues.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Only the first colour ({selectedValues[0]}) is saved on the listing. Multiple colours
              per product are not supported yet.
            </p>
          )}
        </div>
      );
    }

    case "size-selector": {
      const selectedSizes = (value as string[]) || [];
      
      return (
        <div className={cn("space-y-2", containerClass || "sm:col-span-2")}>
          <Label>
            {field.label}
            {field.required && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <div className="flex flex-wrap gap-2">
            {field.options?.map((size) => {
              const isSelected = selectedSizes.includes(size);
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      onChange(selectedSizes.filter((s) => s !== size));
                    } else {
                      onChange([...selectedSizes, size]);
                    }
                  }}
                  className={cn(
                    "flex h-10 min-w-[40px] items-center justify-center rounded-lg border px-3 text-sm font-medium transition-all",
                    isSelected
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-card text-foreground hover:border-accent/50 hover:bg-accent/5"
                  )}
                >
                  {size}
                  {isSelected && <Check className="ml-1 h-3 w-3" />}
                </button>
              );
            })}
          </div>
          {selectedSizes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Selected: {selectedSizes.join(", ")}
            </p>
          )}
        </div>
      );
    }

    case "checkbox": {
      const checked = value === "true";
      return (
        <div className={cn("flex items-center space-x-2", containerClass)}>
          <Checkbox
            id={field.id}
            checked={checked}
            onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
          />
          <Label htmlFor={field.id} className="text-sm font-normal cursor-pointer">
            {field.label}
            {field.required && <span className="ml-1 text-destructive">*</span>}
          </Label>
        </div>
      );
    }

    case "color-picker": {
      const selectedColors = (value as string[]) || [];
      const colorOptions = field.options || [
        "Black", "White", "Red", "Blue", "Green", "Yellow", "Orange", "Pink", 
        "Purple", "Brown", "Grey", "Navy", "Beige", "Cream", "Maroon", "Teal"
      ];
      
      return (
        <div className={cn("space-y-2", containerClass || "sm:col-span-2")}>
          <Label>
            {field.label}
            {field.required && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <div className="flex flex-wrap gap-2">
            {colorOptions.map((color) => {
              const isSelected = selectedColors.includes(color);
              const colorClass = getColorClass(color);
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      onChange(selectedColors.filter((c) => c !== color));
                    } else {
                      onChange([...selectedColors, color]);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                    isSelected
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-card text-muted-foreground hover:border-accent/50"
                  )}
                >
                  <span 
                    className={cn("h-3 w-3 rounded-full border", colorClass)}
                  />
                  {color}
                  {isSelected && <X className="h-3 w-3" />}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
};

// Helper function to get color classes
const getColorClass = (color: string): string => {
  const colorMap: Record<string, string> = {
    Black: "bg-black",
    White: "bg-white",
    Red: "bg-red-500",
    Blue: "bg-blue-500",
    Green: "bg-green-500",
    Yellow: "bg-yellow-400",
    Orange: "bg-orange-500",
    Pink: "bg-pink-400",
    Purple: "bg-purple-500",
    Brown: "bg-amber-800",
    Grey: "bg-gray-500",
    Navy: "bg-blue-900",
    Beige: "bg-amber-100",
    Cream: "bg-amber-50",
    Maroon: "bg-red-900",
    Teal: "bg-teal-500",
    Tan: "bg-amber-300",
    Cognac: "bg-amber-700",
    Burgundy: "bg-red-800",
    Gold: "bg-yellow-500",
    Silver: "bg-gray-300",
    Tortoise: "bg-amber-600",
    Transparent: "bg-transparent border-dashed",
  };
  return colorMap[color] || "bg-gray-400";
};
