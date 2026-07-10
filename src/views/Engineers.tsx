import type { Store } from "../App";
import { Pill } from "../components/ui";
import { daysUntil } from "../lib/compliance";

export default function Engineers({ store }: { store: Store }) {
  return (
    <>
      <h1>Certifying Staff</h1>
      <p className="subtitle">Part-66 licensed engineers and their certifying privileges</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Staff No.</th>
              <th>Licence No.</th>
              <th>Categories</th>
              <th>Type ratings</th>
              <th>Company auth</th>
              <th>Licence expiry</th>
            </tr>
          </thead>
          <tbody>
            {store.engineers.map((e) => {
              const d = daysUntil(e.licence_expiry);
              const expired = d !== null && d < 0;
              const soon = d !== null && d >= 0 && d <= 60;
              return (
                <tr key={e.id}>
                  <td><strong>{e.full_name}</strong></td>
                  <td className="muted">{e.staff_no}</td>
                  <td><code>{e.part66_licence_no}</code></td>
                  <td>
                    {e.licence_categories.map((c) => (
                      <Pill key={c} tone="info">{c}</Pill>
                    ))}
                  </td>
                  <td className="muted">{e.type_ratings.join(", ")}</td>
                  <td>{e.company_auth ? <Pill tone="ok">held</Pill> : <Pill tone="danger">none</Pill>}</td>
                  <td>
                    <Pill tone={expired ? "danger" : soon ? "warn" : "ok"}>
                      {new Date(e.licence_expiry).toLocaleDateString("en-GB")}
                      {expired ? " (expired)" : soon ? ` (${d}d)` : ""}
                    </Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
