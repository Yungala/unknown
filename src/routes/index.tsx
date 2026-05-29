import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { useCounterStore } from '@/stores/counter-store';
import { env } from '@/env';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const { count, increment, decrement, reset } = useCounterStore();

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{env.VITE_APP_NAME}</h1>
        <p className="text-muted-foreground text-sm">
          React + Vite + TanStack Router/Query + Zustand + shadcn
        </p>
      </header>

      <div className="border rounded-lg p-6 space-y-4">
        <p className="text-sm text-muted-foreground">Zustand 카운터 데모</p>
        <p className="text-5xl font-mono">{count}</p>
        <div className="flex gap-2">
          <Button onClick={increment}>+1</Button>
          <Button variant="secondary" onClick={decrement}>
            -1
          </Button>
          <Button variant="ghost" onClick={reset}>
            reset
          </Button>
        </div>
      </div>
    </section>
  );
}
