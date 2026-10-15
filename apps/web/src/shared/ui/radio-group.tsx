// Provides Base UI radio controls for single selections in the platform's shared UI layer.
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { cn } from "./utils";

export function RadioGroup<Value>({ className, ...props }: RadioGroupPrimitive.Props<Value>) {
  return <RadioGroupPrimitive data-slot="radio-group" className={className} {...props} />;
}

export function RadioGroupItem<Value>({ className, ...props }: RadioPrimitive.Root.Props<Value>) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn("border-input text-primary focus-visible:ring-ring/50 flex size-4 shrink-0 items-center justify-center rounded-full border outline-none focus-visible:ring-3 data-disabled:opacity-50", className)}
      {...props}
    >
      <RadioPrimitive.Indicator className="flex items-center justify-center">
        <span className="bg-primary size-2 rounded-full" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  );
}
