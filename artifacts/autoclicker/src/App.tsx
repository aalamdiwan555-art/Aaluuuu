import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  Gauge,
  KeyRound,
  Laptop,
  LogOut,
  Menu,
  MoreHorizontal,
  MousePointer2,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TimerReset,
  Trash2,
  UserRound,
  UsersRound,
  X,
  Zap,
} from 'lucide-react';
import {
  getGetCurrentUserQueryKey,
  getGetDashboardSummaryQueryKey,
  getHealthCheckQueryKey,
  getListAdminUsersQueryKey,
  getListProfilesQueryKey,
  useCreateProfile,
  useDeleteProfile,
  useGetCurrentUser,
  useGetDashboardSummary,
  useHealthCheck,
  useListAdminUsers,
  useListProfiles,
  useLogin,
  useLogout,
  useSignup,
  useStartAutoclicker,
  useStopAutoclicker,
  useUpdateProfile,
  useUpdateUserApproval,
  useUpdateUserSubscription,
  type AdminUser,
  type AuthUser,
  type ClickProfile,
  type DashboardSummary,
  type SubscriptionPlan,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Router as WouterRouter, Switch, useLocation, Link } from 'wouter';

const queryClient = new QueryClient();

const PLAN_LABELS: Record<string, string> = {
  none: 'No plan',
  one_day: '1 day',
  two_days: '2 days',
  three_days: '3 days',
  lifetime: 'Lifetime',
};

const STATUS_COPY: Record<string, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  declined: 'Declined',
};

