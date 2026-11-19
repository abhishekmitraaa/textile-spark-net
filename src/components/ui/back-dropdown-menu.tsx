import type { ComponentProps } from "react";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { useOverlayState } from "@/hooks/useBackCloses";

/**
 * A dropdown menu that Back closes, instead of leaving the page under it (2026-11-19, review M-29). Same props as
 * DropdownMenu; its open state is its own.
 */
export function BackDropdownMenu(props: Omit<ComponentProps<typeof DropdownMenu>, "open" | "onOpenChange">) {
  const [open, setOpen] = useOverlayState();
  return <DropdownMenu {...props} open={open} onOpenChange={setOpen} />;
}
