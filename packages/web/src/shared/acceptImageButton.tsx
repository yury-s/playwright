/*
  Copyright (c) Microsoft Corporation.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

import * as React from 'react';
import { PatchSupport } from './patchSupport';
import type { ImageDiff } from './imageDiffView';

export const AcceptImageButton: React.FunctionComponent<{
  diff: ImageDiff,
}> = ({ diff }) => {
  const [status, setStatus] = React.useState<'ok'|'failed'|undefined>(undefined);
  async function doAccept() {
    let base64String: string | undefined = undefined;
    console.log('diff.actual?.attachment.path:', diff.actual?.attachment.path)
    if (diff.actual?.attachment.path && diff.actual?.attachment.path.startsWith('sha1')) {
      const response = await fetch(diff.actual?.attachment.path);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      base64String = await new Promise((fulfill, reject) => {
        reader.onloadend = function() {
          const base64String = (reader.result as string)
            .replace(/^data:.+;base64,/, ''); // Remove data URL scheme to get only the base64 string
          fulfill(base64String);
        };
        reader.onerror = reject;
      });
    }
    const result = await PatchSupport.instance().patchImage(diff.actual!.attachment.path!, base64String, diff.snapshotPath!);
    if (result)
      setStatus('ok');
    else
      setStatus('failed');
  }
  if (status === undefined)
    return <button onClick={
      event => {
        event.preventDefault();
        event.stopPropagation();
        doAccept();
      }
    }>accept image</button>
  if (status === 'ok')
    return <button disabled>Image Accepted</button>
  return <button disabled>Image FAILED</button>
}