function formatDate(value?: string | null) {
  if (!value) return 'No expiry';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function formatTime(value?: string | null) {
  if (!value) return 'Not started';
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function errorMessage(error: unknown, fallback = 'Something went wrong. Try again.') {
  if (typeof error === 'object' && error && 'message' in error) return String((error as { message?: string }).message ?? fallback);
  return fallback;
}

function StatusPill({ status, small = false }: { status: string; small?: boolean }) {
  const tone = status === 'approved' ? 'status-approved' : status === 'declined' ? 'status-declined' : status === 'expired' ? 'status-declined' : 'status-pending';
  return <span data-testid={`status-pill-${status}`} className={`status-pill ${tone} ${small ? 'status-pill-small' : ''}`}><span className="status-dot" />{STATUS_COPY[status] ?? status}</span>;
}

function SubscriptionPill({ plan, active }: { plan?: string; active?: boolean }) {
  const label = PLAN_LABELS[plan ?? 'none'] ?? plan ?? 'No plan';
  const display = active || !plan || plan === 'none' ? label : `Expired · ${label}`;
  return <span data-testid={`subscription-pill-${plan ?? 'none'}`} className={`subscription-pill ${active ? 'subscription-active' : ''}`}><span className="plan-mark" />{display}</span>;
}

function Button({ children, variant = 'primary', className = '', disabled, type = 'button', onClick, testId }: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'lime';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  testId: string;
}) {
  return <button data-testid={testId} type={type} onClick={onClick} disabled={disabled} className={`button button-${variant} ${className}`}>{children}</button>;
}

function AppLogo({ compact = false }: { compact?: boolean }) {
  return <Link href="/app" data-testid="link-app-logo" className={`app-logo ${compact ? 'app-logo-compact' : ''}`}>
    <span className="logo-glyph"><MousePointer2 size={18} strokeWidth={2.7} /></span>
    {!compact && <span><strong>auto</strong><b>clicker</b></span>}
  </Link>;
}

function Field({ label, value, onChange, type = 'text', placeholder, min, testId, hint }: {
  label: string; value: string | number; onChange: (value: string) => void; type?: string; placeholder?: string; min?: number; testId: string; hint?: string;
}) {
  return <label className="field">
    <span className="field-label">{label}</span>
    <input data-testid={testId} value={value} onChange={(event) => onChange(event.target.value)} type={type} placeholder={placeholder} min={min} />
    {hint && <span className="field-hint">{hint}</span>}
  </label>;
}

function LoadingRows({ count = 3 }: { count?: number }) {
  return <div className="loading-stack" data-testid="loading-state">{Array.from({ length: count }).map((_, index) => <div className="skeleton-row" key={index}><div className="skeleton skeleton-icon" /><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-short" /></div>)}</div>;
}

function Failure({ message, onRetry, testId = 'error-state' }: { message: string; onRetry: () => void; testId?: string }) {
  return <div className="empty-state error-state" data-testid={testId}><div className="empty-icon"><RefreshCw size={20} /></div><strong>Connection interrupted</strong><p>{message}</p><Button testId="button-retry" variant="secondary" onClick={onRetry}><RefreshCw size={15} /> Retry</Button></div>;
}

function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [, navigate] = useLocation();
  const client = useQueryClient();
  const current = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const health = useHealthCheck({ query: { retry: false, queryKey: getHealthCheckQueryKey() } });
  const login = useLogin();
  const signup = useSignup();

  useEffect(() => {
    if (!current.data) return;
    if (current.data.role === 'admin') navigate('/admin');
    else if (current.data.status === 'pending') navigate('/pending');
    else if (current.data.status === 'approved') navigate('/app');
    else if (current.data.status === 'declined') setNotice('This account is currently declined. Contact your administrator.');
  }, [current.data, navigate]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setNotice('');
    if (mode === 'login') {
      login.mutate({ data: { email, password } }, {
        onSuccess: (response) => {
          client.setQueryData(getGetCurrentUserQueryKey(), response.user);
          if (response.user.role === 'admin') navigate('/admin');
          else if (response.user.status === 'pending') navigate('/pending');
          else if (response.user.status === 'approved') navigate('/app');
          else setNotice('This account is currently declined. Contact your administrator.');
        },
        onError: (error) => setNotice(errorMessage(error, 'We could not sign you in with those details.')),
      });
    } else {
      signup.mutate({ data: { name, email, password } }, {
        onSuccess: (response) => {
          client.setQueryData(getGetCurrentUserQueryKey(), response.user);
          navigate('/pending');
        },
        onError: (error) => setNotice(errorMessage(error, 'We could not create that account.')),
      });
    }
  };

  const busy = login.isPending || signup.isPending;
  return <main className="auth-layout noise">
    <section className="auth-visual">
      <div className="auth-visual-top"><AppLogo /><span className="eyebrow"><span className="live-dot" /> Control center</span></div>
      <div className="auth-hero">
        <div className="eyebrow">Reliable repetition, made visible</div>
        <h1>Keep your hands<br /><em>out of the loop.</em></h1>
        <p>Autoclicker turns repetitive clicking into a calm, observable routine. Configure once. Run with confidence.</p>
        <div className="signal-panel">
          <div className="signal-panel-head"><span>RUN SIGNAL</span><span className="signal-live"><i /> ready</span></div>
          <div className="signal-wave"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>
          <div className="signal-panel-foot"><span>precision mode</span><strong>10 ms → 1 hr</strong></div>
        </div>
      </div>
      <div className="auth-visual-bottom"><span>AC / 01</span><span>quiet utility for loud repetition</span><span>v1.4.2</span></div>
    </section>
    <section className="auth-form-side">
      <div className="mobile-auth-brand"><AppLogo /></div>
      <div className="auth-form-wrap">
        <div className="auth-kicker"><KeyRound size={16} /> Account access</div>
        <h2>{mode === 'login' ? 'Welcome back.' : 'Set up your station.'}</h2>
        <p className="auth-subtitle">{mode === 'login' ? 'Sign in to pick up where you left off.' : 'Create an account. An admin will review it before you can run.'}</p>
        <div className="auth-tabs" role="tablist">
          <button data-testid="tab-login" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setNotice(''); }} role="tab">Sign in</button>
          <button data-testid="tab-signup" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setNotice(''); }} role="tab">Create account</button>
        </div>
        <form onSubmit={submit} className="auth-form">
          {mode === 'signup' && <Field label="Your name" value={name} onChange={setName} placeholder="e.g. Mira Chen" testId="input-name" />}
          <Field label="Email address" value={email} onChange={setEmail} type="email" placeholder="you@workspace.com" testId="input-email" />
          <Field label="Password" value={password} onChange={setPassword} type="password" placeholder={mode === 'login' ? 'Enter your password' : 'At least 8 characters'} testId="input-password" />
          {notice && <div className="form-notice" data-testid="text-auth-notice"><CircleHelp size={16} />{notice}</div>}
          <Button testId="button-auth-submit" type="submit" disabled={busy} className="button-wide">{busy ? 'Checking credentials…' : mode === 'login' ? <>Sign in <ArrowRight size={17} /></> : <>Request access <ArrowRight size={17} /></>}</Button>
        </form>
        <div className="auth-support"><span className={`system-indicator ${health.data ? 'is-up' : ''}`} />{health.data ? 'Control center online' : health.isLoading ? 'Checking system status' : 'System check unavailable'}<button data-testid="button-health-refresh" onClick={() => { client.invalidateQueries({ queryKey: getHealthCheckQueryKey() }); health.refetch(); }}><RefreshCw size={12} /></button></div>
      </div>
      <div className="auth-legal">By continuing, you agree to keep your automation within the rules of the service you use.</div>
    </section>
  </main>;
}

