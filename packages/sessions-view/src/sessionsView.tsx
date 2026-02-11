/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from 'react';
import './sessionsView.css';
import { SessionPanel } from './sessionPanel';
import type { SessionInfo } from './sessionPanel';

export const SessionsView: React.FC = () => {
  const [sessions, setSessions] = React.useState<SessionInfo[]>([]);
  const [focusedSession, setFocusedSession] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    const fetchSessions = async () => {
      try {
        const response = await fetch('/api/sessions');
        if (!response.ok)
          return;
        const data: SessionInfo[] = await response.json();
        if (active)
          setSessions(data);
      } catch {
        // Ignore fetch errors.
      }
    };

    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return (<>
    <div className='sessions-header'>
      <span className='sessions-header-title'>Playwright Sessions</span>
      <span className='sessions-header-count'>{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
    </div>
    {sessions.length === 0 ? (
      <div className='sessions-empty'>
        <div>No active sessions</div>
        <div className='sessions-empty-hint'>Start a session with: playwright-cli open</div>
      </div>
    ) : (
      <div className='sessions-grid'>
        {sessions.map(session => (
          <SessionPanel
            key={session.name + ':' + session.workspace}
            session={session}
            focused={focusedSession === session.name + ':' + session.workspace}
            onFocus={() => setFocusedSession(session.name + ':' + session.workspace)}
            onBlur={() => {
              if (focusedSession === session.name + ':' + session.workspace)
                setFocusedSession(null);
            }}
          />
        ))}
      </div>
    )}
  </>);
};
