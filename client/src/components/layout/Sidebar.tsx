import { FileExplorer } from '../sidebar/FileExplorer';
import { SourceControlPanel } from '../sidebar/SourceControlPanel';
import { OutlinePanel } from '../sidebar/OutlinePanel';
import type { FileNode, SidebarView } from '../../types';

interface SidebarProps {
  activeView: SidebarView;
  width: number;
  workspacePath: string | null;
  activeFilePath: string | null;
  onFileClick: (node: FileNode) => void;
  onDeleteSuccess: (deletedPath: string) => void;
  onRenameSuccess: (oldPath: string, newPath: string) => void;
  localTree?: FileNode | null;
  onDirSummary?: (node: FileNode) => void;
  onFileSummary?: (node: FileNode) => void;
  onAddToContext?: (node: FileNode) => void;
  onNodeSelect?: (node: FileNode) => void;
  /** When set, auto-expands all parent folders to reveal this file path. */
  expandToPath?: string | null;
  /**
   * Monotonically increasing signal used to reload the server-backed file tree.
   * Agent-created files may not be visible through Git yet, so a successful
   * write increments this key and lets FileExplorer fetch the latest tree.
   * FileExplorer preserves the user's expanded folders during that refresh.
   */
  fileTreeRefreshKey?: number;
  /** Markdown content for the outline panel (null = not in outline mode). */
  outlineContent?: string | null;
  /** Called when the user clicks a heading in the outline panel. */
  onOutlineNavigate?: (id: string) => void;
  /** The currently active heading id (for bolding). */
  activeHeadingId?: string | null;
  /** Commit message drafted by the AI — applied to SCM panel on mount. */
  pendingCommitMessage?: string | null;
  /** Called after the pending message has been consumed. */
  onPendingCommitMessageApplied?: () => void;
  /** Called when the user clicks a non-HEAD commit to inspect its diff. */
  onCommitSelect?: (hash: string) => void;
}

export function Sidebar({
  activeView,
  width,
  workspacePath,
  activeFilePath,
  onFileClick,
  onDeleteSuccess,
  onRenameSuccess,
  localTree,
  onDirSummary,
  onFileSummary,
  onAddToContext,
  onNodeSelect,
  expandToPath,
  fileTreeRefreshKey,
  outlineContent,
  onOutlineNavigate,
  activeHeadingId,
  pendingCommitMessage,
  onPendingCommitMessageApplied,
  onCommitSelect,
}: SidebarProps) {
  // Helper to open a file given only its absolute path (from SCM panel)
  const handleOpenByPath = (absPath: string) => {
    const name = absPath.split(/[/\\]/).pop() ?? absPath;
    onFileClick({ name, path: absPath, type: 'file', children: null });
  };

  return (
    <div
      className="panel-card"
      style={{
        width,
        background: 'var(--color-bg-sidebar)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {activeView === 'outline' ? (
        <OutlinePanel
          content={outlineContent ?? null}
          activeHeadingId={activeHeadingId}
          onNavigate={onOutlineNavigate}
        />
      ) : activeView === 'explorer' ? (
        <FileExplorer
          workspacePath={workspacePath}
          activeFilePath={activeFilePath}
          onFileClick={onFileClick}
          onDeleteSuccess={onDeleteSuccess}
          onRenameSuccess={onRenameSuccess}
          localTree={localTree}
          onDirSummary={onDirSummary}
          onFileSummary={onFileSummary}
          onAddToContext={onAddToContext}
          onNodeSelect={onNodeSelect}
          expandToPath={expandToPath}
          // Pass the signal through unchanged; FileExplorer owns the reload behavior.
          refreshKey={fileTreeRefreshKey}
        />
      ) : (
        <SourceControlPanel
          workspacePath={workspacePath}
          onFileOpen={handleOpenByPath}
          pendingCommitMessage={pendingCommitMessage}
          onPendingCommitMessageApplied={onPendingCommitMessageApplied}
          onCommitSelect={onCommitSelect}
        />
      )}
    </div>
  );
}