function PendingPage() {
  const [, navigate] = useLocation();
  const client = useQueryClient();
  const current = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const logout = useLogout();
  const [checking, setChecking] = useState(false);
  const refresh = async () => { setChecking(true); await current.refetch(); setChecking(false); };
  useEffect(() => {
    if (current.data?.status === 'approved') navigate('/app');
    if (current.data?.role === 'admin') navigate('/admin');
  }, [current.data, navigate]);
  const user = current.data;
  return <main className="pending-page noise">
    <header className="minimal-header"><AppLogo /><span className="header-status"><span className="live-dot" /> Secure session</span></header>
    <section className="pending-wrap">
      <div className="pending-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="pending-core"><Clock3 size={34} /></div></div>
      <div className="eyebrow">Access request received</div>
      <h1>You're in the queue<span>.</span></h1>
      <p className="pending-lede">Your account is set up, but an administrator needs to approve it before the click engine can run.</p>
      <div className="pending-card">
        <div className="pending-card-top"><div className="pending-avatar">{user?.name?.slice(0, 1).toUpperCase() ?? 'A'}</div><div><strong data-testid="text-pending-name">{user?.name ?? 'Your account'}</strong><span data-testid="text-pending-email">{user?.email ?? 'Session ready'}</span></div><StatusPill status="pending" /></div>
        <div className="pending-steps"><div className="step complete"><span><Check size={13} /></span><div><strong>Account created</strong><small>Your access request is recorded.</small></div></div><div className="step current"><span><i /></span><div><strong>Admin review</strong><small>Usually completed within one working day.</small></div></div><div className="step"><span>3</span><div><strong>Automation unlocked</strong><small>Your dashboard will be ready once approved.</small></div></div></div>
      </div>
      <div className="pending-actions"><Button testId="button-check-status" variant="primary" onClick={refresh} disabled={checking}><RefreshCw size={16} className={checking ? 'spin' : ''} /> {checking ? 'Checking…' : 'Check status'}</Button><Button testId="button-pending-logout" variant="ghost" onClick={() => logout.mutate(undefined, { onSuccess: () => { client.removeQueries({ queryKey: getGetCurrentUserQueryKey() }); navigate('/'); } })}><LogOut size={16} /> Sign out</Button></div>
      {current.error && <div className="form-notice pending-notice" data-testid="text-pending-notice"><CircleHelp size={16} /> Could not reach the account service. Try checking again.</div>}
    </section>
    <footer className="minimal-footer"><span>AC / ACCESS GATE</span><span>Need help? Ask your workspace administrator.</span></footer>
  </main>;
}

function Sidebar({ user, admin = false }: { user?: AuthUser; admin?: boolean }) {
  const [, navigate] = useLocation();
  const client = useQueryClient();
  const logout = useLogout();
  return <aside className="sidebar">
    <div className="sidebar-brand"><AppLogo /><span className="sidebar-version">v1.4</span></div>
    <nav className="sidebar-nav">
      <span className="nav-label">Workspace</span>
      <Link href={admin ? '/admin' : '/app'} data-testid="link-dashboard" className="nav-item active"><Gauge size={18} /><span>{admin ? 'Review queue' : 'Control room'}</span><span className="nav-arrow">↗</span></Link>
      {!admin && <Link href="/app#profiles" data-testid="link-profiles" className="nav-item"><SlidersHorizontal size={18} /><span>Click profiles</span></Link>}
      {admin && <span className="nav-item nav-disabled"><UsersRound size={18} /><span>All operators</span></span>}
    </nav>
    <div className="sidebar-lower">
      <div className="sidebar-help"><CircleHelp size={16} /><div><strong>Need a hand?</strong><span>Read the run guide</span></div><ArrowRight size={14} /></div>
      <div className="account-mini"><div className="account-avatar">{user?.name?.slice(0, 1).toUpperCase() ?? 'A'}</div><div className="account-copy"><strong data-testid="text-sidebar-username">{user?.name ?? 'Operator'}</strong><span>{admin ? 'Administrator' : 'Operator'}</span></div><button data-testid="button-logout" onClick={() => logout.mutate(undefined, { onSuccess: () => { client.removeQueries({ queryKey: getGetCurrentUserQueryKey() }); navigate('/'); } })}><LogOut size={16} /></button></div>
    </div>
  </aside>;
}

