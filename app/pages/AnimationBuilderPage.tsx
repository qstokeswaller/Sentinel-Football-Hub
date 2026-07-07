import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AnimationStudio } from '../components/pitch/AnimationStudio';
import { usePermissions } from '../hooks/usePermissions';

/** Standalone Animation Builder (route /animation, edit at /animation/:id). The studio
 *  also lives inside the Session Planner's Animation tab — same component. */
export const AnimationBuilderPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { canEdit } = usePermissions();
  if (!canEdit) return <div className="py-20 text-center text-slate-400">You don't have permission to build animations.</div>;
  return (
    <div className="pb-10">
      <Link to="/library" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand mb-4 no-underline"><ArrowLeft size={15} /> Back to Library</Link>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-5">{id ? 'Edit Animation' : 'Animation Builder'}</h1>
      <AnimationStudio animationId={id} />
    </div>
  );
};
