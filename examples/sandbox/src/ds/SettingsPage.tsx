import { useState } from "react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { Switch } from "./Switch";
import { TextField } from "./TextField";
import "./SettingsPage.css";

/** A small product screen built only from the sandbox design system, for editing components beside real usage. */
export function SettingsPage() {
  const [notifications, setNotifications] = useState(true);
  const [digest, setDigest] = useState(false);
  const [terms, setTerms] = useState(true);
  return (
    <main className="settings-page">
      <div className="settings-page__inner">
        <header className="settings-page__header">
          <h1>Workspace settings</h1>
          <Badge tone="success">Pro plan</Badge>
        </header>
        <section className="settings-card">
          <h2>Profile</h2>
          <TextField label="Display name" placeholder="Ada Lovelace" />
          <TextField label="Email" placeholder="ada@example.com" invalid />
          <div className="settings-actions">
            <Button variant="tertiary">Cancel</Button>
            <Button variant="primary">Save changes</Button>
          </div>
        </section>
        <section className="settings-card">
          <h2>Notifications</h2>
          <div className="settings-row"><p>Product updates</p><Switch checked={notifications} onChange={setNotifications} /></div>
          <div className="settings-row"><p>Weekly digest</p><Switch checked={digest} onChange={setDigest} /></div>
          <Checkbox label="I agree to the Terms of Service" checked={terms} onChange={setTerms} />
        </section>
        <section className="settings-card">
          <div className="settings-row">
            <div>
              <h2>Delete workspace</h2>
              <p>This removes every project and cannot be undone.</p>
            </div>
            <Badge tone="critical">Danger</Badge>
          </div>
          <div className="settings-actions">
            <Button variant="secondary" size="sm">Export data</Button>
            <Button variant="critical" size="sm">Delete</Button>
          </div>
        </section>
      </div>
    </main>
  );
}
