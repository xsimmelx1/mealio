import { useNavigate } from 'react-router-dom';

export default function OnboardingView() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex min-h-full max-w-app flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="text-5xl" aria-hidden>
        🥕
      </span>
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Willkommen bei Mealio</h1>
        <p className="mt-2 text-slate-500">
          Der Einrichtungs-Assistent kommt in Milestone 3. Du kannst schon in die App springen.
        </p>
      </div>
      <button
        onClick={() => navigate('/plan')}
        className="rounded-full bg-brand-500 px-6 py-3 font-semibold text-white shadow-sm active:scale-95"
      >
        Los geht's
      </button>
    </div>
  );
}
