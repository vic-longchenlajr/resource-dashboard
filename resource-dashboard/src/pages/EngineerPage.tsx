import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ViewHeader } from '../dashboard/ViewHeader';
import { ViewFilterContext, useFilters } from '../context/ViewFilterContext';
import type { ViewFilterContextValue } from '../context/ViewFilterContext';

/**
 * Inner provider that shadows the outer DexieViewFilterProvider with the
 * selected engineer so all child panels see it via useFilters().
 */
function EngineerViewProvider({
  children,
  engineer,
}: {
  children: React.ReactNode;
  engineer: string | undefined;
}) {
  const base = useFilters(); // reads outer DexieViewFilterProvider
  const value: ViewFilterContextValue = {
    ...base,
    selectedEngineer: engineer,
    filters: { ...base.filters, engineer },
  };
  return (
    <ViewFilterContext.Provider value={value}>
      {children}
    </ViewFilterContext.Provider>
  );
}

function EngineerPageContent({
  engineer,
  onEngineerChange,
  activityFilter,
  onActivityChange,
}: {
  engineer: string | undefined;
  onEngineerChange: (name: string) => void;
  activityFilter: string;
  onActivityChange: (activity: string) => void;
}) {
  return (
    <div>
      <ViewHeader
        title="Engineer Profile"
        showEngineerFilter
        engineerValue={engineer ?? ''}
        onEngineerChange={onEngineerChange}
        showActivityFilter={!!engineer}
        activityValue={activityFilter}
        onActivityChange={onActivityChange}
      />

      {engineer ? (
        <div className="text-center py-20 text-[var(--text-muted)]">
          <p className="text-[15px] font-medium text-[var(--text-primary)] mb-2">{engineer}</p>
          <p className="text-[13px]">Full profile view coming in Section C.</p>
        </div>
      ) : (
        <div className="text-center py-20 text-[var(--text-muted)]">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <p className="text-[14px]">Select an engineer from the dropdown above to view their profile.</p>
        </div>
      )}
    </div>
  );
}

export function EngineerPage() {
  const { fullName } = useParams<{ fullName?: string }>();
  const navigate = useNavigate();
  const [activityFilter, setActivityFilter] = useState('');

  const engineer = fullName ? decodeURIComponent(fullName) : undefined;

  const handleEngineerChange = (name: string) => {
    setActivityFilter(''); // reset activity when switching engineers
    if (name) {
      navigate(`/dashboard/engineer/${encodeURIComponent(name)}`, { replace: true });
    } else {
      navigate('/dashboard/engineer', { replace: true });
    }
  };

  return (
    <EngineerViewProvider engineer={engineer}>
      <EngineerPageContent
        engineer={engineer}
        onEngineerChange={handleEngineerChange}
        activityFilter={activityFilter}
        onActivityChange={setActivityFilter}
      />
    </EngineerViewProvider>
  );
}
