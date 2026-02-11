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
import { DevToolsTransport } from './transport';

type TabInfo = { id: string; title: string; url: string };

export type SessionInfo = {
  name: string;
  workspace: string;
  browser: string;
  devtoolsUrl: string;
  status: string;
};

export const SessionPanel: React.FC<{
  session: SessionInfo;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
}> = ({ session, focused, onFocus, onBlur }) => {
  const [connectionStatus, setConnectionStatus] = React.useState<string>('connecting');
  const [tabs, setTabs] = React.useState<TabInfo[]>([]);
  const [selectedPageId, setSelectedPageId] = React.useState<string | undefined>();
  const [url, setUrl] = React.useState('');
  const [frameSrc, setFrameSrc] = React.useState('');
  const [captured, setCaptured] = React.useState(false);
  const [hintVisible, setHintVisible] = React.useState(false);

  const transportRef = React.useRef<DevToolsTransport | null>(null);
  const displayRef = React.useRef<HTMLImageElement>(null);
  const screenRef = React.useRef<HTMLDivElement>(null);
  const viewportSizeRef = React.useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const capturedRef = React.useRef(false);
  const moveThrottleRef = React.useRef(0);

  React.useEffect(() => {
    capturedRef.current = captured;
  }, [captured]);

  React.useEffect(() => {
    if (!session.devtoolsUrl)
      return;
    const wsUrl = session.devtoolsUrl.replace(/^http/, 'ws') + '/ws';
    const transport = new DevToolsTransport(wsUrl);
    transportRef.current = transport;

    transport.onopen = () => setConnectionStatus('connected');

    transport.onevent = (method: string, params: any) => {
      if (method === 'selectPage')
        setSelectedPageId(params.pageId);
      if (method === 'frame') {
        setFrameSrc('data:image/jpeg;base64,' + params.data);
        if (params.viewportWidth)
          viewportSizeRef.current.width = params.viewportWidth;
        if (params.viewportHeight)
          viewportSizeRef.current.height = params.viewportHeight;
      }
      if (method === 'url')
        setUrl(params.url);
      if (method === 'tabs')
        setTabs(params.tabs);
    };

    transport.onclose = () => setConnectionStatus('disconnected');

    return () => transport.close();
  }, [session.devtoolsUrl]);

  // Release capture when panel loses focus.
  React.useEffect(() => {
    if (!focused && captured)
      setCaptured(false);
  }, [focused, captured]);

  function imgCoords(e: React.MouseEvent): { x: number; y: number } {
    const { width: vw, height: vh } = viewportSizeRef.current;
    if (!vw || !vh)
      return { x: 0, y: 0 };
    const display = displayRef.current;
    if (!display)
      return { x: 0, y: 0 };
    const rect = display.getBoundingClientRect();
    const imgAspect = display.naturalWidth / display.naturalHeight;
    const elemAspect = rect.width / rect.height;
    let renderW: number, renderH: number, offsetX: number, offsetY: number;
    if (imgAspect > elemAspect) {
      renderW = rect.width;
      renderH = rect.width / imgAspect;
      offsetX = 0;
      offsetY = (rect.height - renderH) / 2;
    } else {
      renderH = rect.height;
      renderW = rect.height * imgAspect;
      offsetX = (rect.width - renderW) / 2;
      offsetY = 0;
    }
    const fracX = (e.clientX - rect.left - offsetX) / renderW;
    const fracY = (e.clientY - rect.top - offsetY) / renderH;
    return {
      x: Math.round(fracX * vw),
      y: Math.round(fracY * vh),
    };
  }

  const BUTTONS: string[] = ['left', 'middle', 'right'];

  function onScreenMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    onFocus();
    screenRef.current?.focus();
    if (!capturedRef.current) {
      setCaptured(true);
      setHintVisible(false);
      return;
    }
    const { x, y } = imgCoords(e);
    transportRef.current?.sendNoReply('mousedown', { x, y, button: BUTTONS[e.button] || 'left' });
  }

  function onScreenMouseUp(e: React.MouseEvent) {
    if (!capturedRef.current)
      return;
    e.preventDefault();
    const { x, y } = imgCoords(e);
    transportRef.current?.sendNoReply('mouseup', { x, y, button: BUTTONS[e.button] || 'left' });
  }

  function onScreenMouseMove(e: React.MouseEvent) {
    if (!capturedRef.current)
      return;
    const now = Date.now();
    if (now - moveThrottleRef.current < 32)
      return;
    moveThrottleRef.current = now;
    const { x, y } = imgCoords(e);
    transportRef.current?.sendNoReply('mousemove', { x, y });
  }

  function onScreenWheel(e: React.WheelEvent) {
    if (!capturedRef.current)
      return;
    e.preventDefault();
    transportRef.current?.sendNoReply('wheel', { deltaX: e.deltaX, deltaY: e.deltaY });
  }

  function onScreenKeyDown(e: React.KeyboardEvent) {
    if (!capturedRef.current)
      return;
    e.preventDefault();
    if (e.key === 'Escape' && !(e.metaKey || e.ctrlKey)) {
      setCaptured(false);
      return;
    }
    transportRef.current?.sendNoReply('keydown', { key: e.key });
  }

  function onScreenKeyUp(e: React.KeyboardEvent) {
    if (!capturedRef.current)
      return;
    e.preventDefault();
    transportRef.current?.sendNoReply('keyup', { key: e.key });
  }

  function onScreenBlur() {
    if (capturedRef.current)
      setCaptured(false);
    onBlur();
  }

  const statusClass = connectionStatus === 'connected' ? 'connected' : connectionStatus === 'disconnected' ? 'error' : '';

  return (
    <div className={'session-panel' + (focused ? ' focused' : '')}>
      <div className='session-panel-header'>
        <span className='session-panel-name'>{session.name}</span>
        {session.browser && <span className='session-panel-browser'>{session.browser}</span>}
        <span className='session-panel-url'>{url}</span>
        <span className={'session-panel-status ' + statusClass}>{connectionStatus}</span>
      </div>
      {tabs.length > 0 && (
        <div className='session-panel-tabs'>
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={'session-panel-tab' + (tab.id === selectedPageId ? ' active' : '')}
              title={tab.url || ''}
              onClick={() => transportRef.current?.sendNoReply('selectTab', { id: tab.id })}
            >
              {tab.title || 'New Tab'}
            </div>
          ))}
        </div>
      )}
      <div
        ref={screenRef}
        className={'session-panel-screen' + (captured ? ' captured' : '')}
        tabIndex={0}
        onMouseDown={onScreenMouseDown}
        onMouseUp={onScreenMouseUp}
        onMouseMove={onScreenMouseMove}
        onWheel={onScreenWheel}
        onKeyDown={onScreenKeyDown}
        onKeyUp={onScreenKeyUp}
        onBlur={onScreenBlur}
        onContextMenu={e => e.preventDefault()}
        onMouseEnter={() => {
          if (!capturedRef.current)
            setHintVisible(true);
        }}
        onMouseLeave={() => setHintVisible(false)}
      >
        {frameSrc ? (
          <img ref={displayRef} className='session-panel-display' alt='screencast' src={frameSrc}/>
        ) : (
          <div className='session-panel-display' style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)', fontSize: '12px' }}>
            {connectionStatus === 'connecting' ? 'Connecting...' : connectionStatus === 'disconnected' ? 'Disconnected' : 'Waiting for frame...'}
          </div>
        )}
        <div className={'session-panel-hint' + (hintVisible ? ' visible' : '')}>Click to interact &middot; Esc to release</div>
      </div>
    </div>
  );
};
