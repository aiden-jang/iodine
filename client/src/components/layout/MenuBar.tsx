import { useCallback, useEffect, useRef, useState } from 'react';
import { browseWorkspaceDirectories, openWorkspace, downloadProjectMetadata, importProjectMetadata, clearProjectMetadata, searchFiles, type DirectoryBrowserResult } from '../../api/files';
import type { Theme } from '../../hooks/useTheme';
import type { UpdateInfo } from '../../hooks/useUpdateCheck';

interface MenuBarProps {
  onOpenProject: (path: string) => void;
  onCloseProject: () => void;
  onCloseAllTabs: () => void;
  onCloseUneditedTabs: () => void;
  onSortTabsByFileStructure: () => void;
  onOpenExternalFile: (absolutePath: string) => void;
  onOpenWorkspaceFile: (absolutePath: string) => void;
  workspacePath: string | null;
  theme: Theme;
  onToggleTheme: () => void;
  openTabsCount: number;
  showSidebar: boolean;
  showRightPanel: boolean;
  showBottomTray: boolean;
  onToggleSidebar: () => void;
  onToggleRightPanel: () => void;
  onToggleBottomTray: () => void;
  updateInfo?: UpdateInfo | null;
  onSnoozeUpdate?: () => void;
  onOpenSettings: () => void;
}

