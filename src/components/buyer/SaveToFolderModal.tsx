import { useEffect, useMemo, useState } from "react";
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

// Global "Save to folder" modal. Opens whenever a product's bookmark is tapped
// (openSaveModal sets the pending product). Lives once, mounted in BuyerShell.

const SaveToFolderModal = () => {
  const { pending, folders } = useSaved();
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const open = pending !== null;

  // Reset local UI each time a new product opens the modal.
  useEffect(() => {
    if (open) { setSelected([]); setCreating(false); setNewName(""); }
  }, [open, pending?.id]);

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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) closeSaveModal(); }}>
      <DialogContent className="max-w-md p-0 gap-0">
        {/* Header (DialogContent provides its own close X, top-right) */}
        <div className="px-5 pt-5 pr-10">
          <DialogTitle className="text-base font-bold text-gray-900">Save to folder</DialogTitle>
          <DialogDescription className="text-xs text-gray-500 mt-0.5">
            {pending ? `Choose a folder for "${pending.name}"` : "Choose a folder"}
          </DialogDescription>
        </div>

        {/* Folder list */}
        <div className="px-5 py-4 space-y-2 max-h-[45vh] overflow-y-auto">
          {pickable.map((folder) => {
            const isAll = folder.id === ALL_SAVES_ID;
            const active = selected.includes(folder.id) || isAll; // All Saves always receives the item
            return (
              <button
                key={folder.id}
                onClick={() => { if (!isAll) toggle(folder.id); }}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                  active ? "border-[#ef4d62] bg-[#ef4d62]/5" : "border-gray-200 hover:border-gray-300",
                  isAll && "opacity-90"
                )}
              >
                <FolderIcon className={cn("w-4 h-4 shrink-0", active ? "text-[#ef4d62]" : "text-gray-400")} />
                <span className="flex-1 text-sm font-medium text-gray-800">{folder.name}</span>
                {active && <Check className="w-4 h-4 text-[#ef4d62]" />}
              </button>
            );
          })}

          {/* Create new folder */}
          {creating ? (
            <div className="flex items-center gap-2 rounded-xl border border-[#ef4d62]/40 px-2 py-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addFolder(); }}
                placeholder="Folder name"
                className="flex-1 min-w-0 bg-transparent px-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
              />
              <button onClick={addFolder} className="px-3 py-1.5 rounded-lg bg-[#ef4d62] text-white text-xs font-bold">Add</button>
              <button onClick={() => { setCreating(false); setNewName(""); }} className="px-2 py-1.5 rounded-lg text-xs font-semibold text-gray-500">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-3 rounded-xl border border-dashed border-gray-300 px-3.5 py-3 text-left hover:border-[#ef4d62]/50 transition-colors"
            >
              <Plus className="w-4 h-4 text-[#ef4d62]" />
              <span className="text-sm font-medium text-[#ef4d62]">Create new folder</span>
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={closeSaveModal} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="px-5 py-2 rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-sm font-bold transition-colors">
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SaveToFolderModal;
