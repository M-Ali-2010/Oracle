import { useEffect, useState } from 'react';

type AdminOverview = { users: number; openEvents: number; totalBets: number; walletTransactions: number };

export default function AdminPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [form, setForm] = useState({ title: '', description: '', duration: '24h' });

  const load = async () => {
    const [o, u, e] = await Promise.all([
      fetch('/api/market/admin/overview').then((r) => r.json()),
      fetch('/api/market/admin/users').then((r) => r.json()),
      fetch('/api/market/events').then((r) => r.json()),
    ]);
    setOverview(o);
    setUsers(u);
    setEvents(e);
  };

  useEffect(() => {
    load();
  }, []);

  const createEvent = async () => {
    await fetch('/api/market/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, options: ['YES', 'NO'] }),
    });
    setForm({ title: '', description: '', duration: '24h' });
    await load();
  };

  const runAi = async () => {
    await fetch('/api/market/admin/ai/run', { method: 'POST' });
    await load();
  };

  return (
    <main style={{ background: '#060810', minHeight: '100vh', color: '#fff', padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Admin Panel</h1>
      <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        <div>Users: {overview?.users ?? 0}</div>
        <div>Open events: {overview?.openEvents ?? 0}</div>
        <div>Total bets: {overview?.totalBets ?? 0}</div>
        <div>Wallet tx: {overview?.walletTransactions ?? 0}</div>
      </div>

      <section style={{ marginTop: 24 }}>
        <h2>Create event</h2>
        <input placeholder="Title" value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} />
        <input placeholder="Description" value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />
        <select value={form.duration} onChange={(e) => setForm((s) => ({ ...s, duration: e.target.value }))}>
          <option value="1h">1h</option>
          <option value="24h">24h</option>
          <option value="7d">7d</option>
        </select>
        <button onClick={createEvent}>Create</button>
        <button onClick={runAi} style={{ marginLeft: 8 }}>Run AI</button>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Events</h2>
        {events.map((event) => <div key={event.id}>{event.title} - {event.status}</div>)}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Users & balances</h2>
        {users.map((user) => <div key={user.id}>{user.username} - ${Number(user?.wallet?.balance ?? 0).toFixed(2)}</div>)}
      </section>
    </main>
  );
}
