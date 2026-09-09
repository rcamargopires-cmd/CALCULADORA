import React from 'react';

type Props = {
  name: string;
  children: React.ReactNode;
  critical?: boolean;
};

type State = { hasError: boolean };

class ModuleErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error(`[MOTYQ:${this.props.name}] render failure`, error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (!this.props.critical) return null;

    return (
      <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-900">
        <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50">
          <p className="text-xs font-black uppercase tracking-[.14em] text-sky-700">MOTYQ · RECUPERAÇÃO</p>
          <h1 className="mt-2 text-2xl font-semibold">O painel encontrou um erro isolado.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Seus dados continuam salvos. Recarregue o MOTYQ para tentar novamente.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
          >
            RECARREGAR MOTYQ
          </button>
        </div>
      </main>
    );
  }
}

export default ModuleErrorBoundary;
