import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import BuyerShell from "@/components/buyer/BuyerShell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useSaved,
  createFolder,
  renameFolder,
  deleteFolder,
  folderCover,
  ALL_SAVES_ID,
  type Folder,
} from "@/lib/savedStore";
import { FolderPlus, MoreVertical, Pencil, Trash2, Share2, Images, Play } from "lucide-react";
import VideoCloseUpsViewer from "@/components/buyer/VideoCloseUpsViewer";
import { useAuth } from "@/contexts/AuthContext";
import { onThumbError, useSavedVideoCloseUps } from "@/lib/queries/videos";

function FolderCard({ folder }: { folder: Folder }) {
  const navigate = useNavigate();
  const saved = useSaved();
  const cover = folderCover(saved, folder);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(folder.name);

  return (
    <div className="group relative">
      <button onClick={() => navigate(`/saved/${folder.id}`)} className="block w-full text-left">
        <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 border border-gray-200">
          {cover ? (
            <img src={cover} alt={folder.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <Images className="w-8 h-8" />
            </div>
          )}
        </div>
        <p className="mt-2 text-sm font-bold text-gray-900 truncate">{folder.name}</p>
        <p className="text-xs text-gray-500">{folder.productIds.length} items</p>
      </button>

      {/* 3-dot folder options (not shown for the permanent All Saves folder) */}
      {folder.id !== ALL_SAVES_ID && (
        <div className="absolute top-2 right-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-gray-600 shadow-sm focus:outline-none"
              aria-label="Folder options"
            >
              <MoreVertical className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => { setName(folder.name); setRenaming(true); }} className="gap-2 text-sm">
                <Pencil className="w-4 h-4" /> Rename Folder
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => { deleteFolder(folder.id); toast(`Deleted "${folder.name}"`); }}
                className="gap-2 text-sm text-brand-buyer focus:text-brand-buyer"
              >
                <Trash2 className="w-4 h-4" /> Delete Folder
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/saved/${folder.id}`); toast.success("Collection link copied"); }}
                className="gap-2 text-sm"
              >
                <Share2 className="w-4 h-4" /> Share
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Rename dialog */}
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Rename Folder</DialogTitle></DialogHeader>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { renameFolder(folder.id, name); setRenaming(false); } }}
            className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-buyer"
            placeholder="Folder name"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setRenaming(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700">Cancel</button>
            <button onClick={() => { renameFolder(folder.id, name); setRenaming(false); toast.success("Folder renamed"); }} className="px-5 py-2 rounded-xl bg-brand-buyer text-white text-sm font-bold">Save</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * The video close-ups the buyer saved (saved_videos), newest first; tapping one opens the reel on it
 * (2026-10-16: Save in the reel wrote a row no page ever listed). Hidden when there are none.
 */
function SavedVideos() {
  const { user } = useAuth();
  const { data: videos = [] } = useSavedVideoCloseUps(user?.id);
  // The list the reel opened with, frozen while it's open: unsaving inside it refetches this query.
  const [open, setOpen] = useState<{ list: typeof videos; index: number } | null>(null);
  // Kept mounted after closing, shut through isOpen: unmounting it as the way to close never let it drop its
  // history entry, so the next back press did nothing (2026-10-17).
  const [showing, setShowing] = useState(false);
  if (!videos.length && !open) return null;
  return (
    <section className={videos.length ? "mb-6" : undefined} aria-labelledby={videos.length ? "saved-videos-heading" : undefined}>
      {videos.length > 0 && (<>
      <p id="saved-videos-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">
        Saved videos <span className="text-gray-300">· {videos.length}</span>
      </p>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
        {videos.map((v, i) => (
          <button
            key={v.id}
            type="button"
            onClick={() => { setOpen({ list: videos, index: i }); setShowing(true); }}
            aria-label={`Play ${v.brandLine} by ${v.brandName}`}
            data-testid="saved-video"
            className="relative shrink-0 w-28 aspect-[9/16] rounded-2xl overflow-hidden bg-gray-100 text-left"
          >
            <img src={v.thumbnail} alt="" loading="lazy" onError={onThumbError} className="absolute inset-0 w-full h-full object-cover" />
            <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <Play className="absolute top-2 right-2 w-4 h-4 text-white fill-white" />
            <span className="absolute bottom-2 left-2 right-2">
              <span className="block text-[11px] font-semibold text-white truncate">{v.brandLine}</span>
              <span className="block text-[10px] text-white/80 truncate">{v.brandName}</span>
            </span>
          </button>
        ))}
      </div>
      </>)}
      {open && (
        <VideoCloseUpsViewer
          videos={open.list}
          initialIndex={open.index}
          isOpen={showing}
          onClose={() => setShowing(false)}
          // Every video here is saved: shown so from the first frame, not after the reel loads it.
          knownSaved={new Set(open.list.map((v) => v.id))}
        />
      )}
    </section>
  );
}

const SavedCollections = () => {
  const saved = useSaved();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const submitCreate = () => {
    if (!name.trim()) return;
    createFolder(name);
    setName("");
    setCreating(false);
    toast.success("Folder created");
  };

  return (
    <BuyerShell>
      <div className="max-w-2xl mx-auto px-4 pt-3 pb-24">
        <h1 className="text-lg font-bold text-gray-900 mb-3">My Saves</h1>

        <SavedVideos />

        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Your Collections</p>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-buyer hover:bg-brand-buyer/90 px-3.5 py-2 text-xs font-bold text-white transition-colors active:scale-95"
          >
            <FolderPlus className="w-3.5 h-3.5" /> New Folder
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {saved.folders.map((folder) => <FolderCard key={folder.id} folder={folder} />)}
        </div>
      </div>

      {/* Create New Folder */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create New Folder</DialogTitle></DialogHeader>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitCreate(); }}
            placeholder="Folder name"
            className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-buyer"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setCreating(false); setName(""); }} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700">Cancel</button>
            <button onClick={submitCreate} className="px-5 py-2 rounded-xl bg-brand-buyer text-white text-sm font-bold">Create</button>
          </div>
        </DialogContent>
      </Dialog>
    </BuyerShell>
  );
};

export default SavedCollections;