function AppShell({ children, user }: { children: ReactNode; user?: AuthUser }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return <div className="app-shell noise"><div className={`mobile-sidebar-backdrop ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)} /><div className={`sidebar-holder ${mobileOpen ? 'mobile-open' : ''}`}><Sidebar user={user} /></div><div className="app-main"><header className="app-topbar"><button data-testid="button-mobile-menu" className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><div className="topbar-title"><span className="eyebrow">Operator console</span><strong data-testid="text-page-title">Control room</strong></div><div className="topbar-right"><span className="topbar-date">{new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</span><span className="topbar-health"><span className="live-dot" /> Engine ready</span></div></header>{children}</div></div>;
}

function DashboardPage() {
  const [, navigate] = useLocation();
  const current = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const summary = useGetDashboardSummary({ query: { retry: false, queryKey: getGetDashboardSummaryQueryKey() } });
  const profiles = useListProfiles({ query: { retry: false, queryKey: getListProfilesQueryKey() } });
  const user = current.data;
  useEffect(() => {
    if (user && user.role === 'admin') navigate('/admin');
    else if (user && user.status === 'pending') navigate('/pending');
    else if (user && user.status === 'declined') navigate('/');
  }, [navigate, user]);
  if (current.isLoading) return <AppShell><div className="page-content"><LoadingRows count={5} /></div></AppShell>;
  if (!user) return <Redirecting />;
  return <AppShell user={user}><DashboardContent user={user} summary={summary} profiles={profiles} /></AppShell>;
}

function Redirecting() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate('/'); }, [navigate]);
  return <main className="center-loading"><div className="loading-mark"><MousePointer2 size={20} /></div><span>Restoring session…</span></main>;
}

function DashboardContent({ user, summary, profiles }: {
  user: AuthUser;
  summary: { data?: DashboardSummary; error: unknown; isLoading: boolean; refetch: () => unknown };
  profiles: { data?: ClickProfile[]; error: unknown; isLoading: boolean; refetch: () => unknown };
}) {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [run, setRun] = useState<{ running: boolean; clicks: number; startedAt: string | null; message?: string }>({ running: false, clicks: 0, startedAt: null });
  const [dialog, setDialog] = useState<{ open: boolean; profile?: ClickProfile }>({ open: false });
  const start = useStartAutoclicker();
  const stop = useStopAutoclicker();
  const profileList = profiles.data ?? [];
  const activeProfile = profileList.find((profile) => profile.id === selectedId) ?? profileList.find((profile) => profile.isDefault) ?? profileList[0];
  useEffect(() => {
    if (!selectedId && activeProfile) setSelectedId(activeProfile.id);
  }, [activeProfile, selectedId]);
  const currentSummary = summary.data;
  const runToggle = () => {
    if (run.running) {
      stop.mutate(undefined, { onSuccess: (result) => { setRun(result); client.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); } });
    } else if (activeProfile) {
      start.mutate({ data: { profileId: activeProfile.id } }, { onSuccess: (result) => { setRun(result); client.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); } });
    }
  };
  return <main className="page-content">
    <section className="dashboard-hero animate-reveal">
      <div><div className="eyebrow">Thursday · operator view</div><h1>Make the repeat<br /><em>disappear.</em></h1><p>Pick a profile, set it loose, and keep an eye on the signal.</p></div>
      <div className={`run-console ${run.running ? 'is-running' : ''}`}>
        <div className="run-console-head"><span><span className={`status-dot ${run.running ? 'running-dot' : ''}`} /> {run.running ? 'Automation live' : 'Engine idle'}</span><span className="font-mono">RUN / 0{run.running ? '1' : '0'}</span></div>
        <div className="run-console-main"><div className="run-count"><strong data-testid="text-run-clicks">{run.clicks.toLocaleString()}</strong><span>clicks this run</span></div><button data-testid="button-run-toggle" className={`run-button ${run.running ? 'stop' : ''}`} onClick={runToggle} disabled={start.isPending || stop.isPending || !activeProfile}>{run.running ? <><Pause size={18} fill="currentColor" /> Stop run</> : <><Play size={18} fill="currentColor" /> Start run</>}</button></div>
        <div className="run-console-foot"><span>{run.startedAt ? `Started ${formatTime(run.startedAt)}` : run.message ?? 'Ready when you are'}</span><span className="font-mono">{activeProfile ? `${activeProfile.intervalMs}ms interval` : 'No profile'}</span></div>
      </div>
    </section>
    <section className="summary-grid animate-reveal-delay">
      <SummaryMetric label="Account status" value={<StatusPill status={currentSummary?.status ?? user.status} />} note="Your workspace access" icon={<ShieldCheck size={18} />} />
      <SummaryMetric label="Subscription" value={<SubscriptionPill plan={currentSummary?.subscription.plan ?? user.subscription.plan} active={currentSummary?.subscription.active ?? user.subscription.active} />} note={currentSummary?.subscription.expiresAt ? `Renews ${formatDate(currentSummary.subscription.expiresAt)}` : 'Assigned by admin'} icon={<Zap size={18} />} />
      <SummaryMetric label="All-time clicks" value={<strong className="metric-number" data-testid="text-total-clicks">{(currentSummary?.totalClicks ?? 0).toLocaleString()}</strong>} note="Across every profile" icon={<Activity size={18} />} />
      <SummaryMetric label="Selected profile" value={<strong className="metric-profile" data-testid="text-active-profile">{activeProfile?.name ?? currentSummary?.activeProfile ?? 'None yet'}</strong>} note={activeProfile ? `${activeProfile.clicks.toLocaleString()} target clicks` : 'Create your first profile'} icon={<MousePointer2 size={18} />} />
    </section>
    <section id="profiles" className="profiles-section animate-reveal-delay-2">
      <div className="section-heading"><div><div className="eyebrow">Automation library</div><h2>Click profiles</h2><p>Small recipes for repetitive work. Keep them precise.</p></div><Button testId="button-new-profile" onClick={() => setDialog({ open: true })}><Plus size={17} /> New profile</Button></div>
      {profiles.isLoading ? <LoadingRows /> : profiles.error ? <Failure message={errorMessage(profiles.error, 'Profiles could not be loaded.')} onRetry={() => profiles.refetch()} /> : profileList.length === 0 ? <div className="empty-state profile-empty" data-testid="empty-profiles"><div className="empty-icon"><TimerReset size={22} /></div><strong>Your library is empty</strong><p>Make a profile for the task you repeat most. It takes about 20 seconds.</p><Button testId="button-create-first-profile" onClick={() => setDialog({ open: true })}><Plus size={16} /> Create first profile</Button></div> : <div className="profiles-list">{profileList.map((profile, index) => <ProfileRow key={profile.id} profile={profile} selected={activeProfile?.id === profile.id} index={index} onSelect={() => setSelectedId(profile.id)} onEdit={() => setDialog({ open: true, profile })} />)}</div>}
    </section>
    <section className="operator-note"><div className="note-line"><Sparkles size={16} /><span>Good to know</span></div><p>Autoclicker runs in the current browser session. Keep this tab open while a run is active.</p><button data-testid="button-copy-run-guide" onClick={() => navigator.clipboard?.writeText('Keep the Autoclicker tab open while a run is active.')}><Copy size={14} /> Copy note</button></section>
    {dialog.open && <ProfileDialog profile={dialog.profile} onClose={() => setDialog({ open: false })} />}
  </main>;
}

function SummaryMetric({ label, value, note, icon }: { label: string; value: ReactNode; note: string; icon: ReactNode }) {
  return <article className="summary-metric" data-testid={`summary-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="metric-icon">{icon}</div><span className="metric-label">{label}</span><div className="metric-value">{value}</div><span className="metric-note">{note}</span></article>;
}

function ProfileRow({ profile, selected, index, onSelect, onEdit }: { profile: ClickProfile; selected: boolean; index: number; onSelect: () => void; onEdit: () => void }) {
  const client = useQueryClient();
  const remove = useDeleteProfile();
  const update = useUpdateProfile();
  const [menu, setMenu] = useState(false);
  const makeDefault = () => update.mutate({ id: profile.id, data: { isDefault: true } }, { onSuccess: () => { setMenu(false); client.invalidateQueries({ queryKey: getListProfilesQueryKey() }); } });
  const removeProfile = () => { if (window.confirm(`Delete ${profile.name}?`)) remove.mutate({ id: profile.id }, { onSuccess: () => { setMenu(false); client.invalidateQueries({ queryKey: getListProfilesQueryKey() }); } }); };
  return <div className={`profile-row ${selected ? 'selected' : ''}`} data-testid={`row-profile-${profile.id}`} style={{ animationDelay: `${index * 50}ms` }}>
    <button data-testid={`button-select-profile-${profile.id}`} className="profile-select" onClick={onSelect}><span className="profile-symbol">{profile.name.slice(0, 1).toUpperCase()}</span><span className="profile-name-block"><strong>{profile.name}</strong><span>{profile.isDefault ? 'Default profile' : 'Custom profile'}</span></span>{selected && <span className="selected-badge"><Check size={12} /> Selected</span>}</button>
    <div className="profile-spec"><span className="profile-spec-label">Interval</span><strong>{profile.intervalMs}<small>ms</small></strong></div><div className="profile-spec"><span className="profile-spec-label">Target</span><strong>{profile.clicks.toLocaleString()}<small> clicks</small></strong></div>
    <div className="profile-actions"><Button testId={`button-edit-profile-${profile.id}`} variant="ghost" className="icon-button" onClick={onEdit}><Pencil size={16} /></Button><button data-testid={`button-profile-menu-${profile.id}`} className="icon-button menu-button" onClick={() => setMenu(!menu)}><MoreHorizontal size={18} /></button>{menu && <div className="profile-menu"><button data-testid={`button-default-profile-${profile.id}`} onClick={makeDefault}><Check size={14} /> Make default</button><button data-testid={`button-delete-profile-${profile.id}`} className="danger-text" onClick={removeProfile}><Trash2 size={14} /> Delete profile</button></div>}</div>
  </div>;
}

function ProfileDialog({ profile, onClose }: { profile?: ClickProfile; onClose: () => void }) {
  const client = useQueryClient();
  const create = useCreateProfile();
  const update = useUpdateProfile();
  const [name, setName] = useState(profile?.name ?? '');
  const [intervalMs, setIntervalMs] = useState(String(profile?.intervalMs ?? 250));
  const [clicks, setClicks] = useState(String(profile?.clicks ?? 100));
  const [isDefault, setIsDefault] = useState(profile?.isDefault ?? false);
  const [notice, setNotice] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setNotice('');
    const values = { name: name.trim(), intervalMs: Number(intervalMs), clicks: Number(clicks), isDefault };
    if (!values.name || values.intervalMs < 10 || values.clicks < 0) { setNotice('Add a name and use an interval of at least 10 ms.'); return; }
    if (profile) update.mutate({ id: profile.id, data: values }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListProfilesQueryKey() }); onClose(); }, onError: (error) => setNotice(errorMessage(error)) });
    else create.mutate({ data: values }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListProfilesQueryKey() }); onClose(); }, onError: (error) => setNotice(errorMessage(error)) });
  };
  const busy = create.isPending || update.isPending;
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title"><div className="dialog-head"><div><div className="eyebrow">{profile ? 'Edit recipe' : 'New recipe'}</div><h2 id="profile-dialog-title">{profile ? 'Tune profile' : 'Create a click profile'}</h2></div><button data-testid="button-close-profile-dialog" className="icon-button" onClick={onClose}><X size={19} /></button></div><form onSubmit={submit}><Field label="Profile name" value={name} onChange={setName} placeholder="e.g. Inventory refresh" testId="input-profile-name" /><div className="form-two-col"><Field label="Interval (ms)" value={intervalMs} onChange={setIntervalMs} type="number" min={10} hint="Minimum 10 ms" testId="input-profile-interval" /><Field label="Target clicks" value={clicks} onChange={setClicks} type="number" min={0} hint="0 means unlimited" testId="input-profile-clicks" /></div><label className="check-field"><input data-testid="input-profile-default" type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} /><span className="check-box">{isDefault && <Check size={13} />}</span><span><strong>Make this the default</strong><small>Use this profile when you start a run.</small></span></label>{notice && <div className="form-notice" data-testid="text-profile-notice"><CircleHelp size={16} /> {notice}</div>}<div className="dialog-actions"><Button testId="button-cancel-profile" variant="ghost" onClick={onClose}>Cancel</Button><Button testId="button-save-profile" type="submit" disabled={busy}>{busy ? 'Saving…' : profile ? 'Save changes' : 'Create profile'}</Button></div></form></div></div>;
}

