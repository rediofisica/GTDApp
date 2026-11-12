import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './lib/supabase';
import VoiceCommandFAB from './components/VoiceCommandFAB';
import MarkdownRenderer from './components/MarkdownRenderer';
import {
  Inbox, Kanban, CheckCircle2, Plus, Search,
  Moon, Sun, LogOut, Key, FolderPlus, Calendar, Trash2, Edit3, Check, X, SlidersHorizontal,
  Maximize2, Minimize2, Bookmark, BookmarkCheck, ExternalLink, Copy, RotateCcw,
  FolderArchive, Link2, EyeOff, Archive, CheckCheck, Folder
} from 'lucide-react';

const ALL_STATUSES = [
  'Inbox', 'Next Action', 'Action', 'In Progress', 'Someday', 'Waiting', 'Completado'
];

const KANBAN_COLUMNS = [
  { id: 'Next Action', label: 'Next Action', color: 'border-amber-500', dot: 'bg-amber-500' },
  { id: 'Action', label: 'Action', color: 'border-blue-500', dot: 'bg-blue-500' },
  { id: 'In Progress', label: 'In Progress', color: 'border-purple-500', dot: 'bg-purple-500' },
  { id: 'Waiting', label: 'Waiting', color: 'border-orange-500', dot: 'bg-orange-500' },
  { id: 'Someday', label: 'Someday', color: 'border-slate-400', dot: 'bg-slate-400' }
];

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(() =>
    localStorage.getItem('theme') ? localStorage.getItem('theme') === 'dark' : true
  );

  const [tasks, setTasks] = useState([]);
  const [contexts, setContexts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [links, setLinks] = useState([]);
  const [linksTableMissing, setLinksTableMissing] = useState(false);
  const [apiKey, setApiKey] = useState('');

  // activeView can be: 'inbox' | 'kanban' | 'completed' | 'archived_projects' | 'links'
  const [activeView, setActiveView] = useState('kanban');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterContext, setFilterContext] = useState('ALL');
  const [filterProject, setFilterProject] = useState('ALL');
  const [sortBy, setSortBy] = useState('created_at_desc');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const carouselRef = useRef(null);
  const [activeCarouselCol, setActiveCarouselCol] = useState(0);
  const [expandedTaskId, setExpandedTaskId] = useState(null);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isMetaModalOpen, setIsMetaModalOpen] = useState(false);
  const [showApiModal, setShowApiModal] = useState(false);

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    status: 'Inbox',
    context_id: '',
    project_id: ''
  });

  const [newContextName, setNewContextName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');

  // Links state
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [linkFilter, setLinkFilter] = useState('pending'); // 'all' | 'pending' | 'read'
  const [linkSearch, setLinkSearch] = useState('');
  const [copiedLinkId, setCopiedLinkId] = useState(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      fetchAllData();
    }
  }, [session]);

  const fetchAllData = async () => {
    setLoading(true);
    const userId = session.user.id;

    let [ctxRes, prjRes, tskRes, keyRes, linksRes] = await Promise.all([
      supabase.from('contexts').select('*').order('name'),
      supabase.from('projects').select('*').order('name'),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('user_api_keys').select('api_key').eq('user_id', userId).single(),
      supabase.from('saved_links').select('*').order('created_at', { ascending: false })
    ]);

    // Handle contexts with active fallback from localStorage
    const archivedContextIds = JSON.parse(localStorage.getItem('archived_context_ids') || '[]');
    const processedContexts = (ctxRes.data || []).map(c => ({
      ...c,
      active: c.active !== undefined ? c.active : !archivedContextIds.includes(c.id)
    }));

    if (processedContexts.length === 0) {
      const { data: insertedCtx } = await supabase
        .from('contexts')
        .insert([
          { user_id: userId, name: 'Trabajo' },
          { user_id: userId, name: 'Casa' }
        ])
        .select();
      setContexts((insertedCtx || []).map(c => ({ ...c, active: true })));
    } else {
      setContexts(processedContexts);
    }

    setProjects(prjRes.data || []);
    setTasks(tskRes.data || []);
    if (keyRes.data) setApiKey(keyRes.data.api_key);

    // Handle saved_links (table or localStorage fallback)
    if (linksRes.error) {
      setLinksTableMissing(true);
      const localLinks = JSON.parse(localStorage.getItem('saved_links') || '[]');
      setLinks(localLinks);
    } else {
      setLinksTableMissing(false);
      setLinks(linksRes.data || []);
    }

    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Active / Archived subsets
  const activeContexts = useMemo(() => contexts.filter(c => c.active !== false), [contexts]);
  const archivedContexts = useMemo(() => contexts.filter(c => c.active === false), [contexts]);

  const activeProjects = useMemo(() => projects.filter(p => p.active !== false), [projects]);
  const archivedProjects = useMemo(() => projects.filter(p => p.active === false), [projects]);

  const openTaskModal = (task = null, defaultStatus = null) => {
    const defaultCtx = activeContexts.find(c => c.name.toLowerCase() === 'trabajo') || activeContexts[0] || contexts[0];
    if (task) {
      setEditingTask(task);
      setTaskForm({
        title: task.title,
        description: task.description,
        status: task.status,
        context_id: task.context_id,
        project_id: task.project_id || ''
      });
    } else {
      setEditingTask(null);
      setTaskForm({
        title: '',
        description: '',
        status: defaultStatus || (activeView === 'inbox' ? 'Inbox' : 'Next Action'),
        context_id: defaultCtx?.id || '',
        project_id: ''
      });
    }
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!taskForm.title.trim() || !taskForm.context_id) return;

    const payload = {
      user_id: session.user.id,
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      status: taskForm.status,
      context_id: taskForm.context_id,
      project_id: taskForm.project_id || null
    };

    if (editingTask) {
      const { data, error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', editingTask.id)
        .select()
        .single();
      if (!error && data) {
        setTasks(prev => prev.map(t => (t.id === data.id ? data : t)));
      }
    } else {
      const { data, error } = await supabase
        .from('tasks')
        .insert(payload)
        .select()
        .single();
      if (!error && data) {
        setTasks(prev => [data, ...prev]);
      }
    }
    setIsTaskModalOpen(false);
  };

  const handleStatusChange = async (taskId, newStatus) => {
    const previousTasks = [...tasks];
    setTasks(prev =>
      prev.map(t =>
        t.id === taskId
          ? {
              ...t,
              status: newStatus,
              completed_at: newStatus === 'Completado' ? new Date().toISOString() : null
            }
          : t
      )
    );

    const { data, error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', taskId)
      .select()
      .single();

    if (error) {
      setTasks(previousTasks);
    } else {
      setTasks(prev => prev.map(t => (t.id === data.id ? data : t)));
    }
  };

  const handleDeleteTask = async (taskId) => {
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (!error) {
      setTasks(prev => prev.filter(t => t.id !== taskId));
    }
  };

  // Context Management
  const handleAddContext = async (e) => {
    e.preventDefault();
    if (!newContextName.trim()) return;
    const { data, error } = await supabase
      .from('contexts')
      .insert({ user_id: session.user.id, name: newContextName.trim() })
      .select()
      .single();
    if (!error && data) {
      setContexts(prev => [...prev, { ...data, active: true }]);
      setNewContextName('');
    }
  };

  const handleToggleContextActive = async (contextId, newActive) => {
    setContexts(prev => prev.map(c => c.id === contextId ? { ...c, active: newActive } : c));

    // Try Supabase update
    await supabase.from('contexts').update({ active: newActive }).eq('id', contextId);

    // Also persist in localStorage for resilience
    const savedArchived = JSON.parse(localStorage.getItem('archived_context_ids') || '[]');
    let updated;
    if (!newActive) {
      updated = [...new Set([...savedArchived, contextId])];
    } else {
      updated = savedArchived.filter(id => id !== contextId);
    }
    localStorage.setItem('archived_context_ids', JSON.stringify(updated));
  };

  // Project Management
  const handleAddProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    const { data, error } = await supabase
      .from('projects')
      .insert({ user_id: session.user.id, name: newProjectName.trim(), active: true })
      .select()
      .single();
    if (!error && data) {
      setProjects(prev => [...prev, data]);
      setNewProjectName('');
    }
  };

  const handleToggleProjectActive = async (projectId, newActive) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, active: newActive } : p));
    await supabase
      .from('projects')
      .update({ active: newActive })
      .eq('id', projectId);
  };

  const handleDeleteProject = async (projectId) => {
    if (!window.confirm('¿Seguro que deseas eliminar este proyecto? Las tareas asociadas mantendrán su estado pero quedarán sin proyecto.')) {
      return;
    }
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (!error) {
      setProjects(prev => prev.filter(p => p.id !== projectId));
      setTasks(prev => prev.map(t => t.project_id === projectId ? { ...t, project_id: null } : t));
    }
  };

  // Saved Links Management
  const handleAddLink = async (e) => {
    e.preventDefault();
    let url = newLinkUrl.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    let fallbackTitle = url;
    try {
      fallbackTitle = new URL(url).hostname.replace('www.', '');
    } catch {}

    const title = newLinkTitle.trim() || fallbackTitle;

    const newLinkItem = {
      id: crypto.randomUUID(),
      user_id: session?.user?.id,
      url,
      title,
      read: false,
      created_at: new Date().toISOString()
    };

    if (!linksTableMissing) {
      const { data, error } = await supabase
        .from('saved_links')
        .insert({
          user_id: session.user.id,
          url,
          title,
          read: false
        })
        .select()
        .single();

      if (!error && data) {
        setLinks(prev => [data, ...prev]);
      } else {
        setLinks(prev => [newLinkItem, ...prev]);
        localStorage.setItem('saved_links', JSON.stringify([newLinkItem, ...links]));
      }
    } else {
      setLinks(prev => [newLinkItem, ...prev]);
      localStorage.setItem('saved_links', JSON.stringify([newLinkItem, ...links]));
    }

    setNewLinkUrl('');
    setNewLinkTitle('');
  };

  const handleToggleLinkRead = async (linkId, currentRead) => {
    const updatedRead = !currentRead;
    setLinks(prev => prev.map(l => l.id === linkId ? { ...l, read: updatedRead } : l));
    if (!linksTableMissing) {
      await supabase.from('saved_links').update({ read: updatedRead }).eq('id', linkId);
    } else {
      const updated = links.map(l => l.id === linkId ? { ...l, read: updatedRead } : l);
      localStorage.setItem('saved_links', JSON.stringify(updated));
    }
  };

  const handleDeleteLink = async (linkId) => {
    setLinks(prev => prev.filter(l => l.id !== linkId));
    if (!linksTableMissing) {
      await supabase.from('saved_links').delete().eq('id', linkId);
    } else {
      const updated = links.filter(l => l.id !== linkId);
      localStorage.setItem('saved_links', JSON.stringify(updated));
    }
  };

  const handleCopyLink = (url, id) => {
    navigator.clipboard.writeText(url);
    setCopiedLinkId(id);
    setTimeout(() => setCopiedLinkId(null), 2000);
  };

  const contextMap = useMemo(() => Object.fromEntries(contexts.map(c => [c.id, c.name])), [contexts]);
  const projectMap = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p.name])), [projects]);

  const filteredAndSortedTasks = useMemo(() => {
    return tasks
      .filter(task => {
        const matchesSearch =
          task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          task.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = filterStatus === 'ALL' || task.status === filterStatus;
        const matchesContext = filterContext === 'ALL' || task.context_id === filterContext;
        const matchesProject =
          filterProject === 'ALL'
            ? true
            : filterProject === 'NONE'
            ? !task.project_id
            : task.project_id === filterProject;

        return matchesSearch && matchesStatus && matchesContext && matchesProject;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'created_at_desc':
            return new Date(b.created_at) - new Date(a.created_at);
          case 'created_at_asc':
            return new Date(a.created_at) - new Date(b.created_at);
          case 'name_asc':
            return a.title.localeCompare(b.title);
          case 'name_desc':
            return b.title.localeCompare(a.title);
          case 'status':
            return a.status.localeCompare(b.status);
          case 'context':
            return (contextMap[a.context_id] || '').localeCompare(contextMap[b.context_id] || '');
          case 'project':
            return (projectMap[a.project_id] || 'zzz').localeCompare(projectMap[b.project_id] || 'zzz');
          default:
            return 0;
        }
      });
  }, [tasks, searchQuery, filterStatus, filterContext, filterProject, sortBy, contextMap, projectMap]);

  const filteredLinks = useMemo(() => {
    return links
      .filter(link => {
        if (linkFilter === 'pending') return !link.read;
        if (linkFilter === 'read') return link.read;
        return true;
      })
      .filter(link => {
        if (!linkSearch.trim()) return true;
        const q = linkSearch.toLowerCase();
        return (
          (link.title && link.title.toLowerCase().includes(q)) ||
          (link.url && link.url.toLowerCase().includes(q))
        );
      });
  }, [links, linkFilter, linkSearch]);

  const handleDragStart = (e, taskId) => {
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDrop = (e, targetStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      handleStatusChange(taskId, targetStatus);
    }
  };

  const handleCarouselScroll = () => {
    if (!carouselRef.current) return;
    const scrollLeft = carouselRef.current.scrollLeft;
    const colWidth = carouselRef.current.clientWidth * 0.85;
    const index = Math.round(scrollLeft / colWidth);
    setActiveCarouselCol(index);
  };

  const scrollToColumn = (index) => {
    if (!carouselRef.current) return;
    const colElement = carouselRef.current.children[index];
    if (colElement) {
      colElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      setActiveCarouselCol(index);
    }
  };

  const inboxCount = tasks.filter(t => t.status === 'Inbox').length;
  const completedCount = tasks.filter(t => t.status === 'Completado').length;
  const archivedProjectsCount = archivedProjects.length;
  const pendingLinksCount = links.filter(l => !l.read).length;

  const activeFiltersCount =
    (filterContext !== 'ALL' ? 1 : 0) +
    (filterProject !== 'ALL' ? 1 : 0) +
    (filterStatus !== 'ALL' ? 1 : 0);

  if (!session && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl text-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center mx-auto mb-4 text-white font-bold text-xl">
            GTD
          </div>
          <h1 className="text-2xl font-bold mb-2">Flujo GTD & Kanban</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Organiza tus tareas por contextos y proyectos con integración directa para Gemini AI.
          </p>
          <button
            onClick={handleGoogleLogin}
            className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
          >
            Iniciar sesión con Google
          </button>
        </div>
      </div>
    );
  }

  const visibleColumns = KANBAN_COLUMNS.filter(col => filterStatus === 'ALL' || col.id === filterStatus);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 sticky top-0 z-30">
        <div className="flex items-center gap-3 xl:gap-4 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 font-bold text-base sm:text-lg tracking-tight shrink-0">
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs sm:text-sm">
              GTD
            </span>
            <span className="truncate hidden sm:inline">Workspace</span>
          </div>

          <nav className="hidden lg:flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveView('inbox')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeView === 'inbox'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Inbox className="w-4 h-4"/>
              <span>Inbox</span>
              <span className="px-1.5 py-0.2 text-[11px] rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300">
                {inboxCount}
              </span>
            </button>

            <button
              onClick={() => setActiveView('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeView === 'kanban'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-4 h-4"/>
              <span>Tablero Activo</span>
            </button>

            <button
              onClick={() => setActiveView('completed')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeView === 'completed'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-4 h-4"/>
              <span>Completado</span>
              <span className="px-1.5 py-0.2 text-[11px] rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-300">
                {completedCount}
              </span>
            </button>

            <button
              onClick={() => setActiveView('archived_projects')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeView === 'archived_projects'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <FolderArchive className="w-4 h-4"/>
              <span>Proyectos finalizados</span>
              {archivedProjectsCount > 0 && (
                <span className="px-1.5 py-0.2 text-[11px] rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                  {archivedProjectsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveView('links')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeView === 'links'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Bookmark className="w-4 h-4"/>
              <span>Ver más tarde</span>
              {pendingLinksCount > 0 && (
                <span className="px-1.5 py-0.2 text-[11px] rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-semibold">
                  {pendingLinksCount}
                </span>
              )}
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={() => openTaskModal()}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition shadow-sm"
          >
            <Plus className="w-4 h-4"/>
            <span>Nueva</span>
          </button>

          <button
            onClick={() => setIsMetaModalOpen(true)}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            title="Gestionar Proyectos y Contextos"
          >
            <FolderPlus className="w-4 h-4"/>
          </button>

          <button
            onClick={() => setShowApiModal(true)}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            title="API Key para Gemini"
          >
            <Key className="w-4 h-4 text-amber-500"/>
          </button>

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            title="Cambiar tema"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400"/> : <Moon className="w-4 h-4"/>}
          </button>

          <button
            onClick={handleLogout}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-950/50 text-slate-600 dark:text-slate-400 hover:text-rose-600 transition"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4"/>
          </button>
        </div>
      </header>

      {/* Filter bar only for task views */}
      {['inbox', 'kanban', 'completed'].includes(activeView) && (
        <section className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input
                type="text"
                placeholder="Buscar tarea..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 rounded-xl outline-none focus:ring-2 ring-indigo-500/50"
              />
            </div>

            <button
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className={`md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                activeFiltersCount > 0 || showMobileFilters
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500/40 text-indigo-600 dark:text-indigo-300'
                  : 'bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-300'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5"/>
              <span>Filtros</span>
              {activeFiltersCount > 0 && (
                <span className="px-1.5 py-0.2 bg-indigo-600 text-white rounded-full text-[10px]">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            <div className="hidden md:flex items-center gap-2.5">
              <select
                value={filterContext}
                onChange={e => setFilterContext(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg text-xs outline-none"
              >
                <option value="ALL">Todos los contextos</option>
                {activeContexts.map(c => (
                  <option key={c.id} value={c.id}>@{c.name}</option>
                ))}
              </select>

              <select
                value={filterProject}
                onChange={e => setFilterProject(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg text-xs outline-none"
              >
                <option value="ALL">Todos los proyectos</option>
                <option value="NONE">Sin proyecto</option>
                {activeProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              {activeView === 'kanban' && (
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg text-xs outline-none"
                >
                  <option value="ALL">Todos los estados</option>
                  {KANBAN_COLUMNS.map(col => (
                    <option key={col.id} value={col.id}>{col.label}</option>
                  ))}
                </select>
              )}

              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg text-xs outline-none"
              >
                <option value="created_at_desc">Más recientes</option>
                <option value="created_at_asc">Más antiguas</option>
                <option value="name_asc">Nombre (A-Z)</option>
                <option value="name_desc">Nombre (Z-A)</option>
                <option value="context">Contexto</option>
                <option value="project">Proyecto</option>
              </select>
            </div>
          </div>

          {showMobileFilters && (
            <div className="md:hidden grid grid-cols-2 gap-2 pt-2.5 mt-2 border-t border-slate-200 dark:border-slate-800">
              <select
                value={filterContext}
                onChange={e => setFilterContext(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 px-2.5 py-2 rounded-lg text-xs outline-none"
              >
                <option value="ALL">Contexto: Activos</option>
                {activeContexts.map(c => (
                  <option key={c.id} value={c.id}>@{c.name}</option>
                ))}
              </select>

              <select
                value={filterProject}
                onChange={e => setFilterProject(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 px-2.5 py-2 rounded-lg text-xs outline-none"
              >
                <option value="ALL">Proyecto: Activos</option>
                <option value="NONE">Sin proyecto</option>
                {activeProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 px-2.5 py-2 rounded-lg text-xs outline-none"
              >
                <option value="ALL">Estado: Todos</option>
                {KANBAN_COLUMNS.map(col => (
                  <option key={col.id} value={col.id}>{col.label}</option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 px-2.5 py-2 rounded-lg text-xs outline-none"
              >
                <option value="created_at_desc">Orden: Recientes</option>
                <option value="created_at_asc">Orden: Antiguas</option>
                <option value="name_asc">Orden: A - Z</option>
                <option value="context">Orden: Contexto</option>
                <option value="project">Orden: Proyecto</option>
              </select>
            </div>
          )}
        </section>
      )}

      <main className="flex-1 p-3 sm:p-6 pb-28 md:pb-24 overflow-x-hidden">
        {activeView === 'inbox' && (
          <div className="max-w-4xl mx-auto space-y-2.5">
            <div className="flex items-center justify-between mb-3 px-1">
              <div>
                <h2 className="text-base sm:text-lg font-semibold">Bandeja de Entrada (Inbox)</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Procesa tus capturas y asígnales su estado correspondiente.
                </p>
              </div>
              <button
                onClick={() => openTaskModal(null, 'Inbox')}
                className="text-xs bg-indigo-600 text-white px-3 py-2 rounded-xl hover:bg-indigo-500 shrink-0 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Capturar</span>
              </button>
            </div>

            {filteredAndSortedTasks.filter(t => t.status === 'Inbox').length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-10 text-center text-sm text-slate-400">
                Inbox Zero. No tienes tareas pendientes de procesar.
              </div>
            ) : (
              filteredAndSortedTasks
                .filter(t => t.status === 'Inbox')
                .map(task => (
                  <TaskRowCard
                    key={task.id}
                    task={task}
                    contextName={contextMap[task.context_id]}
                    projectName={projectMap[task.project_id]}
                    onStatusChange={handleStatusChange}
                    onEdit={() => openTaskModal(task)}
                    onDelete={() => handleDeleteTask(task.id)}
                  />
                ))
            )}
          </div>
        )}

        {activeView === 'kanban' && (
          <div>
            <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto no-scrollbar pb-2.5 px-1">
              {visibleColumns.map((col, idx) => {
                const count = filteredAndSortedTasks.filter(t => t.status === col.id).length;
                const isCurrent = activeCarouselCol === idx;
                return (
                  <button
                    key={col.id}
                    onClick={() => scrollToColumn(idx)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition ${
                      isCurrent
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <span>{col.label}</span>
                    <span className="opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>

            <div
              ref={carouselRef}
              onScroll={handleCarouselScroll}
              className="flex lg:grid lg:grid-cols-5 gap-3.5 overflow-x-auto lg:overflow-visible snap-x snap-mandatory no-scrollbar pb-4"
            >
              {visibleColumns.map((col, colIndex) => {
                const colTasks = filteredAndSortedTasks.filter(t => t.status === col.id);
                const isRightCol = colIndex >= 3;

                return (
                  <div
                    key={col.id}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleDrop(e, col.id)}
                    className="w-[86vw] sm:w-[340px] lg:w-auto shrink-0 snap-center bg-slate-200/70 dark:bg-slate-900/70 rounded-2xl p-3 flex flex-col min-h-[65vh] border border-slate-200/80 dark:border-slate-800/80"
                  >
                    <div className={`flex items-center justify-between pb-2.5 mb-3 border-b-2 ${col.color}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{col.label}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 font-medium">
                          {colTasks.length}
                        </span>
                      </div>
                      <button
                        onClick={() => openTaskModal(null, col.id)}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-indigo-600 dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-200 hover:text-white dark:hover:text-white border border-slate-300 dark:border-slate-700 font-medium transition shadow-xs active:scale-95"
                        title={`Añadir tarea a ${col.label}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-semibold">Añadir</span>
                      </button>
                    </div>

                    <div className="space-y-2.5 flex-1 relative">
                      {colTasks.length === 0 ? (
                        <div
                          onClick={() => openTaskModal(null, col.id)}
                          className="h-32 flex flex-col items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 border border-dashed border-slate-300 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500/50 rounded-xl cursor-pointer transition p-4 text-center group"
                        >
                          <span>Sin tareas en {col.label}</span>
                          <span className="text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1 group-hover:underline">
                            <Plus className="w-3.5 h-3.5" /> Añadir tarea aquí
                          </span>
                        </div>
                      ) : (
                        colTasks.map(task => {
                          const isExpanded = expandedTaskId === task.id;

                          return (
                            <div
                              key={task.id}
                              draggable
                              onDragStart={e => handleDragStart(e, task.id)}
                              onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                              className={`bg-white dark:bg-slate-900 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3 ${
                                isExpanded
                                  ? `p-4 shadow-2xl ring-2 ring-indigo-500/70 border-indigo-500 relative z-30 ${
                                      isRightCol
                                        ? 'lg:w-[145%] lg:min-w-[320px] lg:max-w-md lg:-translate-x-[31%]'
                                        : 'lg:w-[145%] lg:min-w-[320px] lg:max-w-md'
                                    }`
                                  : 'p-3.5 shadow-sm border-slate-200/80 dark:border-slate-800 hover:border-indigo-500/60 relative'
                              }`}
                            >
                              <div>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-1.5 flex-1">
                                    <h3 className="font-semibold text-sm leading-snug text-slate-900 dark:text-slate-100">
                                      {task.title}
                                    </h3>
                                  </div>
                                  <div
                                    className="flex items-center gap-1 shrink-0"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <button
                                      onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                                      className={`p-1.5 rounded-lg transition ${
                                        isExpanded
                                          ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/70'
                                          : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                      }`}
                                      title={isExpanded ? 'Contraer vista' : 'Ampliar tarjeta'}
                                    >
                                      {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                                    </button>
                                    <button
                                      onClick={() => openTaskModal(task)}
                                      className="p-1.5 text-slate-400 hover:text-indigo-500 rounded-lg active:bg-slate-100 dark:active:bg-slate-800"
                                      title="Editar tarea"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleStatusChange(task.id, 'Completado')}
                                      className="p-1.5 text-slate-400 hover:text-emerald-500 rounded-lg active:bg-slate-100 dark:active:bg-slate-800"
                                      title="Marcar como Completado"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {task.description && (
                                  <div className="mt-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                                    <MarkdownRenderer
                                      content={task.description}
                                      className={isExpanded ? '' : 'line-clamp-3'}
                                    />
                                    {!isExpanded && task.description.length > 80 && (
                                      <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-medium inline-flex items-center gap-0.5 mt-1">
                                        <Maximize2 className="w-2.5 h-2.5" /> Clic para ampliar
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div
                                className="space-y-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80"
                                onClick={e => e.stopPropagation()}
                              >
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                  <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 font-medium">
                                    @{contextMap[task.context_id] || 'General'}
                                  </span>
                                  {task.project_id && (
                                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 font-medium truncate max-w-[160px]">
                                      📁 {projectMap[task.project_id]}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center justify-between text-xs text-slate-400">
                                  <span className="text-[11px]">{new Date(task.created_at).toLocaleDateString()}</span>
                                  <select
                                    value={task.status}
                                    onChange={e => handleStatusChange(task.id, e.target.value)}
                                    className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg px-2 py-1 text-xs font-medium outline-none"
                                  >
                                    {ALL_STATUSES.map(st => (
                                      <option key={st} value={st}>{st}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeView === 'completed' && (
          <div className="max-w-4xl mx-auto space-y-2.5">
            <div className="mb-3 px-1">
              <h2 className="text-base sm:text-lg font-semibold">Tareas Completadas</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Registro histórico con fechas de creación y finalización.
              </p>
            </div>

            {filteredAndSortedTasks.filter(t => t.status === 'Completado').length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-10 text-center text-sm text-slate-400">
                No hay tareas completadas que coincidan con los filtros.
              </div>
            ) : (
              filteredAndSortedTasks
                .filter(t => t.status === 'Completado')
                .map(task => (
                  <TaskRowCard
                    key={task.id}
                    task={task}
                    contextName={contextMap[task.context_id]}
                    projectName={projectMap[task.project_id]}
                    onStatusChange={handleStatusChange}
                    onEdit={() => openTaskModal(task)}
                    onDelete={() => handleDeleteTask(task.id)}
                  />
                ))
            )}
          </div>
        )}

        {/* View: Proyectos Finalizados / Archivados */}
        {activeView === 'archived_projects' && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between mb-3 px-1">
              <div>
                <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                  <FolderArchive className="w-5 h-5 text-indigo-500"/>
                  Proyectos Finalizados
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Proyectos archivados que ya no se muestran en los selectores de notas. Puedes reactivarlos en cualquier momento.
                </p>
              </div>
              <button
                onClick={() => setIsMetaModalOpen(true)}
                className="text-xs bg-indigo-600 text-white px-3 py-2 rounded-xl hover:bg-indigo-500 shrink-0 flex items-center gap-1.5"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Gestionar Proyectos</span>
              </button>
            </div>

            {archivedProjects.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-12 text-center text-sm text-slate-400 space-y-2">
                <FolderArchive className="w-8 h-8 mx-auto text-slate-400 opacity-60"/>
                <p className="font-medium text-slate-500 dark:text-slate-300">No hay proyectos finalizados</p>
                <p className="text-xs text-slate-400">
                  Cuando finalices o archives un proyecto desde el gestor de proyectos, se guardará aquí.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {archivedProjects.map(project => {
                  const projectTasks = tasks.filter(t => t.project_id === project.id);
                  const completedProjTasks = projectTasks.filter(t => t.status === 'Completado');

                  return (
                    <div
                      key={project.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs hover:border-indigo-500/40 transition flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            <Folder className="w-4 h-4 text-slate-400"/>
                            {project.name}
                          </h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500">
                            Archivado
                          </span>
                        </div>
                        {project.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {project.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-slate-400 pt-1">
                          <span>
                            Tareas: <strong>{completedProjTasks.length}</strong> / {projectTasks.length} completadas
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 gap-2">
                        <span className="text-[11px] text-slate-400">
                          {new Date(project.created_at).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleToggleProjectActive(project.id, true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 dark:hover:text-white text-xs font-medium transition"
                            title="Reactivar proyecto"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reactivar</span>
                          </button>
                          <button
                            onClick={() => handleDeleteProject(project.id)}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                            title="Eliminar proyecto definitivamente"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* View: Ver Más Tarde (Enlaces) */}
        {activeView === 'links' && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 px-1">
              <div>
                <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                  <Bookmark className="w-5 h-5 text-indigo-500"/>
                  Ver Más Tarde (Enlaces)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Guarda enlaces, artículos, vídeos o recursos web para revisarlos con calma.
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 font-medium self-start sm:self-auto">
                {pendingLinksCount} pendientes
              </span>
            </div>

            {/* Quick add link form */}
            <form
              onSubmit={handleAddLink}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-sm flex flex-col sm:flex-row items-center gap-2.5"
            >
              <div className="relative flex-1 w-full">
                <Link2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input
                  type="text"
                  required
                  placeholder="Pegar URL (ej. https://articulo.com)..."
                  value={newLinkUrl}
                  onChange={e => setNewLinkUrl(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 rounded-xl outline-none focus:ring-2 ring-indigo-500"
                />
              </div>
              <input
                type="text"
                placeholder="Título o nota (opcional)..."
                value={newLinkTitle}
                onChange={e => setNewLinkTitle(e.target.value)}
                className="w-full sm:w-64 px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 rounded-xl outline-none focus:ring-2 ring-indigo-500"
              />
              <button
                type="submit"
                className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-sm transition shrink-0 flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4"/>
                <span>Guardar enlace</span>
              </button>
            </form>

            {/* Controls: Search & Tabs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input
                  type="text"
                  placeholder="Buscar entre enlaces guardados..."
                  value={linkSearch}
                  onChange={e => setLinkSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-900 p-1 rounded-xl self-start sm:self-auto">
                <button
                  onClick={() => setLinkFilter('pending')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                    linkFilter === 'pending'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Pendientes ({links.filter(l => !l.read).length})
                </button>
                <button
                  onClick={() => setLinkFilter('read')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                    linkFilter === 'read'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Vistos ({links.filter(l => l.read).length})
                </button>
                <button
                  onClick={() => setLinkFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                    linkFilter === 'all'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Todos ({links.length})
                </button>
              </div>
            </div>

            {/* Links list */}
            {filteredLinks.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-12 text-center text-sm text-slate-400 space-y-2">
                <Bookmark className="w-8 h-8 mx-auto text-slate-400 opacity-60"/>
                <p className="font-medium text-slate-500 dark:text-slate-300">
                  {linkFilter === 'read' ? 'No hay enlaces vistos' : 'No hay enlaces pendientes'}
                </p>
                <p className="text-xs text-slate-400">
                  Pega una URL arriba para guardarla y revisarla más tarde.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredLinks.map(link => (
                  <div
                    key={link.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-indigo-500/40 transition shadow-xs"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`font-semibold text-sm hover:underline flex items-center gap-1.5 truncate ${
                            link.read
                              ? 'line-through text-slate-400'
                              : 'text-slate-900 dark:text-slate-100 text-indigo-600 dark:text-indigo-400'
                          }`}
                        >
                          <span className="truncate">{link.title || link.url}</span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-70" />
                        </a>
                      </div>
                      <p className="text-xs text-slate-400 font-mono truncate max-w-xl">
                        {link.url}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-0.5">
                        <span>Guardado: {new Date(link.created_at).toLocaleDateString()}</span>
                        {link.read && (
                          <span className="text-emerald-500 font-medium">Revisado</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1.5 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800">
                      <button
                        onClick={() => handleCopyLink(link.url, link.id)}
                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Copiar enlace"
                      >
                        {copiedLinkId === link.id ? (
                          <Check className="w-4 h-4 text-emerald-500"/>
                        ) : (
                          <Copy className="w-4 h-4"/>
                        )}
                      </button>

                      <button
                        onClick={() => handleToggleLinkRead(link.id, link.read)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                          link.read
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white'
                        }`}
                        title={link.read ? 'Marcar como no leído' : 'Marcar como leído'}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{link.read ? 'Visto' : 'Marcar visto'}</span>
                      </button>

                      <button
                        onClick={() => handleDeleteLink(link.id)}
                        className="p-2 text-slate-400 hover:text-rose-500 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                        title="Eliminar enlace"
                      >
                        <Trash2 className="w-4 h-4"/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (5 tabs) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 z-30 grid grid-cols-5 py-1 pb-safe">
        <button
          onClick={() => setActiveView('inbox')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-1 transition ${
            activeView === 'inbox'
              ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <div className="relative">
            <Inbox className="w-5 h-5"/>
            {inboxCount > 0 && (
              <span className="absolute -top-1 -right-2 px-1 text-[9px] rounded-full bg-indigo-600 text-white font-bold leading-tight">
                {inboxCount}
              </span>
            )}
          </div>
          <span className="text-[10px] truncate max-w-[60px]">Inbox</span>
        </button>

        <button
          onClick={() => setActiveView('kanban')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-1 transition ${
            activeView === 'kanban'
              ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Kanban className="w-5 h-5"/>
          <span className="text-[10px] truncate max-w-[60px]">Tablero</span>
        </button>

        <button
          onClick={() => setActiveView('completed')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-1 transition ${
            activeView === 'completed'
              ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <div className="relative">
            <CheckCircle2 className="w-5 h-5"/>
            {completedCount > 0 && (
              <span className="absolute -top-1 -right-2 px-1 text-[9px] rounded-full bg-emerald-600 text-white font-bold leading-tight">
                {completedCount}
              </span>
            )}
          </div>
          <span className="text-[10px] truncate max-w-[60px]">Hechas</span>
        </button>

        <button
          onClick={() => setActiveView('archived_projects')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-1 transition ${
            activeView === 'archived_projects'
              ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <div className="relative">
            <FolderArchive className="w-5 h-5"/>
            {archivedProjectsCount > 0 && (
              <span className="absolute -top-1 -right-2 px-1 text-[9px] rounded-full bg-slate-500 text-white font-bold leading-tight">
                {archivedProjectsCount}
              </span>
            )}
          </div>
          <span className="text-[10px] truncate max-w-[60px]">Proyectos</span>
        </button>

        <button
          onClick={() => setActiveView('links')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-1 transition ${
            activeView === 'links'
              ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <div className="relative">
            <Bookmark className="w-5 h-5"/>
            {pendingLinksCount > 0 && (
              <span className="absolute -top-1 -right-2 px-1 text-[9px] rounded-full bg-amber-500 text-white font-bold leading-tight">
                {pendingLinksCount}
              </span>
            )}
          </div>
          <span className="text-[10px] truncate max-w-[60px]">Enlaces</span>
        </button>
      </nav>

      {/* Task Modal */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">
                {editingTask ? 'Editar Tarea' : 'Nueva Tarea GTD'}
              </h3>
              <button onClick={() => setIsTaskModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5"/>
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">Título *</label>
                <input
                  type="text"
                  required
                  value={taskForm.title}
                  onChange={e => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none focus:ring-2 ring-indigo-500"
                  placeholder="Ej: Revisar informe de planificación"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium">Descripción *</label>
                  <span className="text-[10px] text-indigo-500 dark:text-indigo-400">
                    Soporta Markdown GFM (**negrita**, - [x] tareas, tablas, `código`)
                  </span>
                </div>
                <textarea
                  rows="4"
                  required
                  value={taskForm.description}
                  onChange={e => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-mono outline-none focus:ring-2 ring-indigo-500"
                  placeholder="Detalles, pasos siguientes o notas de contexto en formato Markdown..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Estado *</label>
                  <select
                    value={taskForm.status}
                    onChange={e => setTaskForm({ ...taskForm, status: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none"
                  >
                    {ALL_STATUSES.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Contexto *</label>
                  <select
                    required
                    value={taskForm.context_id}
                    onChange={e => setTaskForm({ ...taskForm, context_id: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none"
                  >
                    {activeContexts.map(c => (
                      <option key={c.id} value={c.id}>@{c.name}</option>
                    ))}
                    {/* Keep current context in list even if archived */}
                    {editingTask && contexts.find(c => c.id === taskForm.context_id && c.active === false) && (
                      <option value={taskForm.context_id}>
                        @{contextMap[taskForm.context_id]} (archivado)
                      </option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Proyecto</label>
                  <select
                    value={taskForm.project_id}
                    onChange={e => setTaskForm({ ...taskForm, project_id: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none"
                  >
                    <option value="">Ninguno</option>
                    {activeProjects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                    {/* Keep current project in list even if archived */}
                    {editingTask && projects.find(p => p.id === taskForm.project_id && p.active === false) && (
                      <option value={taskForm.project_id}>
                        📁 {projectMap[taskForm.project_id]} (archivado)
                      </option>
                    )}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm bg-slate-100 dark:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Meta Modal: Contexts & Projects Management */}
      {isMetaModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Contextos y Proyectos</h3>
              <button onClick={() => setIsMetaModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5"/>
              </button>
            </div>

            {/* Contexts section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Contextos Dinámicos
                </h4>
                <span className="text-[11px] text-slate-400">{activeContexts.length} activos</span>
              </div>

              <form onSubmit={handleAddContext} className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newContextName}
                  onChange={e => setNewContextName(e.target.value)}
                  placeholder="Nuevo contexto (ej. Hospital, Recados)..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none"
                />
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium">
                  Añadir
                </button>
              </form>

              {/* Active contexts */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {activeContexts.map(c => (
                  <div
                    key={c.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs border border-slate-200/80 dark:border-slate-700/60"
                  >
                    <span>@{c.name}</span>
                    <button
                      onClick={() => handleToggleContextActive(c.id, false)}
                      className="text-slate-400 hover:text-rose-500 transition p-0.5"
                      title="Archivar / ocultar contexto de los desplegables"
                    >
                      <EyeOff className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Archived contexts */}
              {archivedContexts.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-medium text-slate-400 block mb-1.5">
                    Contextos archivados ({archivedContexts.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {archivedContexts.map(c => (
                      <div
                        key={c.id}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100/60 dark:bg-slate-800/40 text-xs text-slate-400 border border-dashed border-slate-300 dark:border-slate-700"
                      >
                        <span className="line-through">@{c.name}</span>
                        <button
                          onClick={() => handleToggleContextActive(c.id, true)}
                          className="text-indigo-500 hover:text-indigo-600 transition p-0.5"
                          title="Reactivar contexto"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Projects section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Proyectos Activos
                </h4>
                <span className="text-[11px] text-slate-400">{activeProjects.length} activos</span>
              </div>

              <form onSubmit={handleAddProject} className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  placeholder="Nombre del nuevo proyecto..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none"
                />
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium">
                  Añadir
                </button>
              </form>

              <div className="flex flex-wrap gap-1.5 mb-2">
                {activeProjects.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 text-emerald-400 text-xs border border-emerald-900/40"
                  >
                    <span>📁 {p.name}</span>
                    <button
                      onClick={() => handleToggleProjectActive(p.id, false)}
                      className="text-emerald-400/70 hover:text-rose-400 transition p-0.5"
                      title="Finalizar / Archivar proyecto"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>{archivedProjectsCount} proyectos finalizados en total</span>
                <button
                  onClick={() => {
                    setIsMetaModalOpen(false);
                    setActiveView('archived_projects');
                  }}
                  className="text-indigo-500 hover:underline font-medium text-[11px]"
                >
                  Ver en pestaña Proyectos →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gemini API Modal */}
      {showApiModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">API Key para Gemini AI</h3>
              <button onClick={() => setShowApiModal(false)} className="p-1 text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5"/>
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Usa esta clave en el header <code className="text-indigo-400">x-api-key</code> para conectar Tasker o el servidor MCP con <code className="text-indigo-400">/api/gemini-voice</code>.
            </p>
            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono text-xs break-all select-all">
              {apiKey || 'Generando clave...'}
            </div>
          </div>
        </div>
      )}

      <VoiceCommandFAB apiKey={apiKey} onActionSuccess={fetchAllData}/>
    </div>
  );
}

function TaskRowCard({ task, contextName, projectName, onStatusChange, onEdit, onDelete }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 hover:border-indigo-500/50 transition">
      <div className="space-y-1.5 flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <h3 className={`font-semibold text-sm ${task.status === 'Completado' ? 'line-through text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
            {task.title}
          </h3>
          <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 text-xs font-medium">
            @{contextName}
          </span>
          {projectName && (
            <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 text-xs font-medium truncate max-w-[200px]">
              📁 {projectName}
            </span>
          )}
        </div>

        {task.description && (
          <div
            onClick={() => setIsExpanded(!isExpanded)}
            className="cursor-pointer group/desc pt-0.5"
            title="Clic para expandir / contraer descripción"
          >
            <MarkdownRenderer
              content={task.description}
              className={isExpanded ? '' : 'line-clamp-2 sm:line-clamp-3'}
            />
            {task.description.length > 90 && (
              <span className="text-[11px] text-indigo-500 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 mt-1 font-medium">
                {isExpanded ? (
                  <>
                    <Minimize2 className="w-3 h-3" /> Mostrar menos
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3 h-3" /> Ver descripción completa
                  </>
                )}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3"/> Creada: {new Date(task.created_at).toLocaleDateString()}
          </span>
          {task.completed_at && (
            <span className="flex items-center gap-1 text-emerald-500">
              <CheckCircle2 className="w-3 h-3"/> Fin: {new Date(task.completed_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800 shrink-0">
        <select
          value={task.status}
          onChange={e => onStatusChange(task.id, e.target.value)}
          className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl text-xs font-medium outline-none"
        >
          {ALL_STATUSES.map(st => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="p-2 text-slate-400 hover:text-indigo-500 rounded-lg" title="Editar tarea">
            <Edit3 className="w-4 h-4"/>
          </button>
          <button onClick={onDelete} className="p-2 text-slate-400 hover:text-rose-500 rounded-lg" title="Eliminar tarea">
            <Trash2 className="w-4 h-4"/>
          </button>
        </div>
      </div>
    </div>
  );
}
