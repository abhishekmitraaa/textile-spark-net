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
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useState } from "react";
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
  const [inputValue, setInputValue] = useState("");

  switch (field.type) {
    case "text":
      return (
        <div className="space-y-2">
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
        <div className="space-y-2">
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
        <div className="space-y-2 sm:col-span-2">
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
        <div className="space-y-2">
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

    case "multiselect":
      const selectedValues = (value as string[]) || [];
      
      return (
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={field.id}>
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
          {selectedValues.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedValues.map((val) => (
                <Badge key={val} variant="secondary" className="text-xs">
                  {val}
                </Badge>
              ))}
            </div>
          )}
        </div>
      );

    default:
      return null;
  }
};