function AdminPage() {
  const [, navigate] = useLocation();
  const current = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const users = useListAdminUsers({ query: { retry: false, queryKey: getListAdminUsersQueryKey() } });
  useEffect(() => {
    if (current.data && current.data.role !== 'admin') navigate(current.data.status === 'pending' ? '/pending' : '/app');
  }, [current.data, navigate]);
  if (current.isLoading) return <AppShell><div className="page-content"><LoadingRows count={6} /></div></AppShell>;
  if (!current.data) return <Redirecting />;
  return <AdminShell user={current.data}><AdminContent users={users} /></AdminShell>;
}

function AdminShell({ children, user }: { children: ReactNode; user: AuthUser }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return <div className="app-shell noise"><div className={`mobile-sidebar-backdrop ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)} /><div className={`sidebar-holder ${mobileOpen ? 'mobile-open' : ''}`}><Sidebar user={user} admin /></div><div className="app-main"><header className="app-topbar"><button data-testid="button-admin-mobile-menu" className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><div className="topbar-title"><span className="eyebrow">Administration</span><strong data-testid="text-admin-page-title">Review queue</strong></div><div className="topbar-right"><span className="topbar-health"><span className="live-dot" /> Admin mode</span></div></header>{children}</div></div>;
}

function AdminContent({ users }: { users: { data?: AdminUser[]; error: unknown; isLoading: boolean; refetch: () => unknown } }) {
  const client = useQueryClient();
  const approval = useUpdateUserApproval();
  const subscription = useUpdateUserSubscription();
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'declined'>('pending');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const list = useMemo(() => users.data ?? [], [users.data]);
  const pendingCount = list.filter((user) => user.status === 'pending').length;
  const filtered = filter === 'all' ? list : list.filter((user) => user.status === filter);
  const changeApproval = (user: AdminUser, status: 'approved' | 'declined' | 'pending') => {
    setSavingId(user.id);
    approval.mutate({ id: user.id, data: { status } }, { onSuccess: () => { setSavingId(null); client.invalidateQueries({ queryKey: getListAdminUsersQueryKey() }); }, onError: () => setSavingId(null) });
  };
  const changePlan = (user: AdminUser, plan: SubscriptionPlan) => {
    setSavingId(user.id);
    subscription.mutate({ id: user.id, data: { plan } }, { onSuccess: () => { setSavingId(null); client.invalidateQueries({ queryKey: getListAdminUsersQueryKey() }); }, onError: () => setSavingId(null) });
  };
  return <main className="page-content admin-content">
    <section className="admin-intro animate-reveal"><div><div className="eyebrow">Access management / 01</div><h1>Keep the queue<br /><em>moving.</em></h1><p>Approve operators and assign the runway they need. Nothing runs without your signal.</p></div><div className="queue-count"><strong data-testid="text-pending-count">{pendingCount.toString().padStart(2, '0')}</strong><span>awaiting review</span><div className="queue-tick"><span /><span /><span /><span /><span /><span /></div></div></section>
    <section className="admin-stats animate-reveal-delay"><SummaryMetric label="Total accounts" value={<strong className="metric-number">{list.length}</strong>} note="Across this workspace" icon={<UsersRound size={18} />} /><SummaryMetric label="Awaiting review" value={<strong className="metric-number accent-number">{pendingCount}</strong>} note="Needs your attention" icon={<Clock3 size={18} />} /><SummaryMetric label="Approved" value={<strong className="metric-number">{list.filter((user) => user.status === 'approved').length}</strong>} note="Ready to operate" icon={<ShieldCheck size={18} />} /></section>
    <section className="admin-queue-section animate-reveal-delay-2"><div className="section-heading admin-heading"><div><div className="eyebrow">Operator accounts</div><h2>Review queue</h2></div><div className="queue-tools"><div className="filter-tabs">{(['pending', 'all', 'approved', 'declined'] as const).map((item) => <button data-testid={`button-filter-${item}`} className={filter === item ? 'active' : ''} key={item} onClick={() => setFilter(item)}>{item[0].toUpperCase() + item.slice(1)}{item === 'pending' && pendingCount > 0 && <b>{pendingCount}</b>}</button>)}</div><Button testId="button-refresh-admin" variant="secondary" onClick={() => users.refetch()}><RefreshCw size={15} /> Refresh</Button></div></div>
      {users.isLoading ? <LoadingRows count={4} /> : users.error ? <Failure message={errorMessage(users.error, 'User accounts could not be loaded.')} onRetry={() => users.refetch()} /> : filtered.length === 0 ? <div className="empty-state" data-testid="empty-admin-queue"><div className="empty-icon"><Check size={22} /></div><strong>{filter === 'pending' ? 'Queue is clear' : 'No matching accounts'}</strong><p>{filter === 'pending' ? 'Every access request has a decision. Nice work.' : 'Try a different queue filter.'}</p></div> : <div className="admin-table-wrap"><div className="admin-table-head"><span>Operator</span><span>Access</span><span>Subscription</span><span>Created</span><span /></div>{filtered.map((user) => <AdminRow key={user.id} user={user} expanded={expanded === user.id} setExpanded={() => setExpanded(expanded === user.id ? null : user.id)} saving={savingId === user.id} onApproval={(status) => changeApproval(user, status)} onPlan={(plan) => changePlan(user, plan)} />)}</div>}
    </section>
  </main>;
}

function AdminRow({ user, expanded, setExpanded, saving, onApproval, onPlan }: { user: AdminUser; expanded: boolean; setExpanded: () => void; saving: boolean; onApproval: (status: 'approved' | 'declined' | 'pending') => void; onPlan: (plan: SubscriptionPlan) => void }) {
  return <div className={`admin-row ${expanded ? 'expanded' : ''}`} data-testid={`row-admin-user-${user.id}`}><div className="admin-row-main"><div className="admin-operator"><div className="operator-avatar">{user.name.slice(0, 1).toUpperCase()}</div><div><strong data-testid={`text-admin-user-${user.id}`}>{user.name}</strong><span>{user.email}</span></div></div><div><StatusPill status={user.status} small /></div><div><SubscriptionPill plan={user.subscription.plan} active={user.subscription.active} /></div><div className="created-date">{formatDate(user.createdAt)}</div><button data-testid={`button-expand-admin-user-${user.id}`} className="icon-button expand-button" onClick={setExpanded}><ChevronDown size={18} /></button></div>{expanded && <div className="admin-row-details"><div className="detail-block"><span className="field-label">Access decision</span><div className="decision-actions"><Button testId={`button-approve-user-${user.id}`} variant={user.status === 'approved' ? 'lime' : 'secondary'} disabled={saving || user.status === 'approved'} onClick={() => onApproval('approved')}><Check size={14} /> Approve</Button><Button testId={`button-decline-user-${user.id}`} variant={user.status === 'declined' ? 'danger' : 'ghost'} disabled={saving || user.status === 'declined'} onClick={() => onApproval('declined')}><X size={14} /> Decline</Button></div></div><div className="detail-block"><span className="field-label">Assign subscription</span><select data-testid={`select-subscription-${user.id}`} value={user.subscription.plan} onChange={(event) => onPlan(event.target.value as SubscriptionPlan)} disabled={saving}><option value="none">No plan</option><option value="one_day">1 day</option><option value="two_days">2 days</option><option value="three_days">3 days</option><option value="lifetime">Lifetime</option></select><small>{user.subscription.expiresAt ? `Active until ${formatDate(user.subscription.expiresAt)}` : 'Assignment starts access immediately.'}</small></div><div className="detail-account"><span className="field-label">Account ID</span><span className="font-mono">{user.id}</span></div></div>}</div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={AuthPage} /><Route path="/pending" component={PendingPage} /><Route path="/app" component={DashboardPage} /><Route path="/admin" component={AdminPage} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;