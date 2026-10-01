import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

/** Lean ops console (Plan §01): approvals, zones, live exceptions, manual assign, refunds, support cases. */
function App() {
  const [metrics, setMetrics] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  useEffect(() => {
    fetch('/v1/metrics/pilot').then((r) => r.json()).then(setMetrics).catch(() => {});
  }, []);
  return (
    <div style={{ fontFamily: 'system-ui', padding: 24, maxWidth: 960 }}>
      <h1>Car Wash Ops Console (pilot)</h1>
      <p>Role-based access + audit trail required for sensitive actions (§02). All manual fixes need a reason.</p>
      <h2>Pilot metrics (§07)</h2>
      <pre>{JSON.stringify(metrics, null, 2)}</pre>
      <h2>Exception queue</h2>
      <p>Staffed during all bookable hours: unassigned, late, failed-payment, unsafe-site, damage (§05/§08).</p>
      <ul>
        <li>Pause zone / pause partner / manual recover booking — via API with <code>reason</code>.</li>
        <li>Example: <code>POST /v1/bookings/:id/transitions {"to":"reassigned","actor":"operator","reason":"..."}</code></li>
      </ul>
      <h2>Bookings (local demo)</h2>
      <p>Add booking IDs watched in this session:</p>
      <Watcher bookings={bookings} setBookings={setBookings} />
    </div>
  );
}

function Watcher({ bookings, setBookings }: any) {
  const [id, setId] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const load = async () => {
    const r = await fetch(`/v1/bookings/${id}`);
    setDetail(await r.json());
    if (!bookings.includes(id)) setBookings([...bookings, id]);
  };
  return (
    <div>
      <input value={id} onChange={(e) => setId(e.target.value)} placeholder="booking uuid" style={{ width: 320 }} />
      <button onClick={load}>Load</button>
      <pre>{JSON.stringify(detail, null, 2)}</pre>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
