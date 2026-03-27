"use client";

import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

import { cn } from "@/lib/utils";

export function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      className={cn("inline-flex items-center gap-2", className)}
      {...props}
    />
  );
}

export function RadioGroupItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        "rounded-full border px-3 py-1 text-[0.65rem] font-semibold transition hover:bg-slate-100 data-[state=checked]:bg-slate-900 data-[state=checked]:text-white",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator />
      {children}
    </RadioGroupPrimitive.Item>
  );
}
