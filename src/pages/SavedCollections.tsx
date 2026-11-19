import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  useSavedSync,
  retrySaved,
  createFolder,
  renameFolder,
  deleteFolder,
  folderCover,
  ALL_SAVES_ID,
  type Folder,
} from "@/lib/savedStore";
import { BadgeCheck, BookmarkCheck, FolderPlus, MoreVertical, Pencil, Trash2, Share2, Images, Play } from "lucide-react";
import BrandAvatar from "@/components/buyer/BrandAvatar";
import { useSavedVendors, useToggleSavedVendor } from "@/lib/queries/savedVendors";
import VideoCloseUpsViewer from "@/components/buyer/VideoCloseUpsViewer";
import { useAuth } from "@/contexts/AuthContext";
import { onThumbError, useSavedVideoCloseUps } from "@/lib/queries/videos";


/**
 * Signed out, reading, a failed read and the real list are four different screens (2026-11-19, review M-20): a page
 * that was still loading said "This collection no longer exists".
 */
export function SavedSyncGate({ children }: { children: React.ReactNode }) {
  const sync = useSavedSync();
  const { user, loading } = useAuth();
  if (loading || (user && sync === "loading")) {
    return <p className="py-16 text-center text-sm text-gray-400" role="status" aria-busy="true">Loading your saves…</p>;
  }
  if (user && sync === "error") {
    return (
      <div className="py-16 text-center" role="alert">
        <p className="text-sm text-gray-600">Couldn't load your saves.</p>
        <p className="mt-1 text-xs text-gray-400">Nothing was removed. Check your connection and try again.</p>
        <button onClick={retrySaved} className="mt-4 rounded-xl bg-brand-buyer px-5 py-2.5 text-sm font-bold text-white">Retry</button>
      </div>
    );
  }
  return <>{children}</>;
}

function SignedOutNote() {
  const { user, loading } = useAuth();
  if (loading || user) return null;
  return (
    <p className="mb-4 rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-500">
      These saves are kept in this browser only.{" "}
      <Link to="/login" className="font-semibold text-brand-buyer hover:underline">Sign in</Link> to keep them on your account.
    </p>
  );
}

/** Sellers saved from their store page (Mitra, 2026-11-19, review M-16). Hidden when there are none. */
function SavedSellers() {
  const navigate = useNavigate();
  const { vendors, signedIn, isLoading, isError, refetch } = useSavedVendors();
  const toggle = useToggleSavedVendor();
  if (!signedIn) return null;
  if (isLoading) return null;
  if (isError) {
    return (
      <p className="mb-6 text-xs text-gray-500" role="alert">
        Couldn't load your saved sellers.{" "}
        <button onClick={refetch} className="font-semibold text-brand-buyer hover:underline">Retry</button>
      </p>
    );
  }
  if (vendors.length === 0) return null;
  return (
    <section className="mb-6" aria-labelledby="saved-sellers-heading">
      <p id="saved-sellers-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">
        Sellers <span className="text-gray-300">· {vendors.length}</span>
      </p>
      <div className="divide-y divide-gray-100 rounded-2xl border border-gray-100">
        {vendors.map((v) => (
          <div key={v.id} className="flex items-center gap-3 px-3 py-2.5">
            <button onClick={() => navigate(`/vendor/${v.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <BrandAvatar name={v.name} logo={v.logo} className="h-10 w-10 shrink-0 text-xs" />
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-sm font-bold text-gray-900">
                  <span className="truncate" data-no-translate>{v.name}</span>
                  {v.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-brand-buyer" aria-label="TradeSEAL" />}
                </span>
                {v.city && <span className="block truncate text-[11px] text-gray-500">{v.city}</span>}
              </span>
            </button>
            <button
              onClick={() => void toggle(v.id, false, v.name)}
              aria-label={`Remove ${v.name} from My Saves`}
              className="shrink-0 p-1.5 text-brand-buyer"
            >
              <BookmarkCheck className="h-5 w-5 fill-brand-buyer/15" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

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
                onClick={() => deleteFolder(folder.id)}
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
            <button onClick={() => { renameFolder(folder.id, name); setRenaming(false); }} className="px-5 py-2 rounded-xl bg-brand-buyer text-white text-sm font-bold">Save</button>
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
  };

  return (
    <BuyerShell>
      <div className="max-w-2xl mx-auto px-4 pt-3 pb-24">
        <h1 className="text-lg font-bold text-gray-900 mb-3">My Saves</h1>

        <SavedSyncGate>
        <SignedOutNote />

        <SavedSellers />

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
        </SavedSyncGate>
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
