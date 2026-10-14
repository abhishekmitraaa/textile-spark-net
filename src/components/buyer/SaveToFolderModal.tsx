import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  useSaved,
  closeSaveModal,
  saveToFolders,
  createFolder,
  ALL_SAVES_ID,
  type Folder,
} from "@/lib/savedStore";
import { Folder as FolderIcon, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVisibleViewport } from "@/hooks/useVisibleViewport";

// Global "Save to folder" modal. Opens whenever a product's bookmark is tapped
// (openSaveModal sets the pending product). Lives once, mounted in BuyerShell.
//
// ON A PHONE it is a bottom sheet that rides on top of the keyboard (2026-10-14:
// typing a new folder's name, the name couldn't be seen). The centred dialog sat
// on a page the keyboard covers without resizing, and the name field, below the
// folder list, ended up under the keyboard. Now: "Create new folder" comes first,
// the sheet is pinned to the top of the keyboard and capped at the visible height,
// and the field is 16px so iOS doesn't zoom the page on focus.

const SaveToFolderModal = () => {
  const { pending, folders } = useSaved();
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const isMobile = useIsMobile();
  const viewport = useVisibleViewport();
  const nameRef = useRef<HTMLInputElement | null>(null);

  const open = pending !== null;

  // Reset local UI each time a new product opens the modal.
  useEffect(() => {
    if (open) { setSelected([]); setCreating(false); setNewName(""); }
  }, [open, pending?.id]);

  // Keep the name field in view inside the list while the keyboard opens and the sheet shrinks.
  useEffect(() => {
    if (creating) nameRef.current?.scrollIntoView({ block: "nearest" });
  }, [creating, viewport?.keyboard]);

  const pickable = useMemo<Folder[]>(() => folders, [folders]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const addFolder = () => {
    const name = newName.trim();
    if (!name) return;
    const id = createFolder(name);
    setSelected((s) => [...s, id]);
    setCreating(false);
    setNewName("");
  };

  const handleSave = () => {
    if (!pending) return;
    saveToFolders(pending, selected); // All Saves is always included by the store
    toast.success("Saved to wishlist", {
      description: "You can view saved products in your dashboard.",
      position: "top-center",
      duration: 1500,
    });
  };

  // Phone: pinned to the top of the keyboard (0 when it's down) and no taller than what's visible.
  const sheetStyle = isMobile && viewport
    ? { bottom: viewport.keyboard, maxHeight: Math.max(240, viewport.height - 16) }
    : undefined;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) closeSaveModal(); }}>
      <DialogContent
        data-testid="save-to-folder"
        style={sheetStyle}
        className={cn(
          "flex max-h-[85dvh] max-w-md flex-col gap-0 p-0",
          // A bottom sheet below md; the centred dialog from md up.
          "max-md:top-auto max-md:bottom-0 max-md:translate-y-0 max-md:rounded-t-2xl max-md:border-x-0 max-md:border-b-0",
          "max-md:data-[state=open]:slide-in-from-bottom-full max-md:data-[state=closed]:slide-out-to-bottom-full",
        )}
      >
        {/* Header (DialogContent provides its own close X, top-right) */}
        <div className="shrink-0 px-5 pt-5 pr-10">
          <DialogTitle className="text-base font-bold text-gray-900">Save to folder</DialogTitle>
          <DialogDescription className="text-xs text-gray-500 mt-0.5">
            {pending ? `Choose a folder for "${pending.name}"` : "Choose a folder"}
          </DialogDescription>
        </div>

        {/* Folder list, with "Create new folder" first so its field stays near the top */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-2">
          {creating ? (
            <div className="flex items-center gap-2 rounded-xl border border-brand-buyer/40 px-2 py-2">
              <input
                ref={nameRef}
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addFolder(); }}
                placeholder="Folder name"
                aria-label="New folder name"
                maxLength={60}
                enterKeyHint="done"
                className="flex-1 min-w-0 bg-transparent px-1.5 text-base md:text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
              />
              <button onClick={addFolder} disabled={!newName.trim()} className="px-3 py-1.5 rounded-lg bg-brand-buyer text-white text-xs font-bold disabled:opacity-50">Add</button>
              <button onClick={() => { setCreating(false); setNewName(""); }} className="px-2 py-1.5 rounded-lg text-xs font-semibold text-gray-500">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-3 rounded-xl border border-dashed border-gray-300 px-3.5 py-3 text-left hover:border-brand-buyer/50 transition-colors"
            >
              <Plus className="w-4 h-4 text-brand-buyer" />
              <span className="text-sm font-medium text-brand-buyer">Create new folder</span>
            </button>
          )}

          {pickable.map((folder) => {
            const isAll = folder.id === ALL_SAVES_ID;
            const active = selected.includes(folder.id) || isAll; // All Saves always receives the item
            return (
              <button
                key={folder.id}
                onClick={() => { if (!isAll) toggle(folder.id); }}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                  active ? "border-brand-buyer bg-brand-buyer/5" : "border-gray-200 hover:border-gray-300",
                  isAll && "opacity-90"
                )}
              >
                <FolderIcon className={cn("w-4 h-4 shrink-0", active ? "text-brand-buyer" : "text-gray-400")} />
                <span className="flex-1 text-sm font-medium text-gray-800" data-no-translate={isAll ? undefined : true}>{folder.name}</span>
                {active && <Check className="w-4 h-4 text-brand-buyer" />}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex justify-end gap-2 px-5 py-4 border-t border-gray-100 max-md:pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button onClick={closeSaveModal} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="px-5 py-2 rounded-xl bg-brand-buyer hover:bg-brand-buyer/90 text-white text-sm font-bold transition-colors">
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SaveToFolderModal;
