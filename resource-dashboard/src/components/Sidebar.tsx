import { Link, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';

const DASHBOARD_ICON = (
  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1v-5zM4 14a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1v-5z" />
  </svg>
);

const DASHBOARD_SUB_ITEMS = [
  { path: '/dashboard/overview', label: 'Overview' },
  { path: '/dashboard/planning', label: 'Planning' },
  { path: '/dashboard/team', label: 'Team' },
  { path: '/dashboard/engineer', label: 'Engineer Profile' },
];

const NAV_ITEMS = [
  {
    path: '/updates',
    label: 'Updates',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    path: '/import',
    label: 'Import',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
  },
  {
    path: '/config',
    label: 'Config',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const location = useLocation();
  const config = useLiveQuery(() => db.config.get(1));
  const lastImport = useLiveQuery(() =>
    db.importLogs.orderBy('imported_at').reverse().first()
  );
  const entriesCount = useLiveQuery(() => db.timesheets.count());
  const peopleCount = useLiveQuery(async () => {
    const members = await db.teamMembers.toArray();
    return members.length;
  });
  const totalHours = useLiveQuery(async () => {
    const sheets = await db.timesheets.toArray();
    return sheets.reduce((sum, s) => sum + s.hours, 0);
  });

  const isLoading = entriesCount === undefined || peopleCount === undefined;

  return (
    <div
      className="sidebar fixed left-0 top-0 w-[220px] h-screen flex flex-col z-40"
      style={{ backgroundColor: 'var(--bg-sidebar)' }}
    >
      {/* Branding */}
      <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h1 className="text-[15px] font-semibold text-white">
          Resource Dashboard
        </h1>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-on-dark-muted)' }}>
          {config?.team_name || 'Engineering Team'}
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3">
        {/* Dashboard section with sub-items */}
        {(() => {
          const isDashboardActive = location.pathname.startsWith('/dashboard');
          return (
            <div className="mb-1">
              <Link
                to="/dashboard/overview"
                className="flex items-center gap-3 rounded-md text-[13px] font-medium transition-colors border-l-[3px] pl-[9px] pr-3 py-2.5"
                style={{
                  color: isDashboardActive ? 'var(--text-on-dark-active)' : 'var(--text-on-dark)',
                  borderColor: isDashboardActive ? 'var(--accent)' : 'transparent',
                  backgroundColor: isDashboardActive ? 'var(--bg-sidebar-active)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isDashboardActive) e.currentTarget.style.backgroundColor = 'var(--bg-sidebar-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isDashboardActive) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={{ color: isDashboardActive ? 'var(--text-on-dark-active)' : 'var(--text-on-dark)' }}>
                  {DASHBOARD_ICON}
                </span>
                Dashboard
              </Link>
              {/* Sub-items */}
              <div className="mt-0.5">
                {DASHBOARD_SUB_ITEMS.map(sub => {
                  const isSubActive = location.pathname === sub.path;
                  return (
                    <Link
                      key={sub.path}
                      to={sub.path}
                      className="flex items-center rounded-md text-[12px] transition-colors mb-0.5 pl-[39px] pr-3 py-1.5"
                      style={{
                        color: isSubActive ? 'var(--text-on-dark-active)' : 'var(--text-on-dark-muted)',
                        backgroundColor: isSubActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                        fontWeight: isSubActive ? 500 : 400,
                      }}
                      onMouseEnter={(e) => {
                        if (!isSubActive) e.currentTarget.style.backgroundColor = 'var(--bg-sidebar-hover)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSubActive) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {sub.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Other nav items */}
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`
                flex items-center gap-3 rounded-md text-[13px] font-medium transition-colors mb-0.5
                ${isActive
                  ? 'text-white border-l-[3px] border-[var(--accent)] pl-[9px] pr-3 py-2.5'
                  : 'border-l-[3px] border-transparent pl-[9px] pr-3 py-2.5 hover:text-white'
                }
              `}
              style={{
                color: isActive ? 'var(--text-on-dark-active)' : 'var(--text-on-dark)',
                backgroundColor: isActive ? 'var(--bg-sidebar-active)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-sidebar-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <span style={{ color: isActive ? 'var(--text-on-dark-active)' : 'var(--text-on-dark)' }}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Status Footer */}
      <div className="mt-auto px-5 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {isLoading ? (
          <p className="text-[11px]" style={{ color: 'var(--text-on-dark-muted)' }}>
            Loading...
          </p>
        ) : lastImport ? (
          <div className="space-y-1">
            <p className="text-[11px]" style={{ color: 'var(--text-on-dark-muted)' }}>
              Last import:{' '}
              <span style={{ color: 'var(--text-on-dark)' }}>
                {new Date(lastImport.imported_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-on-dark-muted)' }}>
              {entriesCount?.toLocaleString() ?? 0} entries &middot; {peopleCount ?? 0} people
            </p>
            <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-on-dark-muted)' }}>
              {totalHours?.toLocaleString('en-US', { maximumFractionDigits: 0 }) ?? 0} total hours
            </p>
          </div>
        ) : (
          <p className="text-[11px]" style={{ color: 'var(--text-on-dark-muted)' }}>
            No data imported
          </p>
        )}
        <p className="text-[10px] mt-2 tabular-nums" style={{ color: 'var(--text-on-dark-muted)', opacity: 0.5 }}>
          v{__APP_VERSION__}
        </p>
      </div>
    </div>
  );
}