function PaneIcon({ pane }: { pane: 'left' | 'right' | 'bottom' }) {
  if (pane === 'left') return (
    <svg width="15" height="13" viewBox="0 0 15 13" fill="none" style={{ display: 'block' }}>
      <rect x=".5" y=".5" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1"/>
      <line x1="5.5" y1=".5" x2="5.5" y2="12.5" stroke="currentColor" strokeWidth="1"/>
      <rect x="1" y="1" width="4" height="11" fill="currentColor" opacity="0.45"/>
    </svg>
  );
  if (pane === 'right') return (
    <svg width="15" height="13" viewBox="0 0 15 13" fill="none" style={{ display: 'block' }}>
      <rect x=".5" y=".5" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1"/>
      <line x1="9.5" y1=".5" x2="9.5" y2="12.5" stroke="currentColor" strokeWidth="1"/>
      <rect x="10" y="1" width="4" height="11" fill="currentColor" opacity="0.45"/>
    </svg>
  );
  return (
    <svg width="15" height="13" viewBox="0 0 15 13" fill="none" style={{ display: 'block' }}>
      <rect x=".5" y=".5" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1"/>
      <line x1=".5" y1="8.5" x2="14.5" y2="8.5" stroke="currentColor" strokeWidth="1"/>
      <rect x="1" y="9" width="13" height="3" fill="currentColor" opacity="0.45"/>
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ display: 'block' }}>
      <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="7" y1=".5" x2="7" y2="2.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="7" y1="11.8" x2="7" y2="13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1=".5" y1="7" x2="2.2" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="11.8" y1="7" x2="13.5" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="2.4" y1="2.4" x2="3.6" y2="3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="10.4" y1="10.4" x2="11.6" y2="11.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="11.6" y1="2.4" x2="10.4" y2="3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="3.6" y1="10.4" x2="2.4" y2="11.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ display: 'block' }}>
      <path d="M11.5 9.5A6 6 0 0 1 4.5 2.5a5 5 0 1 0 7 7Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function MenuBar({ onOpenProject, onCloseProject, onCloseAllTabs, onCloseUneditedTabs, onSortTabsByFileStructure, onOpenExternalFile, onOpenWorkspaceFile, workspacePath, theme, onToggleTheme, openTabsCount, showSidebar, showRightPanel, showBottomTray, onToggleSidebar, onToggleRightPanel, onToggleBottomTray, updateInfo, onSnoozeUpdate, onOpenSettings }: MenuBarProps) {
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [editorMenuOpen, setEditorMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [showCloseAllDialog, setShowCloseAllDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [opening, setOpening] = useState(false);
  const [folderBrowser, setFolderBrowser] = useState<DirectoryBrowserResult | null>(null);
  const [folderBrowserLoading, setFolderBrowserLoading] = useState(false);
  const [folderBrowserError, setFolderBrowserError] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState<{ type: 'downloading' | 'importing' | 'clearing' | 'success' | 'error'; message: string } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [commandsCopied, setCommandsCopied] = useState(false);
  const [showOpenFileDialog, setShowOpenFileDialog] = useState(false);
  const [openFileMode, setOpenFileMode] = useState<'workspace' | 'external'>('external');
  const [fileQuery, setFileQuery] = useState('');
  const [fileResults, setFileResults] = useState<string[]>([]);
  const [fileResultIndex, setFileResultIndex] = useState(-1);
  const [fileSearching, setFileSearching] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (showOpenFileDialog) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [showOpenFileDialog]);

  // Cmd/Ctrl+P → workspace search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p' && workspacePath) {
        e.preventDefault();
        setOpenFileMode('workspace');
        setShowOpenFileDialog(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [workspacePath]);

  // Search for files as the user types
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const q = fileQuery.trim();
    if (!q) { setFileResults([]); setFileResultIndex(-1); return; }
    setFileSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchFiles(q, openFileMode === 'workspace');
        setFileResults(results);
        setFileResultIndex(-1);
      } catch { setFileResults([]); }
      finally { setFileSearching(false); }
    }, 250);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [fileQuery, openFileMode]);

  // Auto-show update dialog when an update is first detected.
  useEffect(() => {
    if (updateInfo) setShowUpdateDialog(true);
  }, [updateInfo]);

  const openFileResult = useCallback((p: string) => {
    if (openFileMode === 'workspace') onOpenWorkspaceFile(p);
    else onOpenExternalFile(p);
    setShowOpenFileDialog(false);
    setFileQuery('');
    setFileResults([]);
    setFileResultIndex(-1);
  }, [openFileMode, onOpenExternalFile, onOpenWorkspaceFile]);

  const closeOpenFileDialog = useCallback(() => {
    setShowOpenFileDialog(false);
    setFileQuery('');
    setFileResults([]);
    setFileResultIndex(-1);
    setFileSearching(false);
  }, []);

  const loadFolderBrowser = useCallback(async (path?: string) => {
    setFolderBrowserLoading(true);
    setFolderBrowserError(null);
    try {
      setFolderBrowser(await browseWorkspaceDirectories(path));
    } catch (err) {
      setFolderBrowserError(err instanceof Error ? err.message : 'Failed to list folders');
    } finally {
      setFolderBrowserLoading(false);
    }
  }, []);

  const handleOpenProjectClick = () => {
    setProjectMenuOpen(false);
    setShowFolderBrowser(true);
    void loadFolderBrowser();
  };

  const closeFolderBrowser = () => {
    setShowFolderBrowser(false);
    setFolderBrowser(null);
    setFolderBrowserError(null);
  };

  const handleOpenFolder = async () => {
    if (!folderBrowser || opening) return;
    setOpening(true);
    setFolderBrowserError(null);
    try {
      const result = await openWorkspace(folderBrowser.path);
      if (result.path) {
        onOpenProject(result.path);
        closeFolderBrowser();
      }
    } catch (err) {
      setFolderBrowserError(err instanceof Error ? err.message : 'Failed to open folder');
    } finally {
      setOpening(false);
    }
  };

  const handleDownloadMetadata = async () => {
    setEditorMenuOpen(false);
    setProjectStatus({ type: 'downloading', message: 'Downloading…' });
    try {
      await downloadProjectMetadata();
      setProjectStatus({ type: 'success', message: 'Downloaded' });
      setTimeout(() => setProjectStatus(null), 3000);
    } catch (err) {
      setProjectStatus({ type: 'error', message: (err as Error).message });
      setTimeout(() => setProjectStatus(null), 6000);
    }
  };

  const handleImportMetadataClick = () => {
    setEditorMenuOpen(false);
    importInputRef.current?.click();
  };

  const handleClearMetadata = async () => {
    setShowClearConfirm(false);
    setProjectStatus({ type: 'clearing', message: 'Clearing…' });
    try {
      await clearProjectMetadata();
      setProjectStatus({ type: 'success', message: 'Metadata cleared' });
      setTimeout(() => setProjectStatus(null), 3000);
    } catch (err) {
      setProjectStatus({ type: 'error', message: (err as Error).message });
      setTimeout(() => setProjectStatus(null), 6000);
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProjectStatus({ type: 'importing', message: 'Importing…' });
    try {
      await importProjectMetadata(file);
      setProjectStatus({ type: 'success', message: 'Imported successfully' });
      setTimeout(() => setProjectStatus(null), 3000);
    } catch (err) {
      setProjectStatus({ type: 'error', message: (err as Error).message });
      setTimeout(() => setProjectStatus(null), 6000);
    }
  };

  const handleCloseAllTabsClick = () => {
    if (openTabsCount === 0) {
      setFileMenuOpen(false);
      return;
    }
    setShowCloseAllDialog(true);
  };

  const handleConfirmCloseAllTabs = () => {
    setShowCloseAllDialog(false);
    setFileMenuOpen(false);
    onCloseAllTabs();
  };

  const handleCancelCloseAllTabs = () => {
    setShowCloseAllDialog(false);
  };

  const handleCloseUneditedTabsClick = () => {
    setFileMenuOpen(false);
    onCloseUneditedTabs();
  };

  const handleSortTabsClick = () => {
    setFileMenuOpen(false);
    onSortTabsByFileStructure();
  };

  return (
    <>
      {/* Hidden zip import picker */}
      <input
        ref={importInputRef}
        type="file"
        accept=".zip"
        style={{ display: 'none' }}
        onChange={handleImportFileChange}
      />

      <div
        style={{
          height: 30,
          background: 'var(--color-bg-sidebar)',
          borderBottom: '1px solid var(--color-border)',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          padding: '0 4px',
          flexShrink: 0,
          zIndex: 100,
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap:0}}>
          <div style={{ position: 'relative' }}>
          <button
            onClick={() => setProjectMenuOpen(v => !v)}
            onBlur={() => setTimeout(() => setProjectMenuOpen(false), 150)}
            style={{
              padding: '0 10px',
              height: 24,
              borderRadius: 3,
              background: projectMenuOpen ? 'var(--color-bg-hover)' : 'none',
              color: 'var(--color-text-primary)',
              fontSize: 13,
            }}
            onMouseEnter={e => { if (!projectMenuOpen) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
            onMouseLeave={e => { if (!projectMenuOpen) e.currentTarget.style.background = 'none'; }}
          >
            Project
          </button>

          {projectMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 2,
                background: 'var(--color-bg-sidebar)',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                padding: '4px 0',
                minWidth: 200,
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                zIndex: 200,
              }}
            >
              <button
                onMouseDown={handleOpenProjectClick}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '5px 16px',
                  textAlign: 'left',
                  color: 'var(--color-text-primary)',
                  fontSize: 13,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-selected)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                Open Project…
              </button>

              {workspacePath && (
                <button
                  onMouseDown={() => { setProjectMenuOpen(false); onCloseProject(); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '5px 16px',
                    textAlign: 'left',
                    color: 'var(--color-text-primary)',
                    fontSize: 13,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-selected)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  Close Project
                </button>
              )}
            </div>
          )}
        </div>

        {/* File menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setFileMenuOpen(v => !v)}
            onBlur={() => setTimeout(() => setFileMenuOpen(false), 150)}
            style={{
              padding: '0 10px',
              height: 24,
              borderRadius: 3,
              background: fileMenuOpen ? 'var(--color-bg-hover)' : 'none',
              color: 'var(--color-text-primary)',
              fontSize: 13,
            }}
            onMouseEnter={e => { if (!fileMenuOpen) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
            onMouseLeave={e => { if (!fileMenuOpen) e.currentTarget.style.background = 'none'; }}
          >
            File
          </button>

          {fileMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 2,
                background: 'var(--color-bg-sidebar)',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                padding: '4px 0',
                minWidth: 180,
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                zIndex: 200,
              }}
            >
              <button
                onMouseDown={() => { setFileMenuOpen(false); setOpenFileMode('external'); setShowOpenFileDialog(true); }}
                style={{
                  display: 'block', width: '100%', padding: '5px 16px',
                  textAlign: 'left', color: 'var(--color-text-primary)', fontSize: 13, cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-selected)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                Open File…
              </button>

              <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 0' }} />

              <button
                onMouseDown={handleCloseAllTabsClick}
                disabled={openTabsCount === 0}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '5px 16px',
                  textAlign: 'left',
                  color: openTabsCount === 0 ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                  fontSize: 13,
                  cursor: openTabsCount === 0 ? 'default' : 'pointer',
                }}
                onMouseEnter={e => { if (openTabsCount > 0) e.currentTarget.style.background = 'var(--color-bg-selected)'; }}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                Close All Tabs
              </button>

              <button
                onMouseDown={handleCloseUneditedTabsClick}
                disabled={openTabsCount === 0}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '5px 16px',
                  textAlign: 'left',
                  color: openTabsCount === 0 ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                  fontSize: 13,
                  cursor: openTabsCount === 0 ? 'default' : 'pointer',
                }}
                onMouseEnter={e => { if (openTabsCount > 0) e.currentTarget.style.background = 'var(--color-bg-selected)'; }}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                Close Unedited Files
              </button>

              <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 0' }} />

              <button
                onMouseDown={handleSortTabsClick}
                disabled={openTabsCount === 0}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '5px 16px',
                  textAlign: 'left',
                  color: openTabsCount === 0 ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                  fontSize: 13,
                  cursor: openTabsCount === 0 ? 'default' : 'pointer',
                }}
                onMouseEnter={e => { if (openTabsCount > 0) e.currentTarget.style.background = 'var(--color-bg-selected)'; }}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                Sort Tabs by File Structure
              </button>
            </div>
          )}
        </div>

        {/* Editor menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setEditorMenuOpen(v => !v)}
            onBlur={() => setTimeout(() => setEditorMenuOpen(false), 150)}
            style={{
              padding: '0 10px',
              height: 24,
              borderRadius: 3,
              background: editorMenuOpen ? 'var(--color-bg-hover)' : 'none',
              color: 'var(--color-text-primary)',
              fontSize: 13,
            }}
            onMouseEnter={e => { if (!editorMenuOpen) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
            onMouseLeave={e => { if (!editorMenuOpen) e.currentTarget.style.background = 'none'; }}
          >
            Editor
          </button>

          {editorMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 2,
                background: 'var(--color-bg-sidebar)',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                padding: '4px 0',
                minWidth: 220,
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                zIndex: 200,
              }}
            >
              {([
                { label: 'Download Metadata', action: handleDownloadMetadata },
                { label: 'Import Metadata…',  action: handleImportMetadataClick },
                { label: 'Clear Metadata',    action: () => { setEditorMenuOpen(false); setShowClearConfirm(true); } },
              ]).map(item => (
                <button
                  key={item.label}
                  onMouseDown={item.action}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '5px 16px',
                    textAlign: 'left',
                    color: 'var(--color-text-primary)',
                    fontSize: 13,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-selected)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {item.label}
                </button>
              ))}

              <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 0' }} />

              <button
                onMouseDown={() => { setEditorMenuOpen(false); onOpenSettings(); }}
                style={{
                  display: 'block', width: '100%', padding: '5px 16px',
                  textAlign: 'left', color: 'var(--color-text-primary)', fontSize: 13,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-selected)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                Settings…
              </button>
            </div>
          )}
        </div>

        {/* Help menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setHelpMenuOpen(v => !v)}
            onBlur={() => setTimeout(() => setHelpMenuOpen(false), 150)}
            style={{
              padding: '0 10px',
              height: 24,
              borderRadius: 3,
              background: helpMenuOpen ? 'var(--color-bg-hover)' : 'none',
              color: 'var(--color-text-primary)',
              fontSize: 13,
            }}
            onMouseEnter={e => { if (!helpMenuOpen) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
            onMouseLeave={e => { if (!helpMenuOpen) e.currentTarget.style.background = 'none'; }}
          >
            Help
          {updateInfo && (
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: '#e6b800', marginLeft: 4, verticalAlign: 'middle',
              flexShrink: 0,
            }} />
          )}
          </button>

          {helpMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 2,
                background: 'var(--color-bg-sidebar)',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                padding: '4px 0',
                minWidth: 160,
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                zIndex: 200,
              }}
            >
              <button
                onMouseDown={() => { setHelpMenuOpen(false); window.open('https://github.com/hyunwookshin/iodine', '_blank'); }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '5px 16px',
                  textAlign: 'left',
                  color: 'var(--color-text-primary)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-selected)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                Contribute
              </button>
              <button
                onMouseDown={() => { setHelpMenuOpen(false); window.open('https://github.com/hyunwookshin/iodine/issues/new', '_blank'); }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '5px 16px',
                  textAlign: 'left',
                  color: 'var(--color-text-primary)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-selected)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                File a Bug
              </button>
              {updateInfo && (
                <button
                  onMouseDown={() => { setHelpMenuOpen(false); setShowUpdateDialog(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    width: '100%', padding: '5px 16px', textAlign: 'left',
                    color: '#e6b800', fontSize: 13, cursor: 'pointer',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-selected)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e6b800', flexShrink: 0 }} />
                  Update available…
                </button>
              )}
              <button
                onMouseDown={() => { setHelpMenuOpen(false); setShowAboutDialog(true); }}
                style={{
                  display: 'block', width: '100%', padding: '5px 16px', textAlign: 'left',
                  color: 'var(--color-text-primary)', fontSize: 13, cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-selected)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                About Iodine
              </button>
            </div>
          )}
        </div>

        {opening && (
          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            Opening…
          </span>
        )}

        {projectStatus && (
          <span style={{
            marginLeft: 8,
            fontSize: 12,
            color: projectStatus.type === 'error' ? '#f48771'
                 : projectStatus.type === 'success' ? '#89d185'
                 : 'var(--color-text-secondary)',
          }}>
            {projectStatus.message}
          </span>
        )}
        </div>
        
        {/* Centered workspace search — only shown when a project is open */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {workspacePath && (
            <button
              onClick={() => { setOpenFileMode('workspace'); setShowOpenFileDialog(true); }}
              title="Search files in workspace (⌘P)"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 12px', height: 22, width: '40vw', borderRadius: 4,
                background: 'var(--color-bg-editor)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
                fontSize: 12, cursor: 'pointer', minWidth: 180,
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
            >
              <span style={{ fontSize: 13 }}>⌕</span>
              <span style={{ flex: 1 }}>Search workspace…</span>
              <span style={{ fontSize: 11, opacity: 0.6 }}>⌘P</span>
            </button>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
          {(
            [
              { pane: 'left'   as const, shown: showSidebar,    onToggle: onToggleSidebar,    title: 'Toggle sidebar' },
              { pane: 'right'  as const, shown: showRightPanel, onToggle: onToggleRightPanel, title: 'Toggle right panel' },
              { pane: 'bottom' as const, shown: showBottomTray, onToggle: onToggleBottomTray, title: 'Toggle bottom panel' },
            ] as const
          ).map(({ pane, shown, onToggle, title }) => (
            <button
              key={pane}
              type="button"
              onClick={onToggle}
              title={title}
              style={{
                width: 28, height: 24, borderRadius: 3,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: shown ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                background: shown ? 'var(--color-bg-hover)' : 'none',
                opacity: shown ? 1 : 0.55,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={e => { e.currentTarget.style.background = shown ? 'var(--color-bg-hover)' : 'none'; e.currentTarget.style.opacity = shown ? '1' : '0.55'; }}
            >
              <PaneIcon pane={pane} />
            </button>
          ))}
          <div style={{ width: 1, height: 16, background: 'var(--color-border)', margin: '0 4px' }} />
          <button
            onClick={onToggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            style={{
              width: 28, height: 24, borderRadius: 3,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-text-primary)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>

      {showFolderBrowser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
          }}
          onClick={e => { if (e.target === e.currentTarget) closeFolderBrowser(); }}
        >
          <div
            style={{
              background: 'var(--color-bg-sidebar)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              padding: '20px 24px',
              width: 460,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              Open Project
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
              Choose a folder to open.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, marginBottom: 8 }}>
              <button onClick={() => folderBrowser?.parentPath && void loadFolderBrowser(folderBrowser.parentPath)} disabled={!folderBrowser?.parentPath || folderBrowserLoading} style={{ border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)', padding: '4px 8px', cursor: folderBrowser?.parentPath && !folderBrowserLoading ? 'pointer' : 'default', opacity: folderBrowser?.parentPath && !folderBrowserLoading ? 1 : .45 }}>↑</button>
              <div title={folderBrowser?.path} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)', fontSize: 12 }}>{folderBrowser?.path ?? 'Loading folders…'}</div>
            </div>
            <div style={{ height: 260, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg-input)' }}>
              {folderBrowserLoading && <div style={{ padding: '12px', color: 'var(--color-text-secondary)', fontSize: 12 }}>Loading folders…</div>}
              {!folderBrowserLoading && folderBrowser?.directories.length === 0 && <div style={{ padding: '12px', color: 'var(--color-text-secondary)', fontSize: 12 }}>No subfolders</div>}
              {!folderBrowserLoading && folderBrowser?.directories.map(directory => <button key={directory.path} onClick={() => void loadFolderBrowser(directory.path)} style={{ display: 'block', width: '100%', border: 'none', background: 'none', color: 'var(--color-text-primary)', textAlign: 'left', padding: '7px 10px', cursor: 'pointer', fontSize: 12 }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>📁 {directory.name}</button>)}
            </div>
            {folderBrowserError && <div style={{ marginTop: 6, color: '#f48771', fontSize: 12 }}>{folderBrowserError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button
                onClick={closeFolderBrowser}
                style={{
                  padding: '5px 14px',
                  borderRadius: 3,
                  color: 'var(--color-text-secondary)',
                  background: 'var(--color-bg-hover)',
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => void handleOpenFolder()}
                disabled={!folderBrowser || opening || folderBrowserLoading}
                style={{
                  padding: '5px 14px',
                  borderRadius: 3,
                  background: !folderBrowser || opening || folderBrowserLoading ? '#ffffff18' : 'var(--color-accent)',
                  color: !folderBrowser || opening || folderBrowserLoading ? 'var(--color-text-secondary)' : '#fff',
                  cursor: !folderBrowser || opening || folderBrowserLoading ? 'default' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {opening ? 'Opening…' : 'Open this folder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close All Tabs confirmation dialog */}
      {showCloseAllDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
          }}
          onClick={e => { if (e.target === e.currentTarget) handleCancelCloseAllTabs(); }}
        >
          <div
            style={{
              background: 'var(--color-bg-sidebar)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              padding: '20px 24px',
              width: 420,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              Close All Tabs
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
              Are you sure you want to close all {openTabsCount} tab{openTabsCount !== 1 ? 's' : ''}?
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={handleCancelCloseAllTabs}
                style={{
                  padding: '6px 16px',
                  borderRadius: 3,
                  color: 'var(--color-text-secondary)',
                  background: 'var(--color-bg-hover)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-selected)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCloseAllTabs}
                style={{
                  padding: '6px 16px',
                  borderRadius: 3,
                  background: 'var(--color-accent)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                Close All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About dialog */}
      {showAboutDialog && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAboutDialog(false); }}
        >
          <div style={{ background: 'var(--color-bg-sidebar)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '20px 24px', width: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>Iodine</div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>Version {__APP_VERSION__}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowAboutDialog(false)} style={{ padding: '6px 16px', borderRadius: 3, background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)', fontSize: 13, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Update available dialog */}
      {showUpdateDialog && updateInfo && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowUpdateDialog(false); }}
        >
          <div style={{ background: 'var(--color-bg-sidebar)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '20px 24px', width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>Update available</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              A new version of Iodine is available.
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
              Current: <span style={{ fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{__APP_VERSION__}</span>
              {'  →  '}
              Latest: <span style={{ fontFamily: 'monospace', color: '#89d185' }}>{updateInfo.latestTag}</span>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                {import.meta.env.PROD ? 'To update, run:' : 'To update, run these commands from the Iodine directory:'}
              </div>
              {(() => {
                const cmd = import.meta.env.PROD
                  ? 'npm install -g iodine-ide@latest'
                  : 'git pull origin main\ngit fetch --tags\nnpm install\nnpm run dev';
                const note = import.meta.env.PROD
                  ? 'Then restart the app.'
                  : 'Stop the current server first, then restart it with npm run dev.';
                return (
                  <>
                    <div style={{ position: 'relative' }}>
                      <pre style={{
                        margin: 0, padding: '9px 76px 9px 10px', overflowX: 'auto',
                        background: 'var(--color-bg-editor)', border: '1px solid var(--color-border)',
                        borderRadius: 4, color: 'var(--color-text-primary)', fontSize: 11,
                        lineHeight: 1.6, fontFamily: "'Cascadia Code','Fira Code',Menlo,monospace",
                      }}>{cmd}</pre>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(cmd);
                          setCommandsCopied(true);
                          setTimeout(() => setCommandsCopied(false), 2000);
                        }}
                        style={{
                          position: 'absolute', top: 6, right: 6, padding: '4px 8px',
                          borderRadius: 3, background: 'var(--color-bg-hover)',
                          color: 'var(--color-text-primary)', fontSize: 11, cursor: 'pointer',
                        }}
                      >
                        {commandsCopied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 6 }}>
                      {note}
                    </div>
                  </>
                );
              })()}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => {
                  setShowUpdateDialog(false);
                  onSnoozeUpdate?.();
                }}
                style={{ padding: '6px 14px', borderRadius: 3, background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 13, cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-selected)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              >
                Remind me in 30 days
              </button>
              <button
                onClick={() => { window.open(updateInfo.url, '_blank'); setShowUpdateDialog(false); }}
                style={{ padding: '6px 14px', borderRadius: 3, background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                View release
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Metadata confirmation dialog */}
      {showClearConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowClearConfirm(false); }}
        >
          <div
            style={{
              background: 'var(--color-bg-sidebar)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              padding: '20px 24px',
              width: 380,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              Clear Metadata
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              This will delete all cached AI summaries and build config for this workspace. This cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setShowClearConfirm(false)}
                style={{
                  padding: '6px 16px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
                  color: 'var(--color-text-secondary)', background: 'var(--color-bg-hover)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-selected)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              >
                Cancel
              </button>
              <button
                onClick={handleClearMetadata}
                style={{
                  padding: '6px 16px', borderRadius: 3, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', background: '#c53030', border: '1px solid #c53030', color: '#fff',
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open File… dialog — Quick Open style search */}
      {showOpenFileDialog && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 500,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            paddingTop: '34px',
            background: 'rgba(0,0,0,0.2)',
          }}
          onClick={e => { if (e.target === e.currentTarget) closeOpenFileDialog(); }}
        >
          <div
            style={{
              background: 'var(--color-bg-sidebar)',
              border: '1px solid var(--color-border)',
              borderRadius: 6, width: '40vw',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              overflow: 'hidden',
            }}
          >
            {/* Search input */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginRight: 8, flexShrink: 0 }}>
                {fileSearching ? '⟳' : '⌕'}
              </span>
              <input
                ref={searchInputRef}
                value={fileQuery}
                onChange={e => setFileQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setFileResultIndex(i => Math.min(i + 1, fileResults.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setFileResultIndex(i => Math.max(i - 1, -1));
                  } else if (e.key === 'Enter') {
                    const idx = fileResultIndex >= 0 ? fileResultIndex : 0;
                    if (fileResults[idx]) openFileResult(fileResults[idx]);
                  } else if (e.key === 'Escape') {
                    closeOpenFileDialog();
                  }
                }}
                placeholder={openFileMode === 'workspace' ? 'Search workspace files…' : 'Search all files…'}
                style={{
                  flex: 1, padding: '12px 0', fontSize: 14,
                  background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>

            {/* Results list */}
            {fileResults.length > 0 && (
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {fileResults.map((p, idx) => {
                  // Split into dir + filename for better readability
                  const lastSep = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
                  const dir = lastSep >= 0 ? p.slice(0, lastSep + 1) : '';
                  const name = lastSep >= 0 ? p.slice(lastSep + 1) : p;
                  return (
                    <div
                      key={p}
                      onMouseDown={e => { e.preventDefault(); openFileResult(p); }}
                      onMouseEnter={() => setFileResultIndex(idx)}
                      style={{
                        padding: '7px 14px',
                        cursor: 'pointer',
                        background: idx === fileResultIndex ? 'var(--color-bg-selected)' : 'transparent',
                        borderLeft: idx === fileResultIndex ? '2px solid var(--color-accent)' : '2px solid transparent',
                        display: 'flex', flexDirection: 'column', gap: 1,
                      }}
                    >
                      <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>{name}</span>
                      <span style={{
                        fontSize: 11, color: 'var(--color-text-secondary)',
                        fontFamily: "'Cascadia Code','Fira Code',Menlo,monospace",
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{dir}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {!fileSearching && fileQuery.trim() && fileResults.length === 0 && (
              <div style={{ padding: '20px 14px', fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                No files found matching <strong style={{ color: 'var(--color-text-primary)' }}>{fileQuery}</strong>
              </div>
            )}

            {!fileQuery.trim() && (
              <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {openFileMode === 'workspace' ? 'Searches within the open workspace' : 'Searches workspace and common directories'}
              </div>
            )}
          </div>
        </div>
      )}

    </>
  );
}
